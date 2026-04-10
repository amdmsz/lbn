# LbnCrm

酒水私域销售团队内部 CRM。

当前仓库以 `Customer` 销售主线、`TradeOrder` 成交主单、`/products` 商品主入口、`/fulfillment` 履约主入口为准，不是泛 ERP，也不包含 PBX / 外呼能力。

## 文档入口

[AGENTS.md](./AGENTS.md) 是开发执行规则，改代码前先看。

[DESIGN.md](./DESIGN.md) 是视觉系统、页面层级、组件风格与 UI 重构约束。

[PRD.md](./PRD.md) 是产品真相，负责模型边界、角色边界和当前页面主视角。

[PLANS.md](./PLANS.md) 是当前里程碑和下一步计划。

[HANDOFF.md](./HANDOFF.md) 是历史切流、兼容信息和交接上下文。

[UI_ENTRYPOINTS.md](./UI_ENTRYPOINTS.md) 是 UI 主入口、兼容路由和高风险 CTA 说明。

如果只是第一次进入仓库，建议阅读顺序是：

`README.md -> AGENTS.md -> DESIGN.md -> PRD.md -> PLANS.md -> UI_ENTRYPOINTS.md`

如果任务涉及：

- UI / 结构 / 页面层级：先读 `DESIGN.md` 与 `UI_ENTRYPOINTS.md`
- 交易 / 履约 / 支付 / 商品主线：先读 `PRD.md`
- 历史切流 / 兼容路径：先读 `HANDOFF.md`

## 本地开发

安装依赖：

```bash
npm install

复制环境变量模板并填写本地值：

cp .env.example .env

Windows PowerShell:

Copy-Item .env.example .env

同步 migration 并生成 Prisma Client：

npx prisma migrate deploy
npx prisma generate

按需导入本地演示数据：

npm run db:seed

db:seed 只用于本地测试或演示，不用于 staging / production。

启动开发环境：

npm run dev

默认访问 http://localhost:3000。

常用校验
npx prisma validate
npx prisma generate
npm run lint
npm run build
当前仓库级原则
不把系统回退成旧 SalesOrder 主单认知
不随意重开 schema 改造
UI 重构必须遵循 DESIGN.md
页面主入口、兼容路由、hover / dropdown / empty-state 动作必须遵循 UI_ENTRYPOINTS.md
重要动作必须继续保留可追踪性
部署与历史文档

正式部署说明见 docs/deployment-baseline.md
。

staging 验收清单见 docs/staging-checklist.md
。

Prisma migration rebaseline 说明见 docs/prisma-migration-rebaseline.md
。

STAGE_FREEZE_*、HANDOFF_STEP* 等文件属于历史记录，默认不作为第一入口。