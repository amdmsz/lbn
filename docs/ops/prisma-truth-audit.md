# Prisma Truth Audit

更新时间：2026-04-18

本文记录这次仓库内的 Prisma 真相审计。结论只基于仓库代码、现有脚本、已有事故信息和本地可读证据，不直接假设真实生产库已经与仓库完全一致。

## 1. 审计范围

本次审计覆盖：

- `prisma/schema.prisma`
- `prisma.config.ts`
- `prisma/migrations/*`
- `scripts/prisma-guardrails.mjs`
- `scripts/prisma-baseline-draft.mjs`
- `scripts/release-preflight.sh`
- `scripts/deploy-update.sh`
- `scripts/reconcile-prisma-migration-baseline.mjs`
- `docs/deployment-baseline.md`
- `docs/staging-checklist.md`
- `docs/prisma-migration-rebaseline.md`

本次不做：

- 直接连接真实生产库做结构扫描
- 直接替换现有 migration 历史
- 为了迁移去改业务 schema 语义

## 2. 当前 schema.prisma 概览

当前仓库的 Prisma datamodel 事实：

- 1 个 MySQL datasource
- 53 个 model
- 70 个 enum
- 支撑表里已经有多处显式映射，例如 `teams`、`team_public_pool_settings`、`recycle_bin_entries`、`user_permission_grants`、`lead_import_batches`
- 但核心模型仍大多没有显式 `@@map`，包括：
  - `User`
  - `Role`
  - `Lead`
  - `Customer`
  - `TradeOrder`
  - `SalesOrder`
  - `Order`
  - `OperationLog`
  - `PaymentPlan`
  - `PaymentRecord`
  - `ShippingTask`

这说明当前仓库对核心物理表名仍有隐含假设，而不是完全显式写死。

## 3. prisma.config.ts 现状

当前 `prisma.config.ts` 已处理一类正式环境事故：

- `SHADOW_DATABASE_URL` 为空时，不再把空字符串传给 Prisma
- 只有 `SHADOW_DATABASE_URL` 非空时才传 `shadowDatabaseUrl`
- 仍保留“shadow 不能与主库相同”的硬校验

这已经修复了正式环境里 `shadowDatabaseUrl=""` 导致的 `P1013`，但它没有自动解决“真实数据库结构与 migration 历史漂移”的问题。

## 4. 当前 migration 历史概览

当前正式 migration 目录共有 10 条：

1. `20260407224500_rebuild_current_schema_baseline`
2. `20260408153000_add_user_permission_grants`
3. `20260409190000_add_async_lead_import_queue_fields`
4. `20260409220000_add_imported_customer_deletion_requests`
5. `20260410113000_add_lead_import_batch_rollbacks`
6. `20260414074446_add_recycle_bin_entry_baseline`
7. `20260414165628_add_lead_recycle_bin_support`
8. `20260415103340_add_trade_order_recycle_bin`
9. `20260416103000_add_customer_recycle_bin`
10. `20260416190447_recycle_dual_terminal_foundation`

### 4.1 baseline 的仓库证据

`20260407224500_rebuild_current_schema_baseline` 在仓库里直接创建了大量 legacy / lowercase 物理表名，例如：

- `user`
- `lead`
- `customer`
- `tradeorder`
- `salesorder`
- `operationlog`
- `paymentplan`
- `paymentrecord`
- `shippingtask`

同时也混有 snake_case 支撑表，例如：

- `lead_import_batches`
- `lead_import_rows`
- `customer_tags`
- `lead_tags`

结论：baseline SQL 本身就不是一套完全统一的物理命名体系。

### 4.2 recycle 增量链的仓库证据

`20260414074446_add_recycle_bin_entry_baseline` 当前已被收口为只创建 `recycle_bin_entries`，不再混入 `Lead/lead`、`User/user` 大小写敏感修补动作。

这说明仓库已经吸收了一部分正式环境事故教训，但不能反推“所有正式环境的真实结构都与当前 migration 历史完全一致”。

## 5. 当前发布链如何处理 Prisma

### 5.1 仓库内推荐入口

当前仓库已提供统一入口：

- `npm run prisma:status`
- `npm run prisma:diff:schema`
- `npm run prisma:diff:migrations`
- `npm run prisma:predeploy:check`
- `npm run prisma:deploy:safe`
- `npm run prisma:baseline:plan`
- `npm run prisma:baseline:draft`

其中：

- `prisma:predeploy:check` 负责发布前状态与差异检查
- `prisma:deploy:safe` 负责正式 deploy 前后的安全链路
- `prisma:baseline:*` 只做 baseline 重建准备，不触碰数据库

### 5.2 正式发布脚本链

当前正式发布链已收口到：

1. `scripts/deploy-update.sh`
2. `scripts/release-preflight.sh`
3. `scripts/prisma-guardrails.mjs`

