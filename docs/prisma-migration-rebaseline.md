# Prisma Migration Rebaseline

更新时间：2026-04-07

本文档说明 2026-04-07 这次 Prisma migration 技术债收口的背景、结果，以及已有环境如何接入新的 baseline。

## 1. 为什么要 rebaseline

旧的 `prisma/migrations` 存在一个根本问题：

- 目录顺序不可从空库完整重放
- 典型失败点是 `20260401001828_m13_transaction_collection_center`
- 该 migration 在目录顺序上早于 `SalesOrder` 所在 migration，但它又引用了 `SalesOrder`

结果是：

- 现有数据库可以跑，是因为历史上已经以另一顺序应用过这些 migration
- 但仓库本身的 migration 链并不干净，不能作为正式 replayable source of truth

## 2. 本次修复做了什么

### 新 baseline

新的正式 baseline migration 是：

```text
20260407224500_rebuild_current_schema_baseline
```

### 旧链归档

旧的不可重放链已经完整归档到：

```text
prisma/migrations_pre_rebaseline_20260407
```

它保留为历史审计资料，不再作为正式 replay 链。

## 3. 空库 / 新环境如何使用

新环境现在应直接使用：

```bash
npm run prisma:deploy:safe
```

然后再继续：

```bash
npm run admin:bootstrap -- --username admin --name "Platform Admin" --password "replace-with-strong-password"
```

## 4. 已有环境如何接入新 baseline

适用对象：

- 之前已经通过旧 migration 链或 `db push` 落过库
- 当前数据库结构已经与 `prisma/schema.prisma` 一致
- 但 `_prisma_migrations` 元数据还停留在旧链

### 第一步：先确认当前数据库和 schema 一致

```bash
npm run prisma:diff:schema
```

只有当这条命令返回 `0` 时，才可以继续做 baseline reconcile。

### 第二步：备份数据库

至少先做一份正式数据库备份。

### 第三步：执行 migration metadata reconcile

先 dry run：

```bash
npm run db:migration-baseline:reconcile
```

确认输出无误后再执行：

```bash
npm run db:migration-baseline:reconcile -- --apply
```

脚本会：

- 读取当前 `_prisma_migrations`
- 先写出 JSON 备份
- 清空旧 migration metadata
- 用 Prisma 官方 `migrate resolve --applied` 把新 baseline 标记为已应用

### 第四步：确认状态

```bash
npm run prisma:status
```

预期结果应该是：

- 本地 migration 历史与数据库一致
- 新 baseline 已应用
- 数据库 schema is up to date

## 5. 风险与边界

### 这次修复不做的事

- 不修改业务 schema 语义
- 不改业务表数据
- 不清理历史归档目录
- 不替你在正式服务器上实际执行 reconcile

### 这次修复真正改变的只有两件事

1. 仓库内的正式 migration source of truth 变干净了
2. 已有环境需要一次性的 migration metadata 对齐

## 6. 推荐后续工作流

完成 rebaseline 之后：

- 空库 / 新环境：优先用 `npm run prisma:deploy:safe`
- 后续 schema 变更：重新回到正常 Prisma migration 工作流

推荐命令：

```bash
npx prisma validate
npx prisma generate
npx prisma migrate dev --name <descriptive_name>
```

正式发布时：

```bash
npm run prisma:deploy:safe
```
