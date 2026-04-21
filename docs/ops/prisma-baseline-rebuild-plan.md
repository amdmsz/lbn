# Prisma Baseline Rebuild Plan

更新时间：2026-04-18

这是一份“准备执行”的方案文档，不代表本轮已经开始 baseline 重建，也不代表可以跳过真实生产库审计。

## 1. 适用前提

只有同时满足以下条件，才进入 baseline 重建窗口：

1. 已拿到真实生产库结构证据：
   - schema dump 或 introspection 快照
   - 核心表 / 列 / 索引 / 外键清单
   - `_prisma_migrations` 快照
2. 已确认当前 `prisma/migrations` 不能稳定代表真实正式终态。
3. 已冻结新的 schema 变更和手工 SQL 热修。
4. 已准备好数据库备份、代码回滚点和 staging 演练窗口。

如果只是某一条 migration 有问题，或只是一次热修未回填，不应该直接进入 baseline 重建。

## 2. 风险说明

baseline 重建的风险不是“SQL 写错一点”，而是“Prisma source of truth 切换”：

- 新环境 replay 失败
- 老环境 `_prisma_migrations` 无法安全接入
- `schema.prisma`、新 baseline、真实数据库三者仍不一致
- 未记录的手工 SQL 被永久遗失

因此这项工作必须满足三个原则：

1. 先审计，后起草
2. 先演练，后切换
3. 先保留旧历史，后讨论归档

## 3. 这轮已经做了什么

当前仓库已经具备两项准备能力：

- `npm run prisma:baseline:plan`
  - 只输出当前 baseline 准备入口和文档位置
- `npm run prisma:baseline:draft`
  - 只读取 `prisma/schema.prisma`
  - 在 `prisma/baseline-drafts/` 下生成本地草案目录
  - 不覆盖 `prisma/migrations`
  - 不执行 `migrate deploy`
  - 不执行 `migrate resolve`
  - 不写任何数据库

## 4. 如何备份现有 prisma/migrations

正式进入 baseline 重建窗口前，先备份现有 migration 历史，不要直接删。

推荐做法：

### 4.1 Git 侧冻结

```bash
git checkout -b chore/prisma-baseline-rebuild-prep
git tag prisma-pre-baseline-rebuild-<date>
```

### 4.2 文件级备份

任选其一：

```bash
cp -R prisma/migrations prisma/migrations_backup_<date>
```

或：

```bash
tar -czf backups/prisma-migrations-<date>.tar.gz prisma/migrations
```

要求：

- 备份目录不能覆盖当前 `prisma/migrations`
- 备份时间点要与数据库备份时间点对应
- 备份时要记录当前 commit SHA

## 5. 如何生成新的 0_init baseline 草案

先只生成草案，不直接替换历史。

### 5.1 生成草案

```bash
npm run prisma:baseline:draft -- --name 0_init
```

默认会生成：

```text
prisma/baseline-drafts/<timestamp>_0_init/
  ├─ migration.sql
  └─ README.md
```

也可以显式指定目录：

```bash
npm run prisma:baseline:draft -- --name 0_init --output-dir prisma/baseline-drafts/review_0_init
```

### 5.2 草案用途

这份草案只用于：

- 审阅 SQL 规模
- 对照真实生产库结构做差异检查
- 为空库 replay 演练做准备

这份草案不能直接当正式 migration 使用，除非后续在受控窗口中通过评审并显式转入新的正式 baseline 目录。

## 6. 何时才把草案转成正式 baseline

只有在以下条件都成立后，才允许把草案转成正式 baseline migration：

1. 真实生产库证据已经闭合
2. 必要的 `@map / @@map / map:` 已经审定完成
3. 空库 replay 已通过
4. staging 克隆库的老环境接入演练已通过
5. 已明确老环境的 `migrate resolve --applied` 路径

在这之前，草案只能待在 `prisma/baseline-drafts/`。

## 7. 生产环境如何用 migrate resolve --applied 标记 baseline

这一步只在正式切换窗口中执行，不在本轮执行。

前提：

- 当前数据库结构已经与“准备切换后的 schema.prisma”一致
- 当前 `_prisma_migrations` 的历史状态已审计
- 已完成数据库备份

示例命令：

```bash
npx prisma migrate resolve --applied <new_baseline_migration_name>
```

典型顺序：

1. 先执行数据库备份和 `_prisma_migrations` 备份
2. 确认 `npm run prisma:diff:schema` 返回 0
3. 如有需要，确认 `npm run prisma:diff:migrations` 的结果已被审阅并可解释
4. 在维护窗口内执行 `migrate resolve --applied`
5. 立刻执行 `npm run prisma:status`

注意：

- `resolve --applied` 只处理 migration metadata，不会自动帮你修真实结构
- 如果真实结构与 schema 还没对齐，`resolve` 只会把问题藏起来

## 8. 如何验证 schema / migrations / database 三者一致

baseline 切换前后都要做三类验证。

### 8.1 schema 与 database

```bash
npm run prisma:diff:schema
```

预期：返回 0。

### 8.2 migrations 与 database

前提：已配置独立的 `SHADOW_DATABASE_URL`

```bash
npm run prisma:diff:migrations
```

预期：返回 0。

### 8.3 新 baseline 的空库 replay

在隔离的空库上验证：

```bash
npm run prisma:deploy:safe
```

预期：

- replay 成功
- `npm run prisma:status` 显示 up to date
- `npm run prisma:diff:schema` 返回 0

### 8.4 老环境接入验证

在 staging 克隆库上验证：

1. baseline 前的数据库结构能否被当前 schema 正确解释
2. `migrate resolve --applied` 路径是否可执行
3. 接入后 `npm run prisma:status`、`npm run prisma:diff:schema` 是否恢复为稳定状态

## 9. 回滚与止损建议

如果 baseline 重建演练或正式切换失败，先止损，不要硬顶。

最低止损顺序：

1. 停止继续执行新的 `resolve` / `deploy`
2. 回到切换前的 Git commit / tag
3. 恢复数据库备份
4. 恢复 `_prisma_migrations` 备份
5. 重新执行：

```bash
npm run prisma:status
npm run prisma:diff:schema
```

如已配 shadow database，再执行：

```bash
npm run prisma:diff:migrations
```

只有三方重新回到可解释状态后，才允许继续下一轮演练。

## 10. 当前判断

当前仓库已经足够进入“baseline 重建准备”，但还不够进入“baseline 重建切换”。

### 已经具备

- Prisma 发布护栏
- baseline 重建方案文档
- baseline 草案生成器
- 正式发布脚本已统一到安全入口

### 仍然缺失

- 真实生产库 introspection / schema dump
- 真实核心表名清单
- 真实索引名 / 外键名清单
- 真实 `_prisma_migrations` 快照
- 历史手工 SQL 热修记录

因此当前正确动作是：

1. 继续收集真实生产库证据
2. 用草案目录做评审
3. 等证据闭合后，再决定是否真的替换 migration 历史