当前行为：

- `release-preflight.sh` 在构建前执行 Prisma guardrails
- `deploy-update.sh` 在 `RUN_MIGRATE_DEPLOY=1` 时调用 `npm run prisma:deploy:safe -- --skip-generate`
- migrate 之后仍会执行 `npx prisma generate` 和 `npm run build`

这比“脚本里直接裸跑 `npx prisma migrate deploy`”更可审计，也让本地与服务器口径更接近。

## 6. 已发现的风险项

### 6.1 migration 历史可能无法完整代表真实生产终态

证据：

- 仓库已有 rebaseline 文档，说明旧链历史上已经不可稳定重放
- recycle baseline migration 曾在真实 Linux/MySQL 环境因为大小写与外键假设失败
- 用户提供过正式排障上下文，显示真实环境出现过 PascalCase 核心表名

结论：

- 不能把“当前这 10 条 migration”直接视为所有正式环境的完整真相

### 6.2 legacy 命名与逻辑命名混杂

证据：

- baseline SQL 明确存在 `user / lead / customer / tradeorder / salesorder`
- `schema.prisma` 的核心模型又以 `User / Lead / Customer / TradeOrder / SalesOrder` 的逻辑名存在
- 只有部分支撑表已显式 `@@map`

结论：

- 当前仓库仍存在核心命名债
- 但仅凭仓库证据，还不足以决定现在就把核心模型统一映射到 lowercase 或 PascalCase

### 6.3 生产热修后未回填 migration history 的风险真实存在

证据：

- 仓库内已有 `scripts/reconcile-prisma-migration-baseline.mjs`
- 这说明历史上已经发生过“真实数据库状态与 `_prisma_migrations` 元数据不一致”的场景

结论：

- 今后任何手工 SQL 都必须同日回填

### 6.4 发布链此前缺少统一前置检查

证据：

- 旧发布链容易只跑 `validate + migrate status`
- 没有统一的 schema-vs-database diff 入口
- Windows 本地和 Linux 服务器的 Prisma 命令习惯并不一致

结论：

- 没有统一入口时，团队会继续跑出两套行为

### 6.5 baseline 重建当前证据仍不足

结论：

- 当前已经足够做“baseline 重建准备”
- 但还不足以做“真正替换现有 migration 历史”

## 7. 为什么这轮没有直接改 schema.prisma

这轮没有强行给核心模型补 `@@map`，原因是证据不闭合：

- 仓库 baseline SQL 指向大量 lowercase 表名
- 真实生产事故上下文又暴露过 `User / Lead / Customer / TradeOrder / SalesOrder / Role` 这类 PascalCase 表

在没有真实生产库结构快照前，贸然补核心 `@@map`，很可能只是把当前隐含假设换成另一套隐含假设，并可能破坏现有运行环境。

因此当前更稳的策略是：

1. 先把风险和缺口写清楚
2. 先把审计脚本、发布脚本和 runbook 固定下来
3. 等真实生产库证据闭合后，再决定是否用 `@map / @@map / map:` 收口

## 8. baseline 重建准备的当前结论

当前结论是：

- 可以安全开始做 baseline 重建准备
- 不可以直接进入 baseline 重建切换

### 已经具备的仓库内证据

- 当前 schema 和 migration 历史可被系统化阅读
- 发布链已有 `status / diff / predeploy / safe deploy`
- 已有 baseline 重建方案文档
- 已有只生成草案、不改历史的 `prisma:baseline:draft`

### 仍然缺失的关键证据

- 真实生产库 introspection / schema dump
- 真实核心表名清单，尤其是 `User / Lead / Customer / TradeOrder / SalesOrder / Role`
- 真实索引名 / 外键名清单
- 真实 `_prisma_migrations` 快照
- 历史手工 SQL 热修记录

## 9. 建议的后续小里程碑

### 里程碑 1：生产库真实命名审计

目标：

- 拉出核心表、列、索引、外键的真实命名清单
- 判断是否应通过 `@map / @@map / map:` 吸收命名债

### 里程碑 2：_prisma_migrations 真相审计

目标：

- 核对正式环境 `_prisma_migrations`
- 标记所有历史 `resolve`、手工 SQL、失败后恢复点

### 里程碑 3：baseline 草案评审与 staging 演练

目标：

- 用 `npm run prisma:baseline:draft` 生成草案
- 在空库与 staging 克隆库验证 replay / resolve 路径

## 10. 本轮结论

本轮正确的收口不是“现在就重建 baseline”，而是：

1. 承认仓库内证据还不足以改核心映射
2. 先固定 Prisma 发布护栏
3. 先把 baseline 重建文档与草案生成器补齐
4. 等真实生产库证据闭合后，再进入真正的 baseline 切换窗口
