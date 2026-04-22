# AGENTS.md

## 1. 项目定位

本仓库是酒水私域销售团队的内部 CRM，不是通用 ERP。

当前主线以 `Customer` 销售执行、`TradeOrder` 成交主单、`/products` 商品主入口、`/fulfillment` 履约主入口为准。

目标是稳定支撑 `lead intake -> customer operations -> order -> payment -> fulfillment -> auditability` 这条业务链。

## 2. 开发前必读

先看 [README.md](./README.md)，它负责仓库入口、本地启动和常用命令。

大改前看 [PRD.md](./PRD.md)，它负责产品真相、角色边界和主线模型。

开启新阶段或继续 milestone 前看 [PLANS.md](./PLANS.md)。

接手历史模块、切流、兼容路径时看 [HANDOFF.md](./HANDOFF.md)。

改代码前先读当前模块和现有实现，不要假设仓库是空白状态。

复杂任务先给方案；简单修复可直接改，但仍要先调研。

## 3. 核心业务边界

`Lead` 只做导入、去重、分配、审核；销售执行主对象是 `Customer`。

`Customer.ownerId` 是销售承接主字段；Sales 主要在 `/customers` 工作，不回到 `/leads` 主线。

`TradeOrder` 是成交主单；`SalesOrder` 是 supplier 子单，不再作为交易真相。

支付真相在 `PaymentPlan / PaymentRecord / CollectionTask`，不要退回单一 payment status 思路。

履约真相在 `ShippingTask / ShippingExportBatch / LogisticsFollowUpTask / CodCollectionRecord`，不要让订单层或支付层抢真相。

商品域一级入口是 `/products`；supplier 管理在 `/products?tab=suppliers`，不是新的一级工作台。

`OPS` 和 `SHIPPER` 不自动继承销售客户视图；跨角色可见性必须显式设计。

重要动作必须保留 `OperationLog`。

新业务不要继续写 legacy `Order`；不要扩展 legacy `ShippingTask.orderId` 写路径。

保持 `product / transaction / payment / fulfillment / finance` 分层，不要重新混成一个大流程。

## 4. 实施规则

保持 KISS，优先做简单、可维护、可回滚的增量改造。

先复用现有模式，再考虑新抽象；不要无故重写稳定模块。

不引入不必要依赖；数据库建模统一走 Prisma。

RBAC 必须落在服务端，不能只靠菜单隐藏或前端禁用按钮。

变更涉及权限、所有权、审核、支付、履约、导入、删除时，先确认审计链是否完整。

前端或共享运行时不要直接依赖 Prisma enum 对象；页面选项和值校验优先用本地常量。

改 schema 时先增量兼容，再切流，再清理；切流未完成前不要删旧字段、旧表、旧写路径。

页面改动要保留 loading / empty / error 状态。

## 5. Prisma migration 与生产数据库操作守则

生产与预发禁止使用 `prisma migrate dev`、`prisma migrate reset`，也不要把 `prisma db push` 当成正式发布手段。

生产与预发只允许使用 `prisma migrate deploy`、`prisma migrate status`、`prisma migrate resolve`，并且要先确认 `DATABASE_URL` 指向目标环境。

发布前至少执行：

```bash
npm run prisma:predeploy:check
```

正式发布或预发更新前，统一先执行：

```bash
bash scripts/release-preflight.sh
```

不要用裸 `npm install`、`--omit=dev` 或只装 production dependencies 的方式代替正式构建安装；当前仓库的 build 依赖 `devDependencies` 中的 Tailwind/PostCSS/TypeScript/ESLint 链路。

如果要核对 migration 历史是否仍能代表真实数据库结构，再执行：

```bash
npm run prisma:diff:migrations
```

任何手工 SQL 热修都不能直接成为长期真相；必须在同日补回：

- `prisma/schema.prisma`
- 对应 `prisma/migrations/*`
- `migrate resolve --applied / --rolled-back` 或等价的人工执行说明
- 变更背景、执行时间、影响范围

遇到 legacy 表名、列名、索引名与 Prisma 逻辑命名不一致时，优先评估 `@map`、`@@map`、`map:` 是否能吸收命名债，不要先假设可以直接重命名真实生产表。

涉及权限、删除、批量动作、支付、履约、导入、回收站等高风险改动时，除了 schema / migration 记录，还要确认 `OperationLog` 或现有审计链没有被破坏。

## 6. 交付标准

完成前至少确认：代码能编译、权限正确、审计不丢、当前销售主线不回退。

常用校验命令如下：

```bash
npx prisma validate
npx prisma generate
npm run lint
npm run build
```

涉及 schema 变更时，同时补 migration、backfill、seed 建议或命令。

Done 标准是：与 [PRD.md](./PRD.md) 和 [PLANS.md](./PLANS.md) 对齐；不破坏 `Customer` 主线和 `TradeOrder` 主单基线；不把 payment / fulfillment 真相重新混用；重要动作仍可追踪。

## 7. 文档分工

[README.md](./README.md) 负责仓库入口、启动方式、常用命令。

[PRD.md](./PRD.md) 负责产品真相、模型与角色边界。

[PLANS.md](./PLANS.md) 负责当前里程碑与下一步计划。

[HANDOFF.md](./HANDOFF.md) 负责历史切流、兼容信息和交接上下文。

[UI_ENTRYPOINTS.md](./UI_ENTRYPOINTS.md) 负责 UI 入口和兼容路由说明。

`STAGE_FREEZE_*`、`HANDOFF_STEP*` 等文件属于历史记录，默认不作为第一真相。
