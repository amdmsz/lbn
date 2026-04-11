# LbnCrm

酒水私域销售团队内部 CRM。

当前仓库以 `Customer` 销售主线、`TradeOrder` 成交主单、`/products` 商品主入口、`/fulfillment` 履约主入口为准，不是泛 ERP，也不包含 PBX / 外呼能力。

## 文档入口

[AGENTS.md](./AGENTS.md) 是开发执行规则，改代码前先看。

[DESIGN.md](./DESIGN.md) 是视觉系统、页面层级、组件风格与 UI 重构约束。

[PRD.md](./PRD.md) 是产品真相，负责模型边界、角色边界和当前页面主视角。

[PLANS.md](./PLANS.md) 是当前里程碑和下一步计划。

[HANDOFF.md](./HANDOFF.md) 是历史切流、兼容信息、运行时基线和交接上下文。

[UI_ENTRYPOINTS.md](./UI_ENTRYPOINTS.md) 是 UI 主入口、兼容路由和高风险 CTA 说明。

如果只是第一次进入仓库，建议阅读顺序是：

`README.md -> AGENTS.md -> DESIGN.md -> PRD.md -> PLANS.md -> UI_ENTRYPOINTS.md`

如果任务涉及：

- UI / 结构 / 页面层级：先读 `DESIGN.md` 与 `UI_ENTRYPOINTS.md`
- 交易 / 履约 / 支付 / 商品主线：先读 `PRD.md`
- 历史切流 / 兼容路径 / worker 运行基线：先读 `HANDOFF.md`

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

启动 Web 开发环境：

npm run dev

默认访问 http://localhost:3000。

异步导入 / worker / Redis

当前仓库的线索导入已经支持异步处理基线：

Web 进程负责创建导入批次并入队
Redis 作为队列连接依赖
worker:lead-imports 负责消费导入任务并在后台处理批次

如果你要联调或使用异步导入，除了 Web 进程外，还需要：

1. 启动 Redis

确保本机或环境内有可用 Redis，并配置：

REDIS_URL=redis://127.0.0.1:6379
2. 启动 lead import worker
npm run worker:lead-imports
3. 可选环境变量

当前导入队列支持这些可选变量：

LEAD_IMPORT_CHUNK_SIZE=20
LEAD_IMPORT_WORKER_CONCURRENCY=1
LEAD_IMPORT_JOB_ATTEMPTS=3

默认值分别为：

LEAD_IMPORT_CHUNK_SIZE=20
LEAD_IMPORT_WORKER_CONCURRENCY=1
LEAD_IMPORT_JOB_ATTEMPTS=3
4. 本地最小联调方式

最小联调通常需要两个进程：

终端 A：

npm run dev

终端 B：

npm run worker:lead-imports

如果未配置 REDIS_URL 或未启动 worker，异步导入链路无法完整工作。

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
异步导入基线要求 Web 进程、Redis、worker 三者链路一致
重要动作必须继续保留可追踪性
部署与历史文档

正式部署说明见 docs/deployment-baseline.md
。

staging 验收清单见 docs/staging-checklist.md
。

Prisma migration rebaseline 说明见 docs/prisma-migration-rebaseline.md
。

STAGE_FREEZE_*、HANDOFF_STEP* 等文件属于历史记录，默认不作为第一入口。