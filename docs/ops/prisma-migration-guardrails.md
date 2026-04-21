# Prisma Migration Guardrails

更新时间：2026-04-18

这份守则只处理 Prisma migration、真实数据库结构和正式发布链，不改业务语义。

## 1. 风险来源

Prisma 相关事故，本质上都来自三份“真相”偏离：

1. `prisma/schema.prisma`
2. `prisma/migrations/*`
3. 真实数据库结构与 `_prisma_migrations`

只要三者有一份漂移，正式发布时就可能出问题。典型风险包括：

- `schema.prisma` 已改，但没有对应 migration。
- migration 能在本地空库重放，但解释不了某个历史生产库。
- 生产做了手工 SQL 热修，却没有同日回填 `schema.prisma`、migration 和 `migrate resolve` 记录。
- Linux + MySQL 表名大小写敏感，migration 假设的物理表名与真实库不一致。
- 发布前只跑了 `prisma validate` / `generate`，没有做状态与差异检查。

## 2. 生产与预发允许 / 禁止的 Prisma 命令

### 允许

- `npx prisma validate`
- `npx prisma generate`
- `npx prisma migrate status`
- `npx prisma migrate deploy`
- `npx prisma migrate resolve`
- `npx prisma migrate diff`

### 禁止

- `npx prisma migrate dev`
- `npx prisma migrate reset`
- 把 `npx prisma db push` 当正式发布手段
- 任何“先手工改库，之后再说”的无记录操作

### 仓库内推荐入口

- `npm run prisma:status`
- `npm run prisma:diff:schema`
- `npm run prisma:diff:migrations`
- `npm run prisma:predeploy:check`
- `npm run prisma:deploy:safe`
- `npm run prisma:baseline:plan`
- `npm run prisma:baseline:draft`

说明：

- `prisma:baseline:*` 只做方案与草案，不会碰数据库。
- `prisma:deploy:safe` 是正式发布时的推荐入口，会先检查、再 deploy、再回查。

## 3. 发布前检查清单

正式发布前至少执行：

```bash
npx prisma validate
npm run prisma:status
npm run prisma:diff:schema
```

如果这次发布包含 migration，或你怀疑 migration 历史已经不能完整解释真实数据库，再执行：

```bash
npm run prisma:diff:migrations
```

通过标准：

- `prisma:status` 没有 failed migrations
- `prisma:diff:schema` 返回 0
- 需要做历史审计时，`prisma:diff:migrations` 返回 0

如果这次发布明确要执行 migration，优先使用：

```bash
npm run prisma:deploy:safe
```

它会做三件事：

1. 先做允许 pending migration 的预检查
2. 执行 `migrate deploy`
3. 再做一轮严格检查，确认数据库已回到稳定状态

## 4. 手工 SQL 热修后的回填流程

手工 SQL 热修不是禁区，但不能成为长期真相。

同日必须补回：

1. 记录热修原因、执行时间、执行人、目标环境。
2. 把结构差异补回 `prisma/schema.prisma`。
3. 补一条可审计的 migration，明确表达这次热修。
4. 视情况补 `prisma migrate resolve --applied` 或 `--rolled-back` 说明，让 `_prisma_migrations` 与真实状态对齐。
5. 重新执行 `npm run prisma:diff:schema`。
6. 如果已配 `SHADOW_DATABASE_URL`，再执行 `npm run prisma:diff:migrations`。

不接受以下长期状态：

- 线上已改，仓库没记
- migration 失败过，但 `_prisma_migrations` 没恢复到可解释状态
- 下一位接手人只能靠猜

## 5. baseline 重建何时需要，何时不能贸然做

### 可以考虑重建 baseline 的信号

- 多个正式环境都无法再被当前 migration 历史准确解释
- `prisma/migrations` 已经不能稳定代表真实生产终态
- 每次发布都要依赖额外手工 SQL 或大量 `migrate resolve`
- 已完成真实数据库结构审计、`_prisma_migrations` 审计和 staging 演练

### 不能贸然重建 baseline 的情况

- 只是某一条 migration 写坏了，但可以增量修复
- 还没有审计清楚真实生产库结构
- 还没有拿到 `_prisma_migrations` 快照
- 想用“重建 baseline”替代热修回填
- 没有备份、没有冻结窗口、没有回滚点

baseline 重建不是文档动作，而是一次真相切换。没有证据闭合前，不要动。

## 6. shadow database 什么时候需要，怎么配

`npm run prisma:diff:schema` 不需要 shadow database，它只比较：

- 当前 datasource
- `prisma/schema.prisma`

`npm run prisma:diff:migrations` 需要 shadow database，因为它会把 `prisma/migrations` 重放到一套独立库，再和目标 datasource 比较。

### 什么时候必须配 shadow database

- 你要判断 migration 历史还能不能完整代表真实数据库
- 你要审计热修是否已补回 migration history
- 你要为未来 baseline 重建收集证据

### 配置原则

- `SHADOW_DATABASE_URL` 必须指向独立、可清空、不可与业务库复用的 MySQL 库
- 不能与 `DATABASE_URL` 相同
- 不能拿生产正式库兼做 shadow database

如果没有 `SHADOW_DATABASE_URL`：

- `npm run prisma:diff:migrations` 必须直接报错并给出指引
- 发布前仍然至少要执行 `npm run prisma:status` 和 `npm run prisma:diff:schema`

## 7. 推荐处理顺序

Prisma 发布链出问题时，按这个顺序排查：

1. 确认 `DATABASE_URL` 是否指向正确环境
2. `npm run prisma:status`
3. `npm run prisma:diff:schema`
4. 如已配 shadow database，再跑 `npm run prisma:diff:migrations`
5. 检查最近是否有手工 SQL 热修但未回填
6. 最后才讨论是否进入 baseline 重建方案

不要一上来就重写 migration 历史。
