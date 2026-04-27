# LbnCrm

酒水私域销售团队内部 CRM。

当前仓库以 `Customer` 销售主线、`TradeOrder` 成交主单、`/products` 商品主入口、`/fulfillment` 履约主入口为准，不是泛 ERP，也不包含 PBX / 外呼能力。

## 文档入口

- [AGENTS.md](./AGENTS.md)：开发执行规则，改代码前先看
- [DESIGN.md](./DESIGN.md)：视觉系统、页面层级、组件风格与 UI 重构约束
- [PRD.md](./PRD.md)：产品真相、模型边界、角色边界和当前页面主视角
- [PLANS.md](./PLANS.md)：当前里程碑和下一步计划
- [HANDOFF.md](./HANDOFF.md)：切流背景、兼容路径、运行时基线和交接上下文
- [UI_ENTRYPOINTS.md](./UI_ENTRYPOINTS.md)：UI 主入口、兼容路由和高风险 CTA 说明
- [plans/2026-04-22-sitewide-ui-and-truth-cutover.md](./plans/2026-04-22-sitewide-ui-and-truth-cutover.md)：全站 UI / 视觉系统 / 产品真相切换执行计划
- [docs/archive/README.md](./docs/archive/README.md)：历史 freeze / handoff 归档，不作为当前第一真相

建议阅读顺序：

`README.md -> AGENTS.md -> PRD.md -> DESIGN.md -> PLANS.md -> UI_ENTRYPOINTS.md -> plans/2026-04-22-sitewide-ui-and-truth-cutover.md`

按任务类型选读：

- UI / 页面结构 / workbench：先读 `DESIGN.md`、`UI_ENTRYPOINTS.md` 与 `plans/2026-04-22-sitewide-ui-and-truth-cutover.md`
- 客户 / 交易 / 履约 / 支付 / 商品主线：先读 `PRD.md`
- 兼容路径 / 切流背景 / worker 运行基线：先读 `HANDOFF.md`

## 目录分层

- `app/`：Next.js routes 与 server actions
- `components/`：页面工作台、表格、详情区与共享 UI 组件
- `lib/`：领域查询、mutation、权限、导航与业务规则
- `prisma/`：schema、migration、seed
- `scripts/`：运行时脚本、backfill、worker 启动与运维工具
- `docs/`：运行文档、部署说明、runbook、历史归档
- `tests/`：针对性回归测试
- `deploy/`：部署基线与环境模板
- `reports/`：运行时生成报告输出目录，不作为手写文档目录

## 本地开发

安装依赖：

```bash
npm install
```

复制环境变量模板并填写本地值：

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

同步 migration 并生成 Prisma Client：

```bash
npx prisma migrate deploy
npx prisma generate
```

按需导入本地演示数据：

```bash
npm run db:seed
```

`db:seed` 只用于本地测试或演示，不用于 staging / production。

启动 Web 开发环境：

```bash
npm run dev
```

默认访问 [http://localhost:3000](http://localhost:3000)。

## 异步导入 / worker / Redis

当前仓库的线索导入已经支持异步处理基线：

- Web 进程负责创建导入批次并入队
- Redis 作为队列连接依赖
- `worker:lead-imports` 负责消费导入任务并在后台处理批次

如果要联调异步导入，除了 Web 进程外，还需要：

1. 启动 Redis，并配置：

```bash
REDIS_URL=redis://127.0.0.1:6379
```

2. 启动 lead import worker：

```bash
npm run worker:lead-imports
```

3. 推荐立即做一次运行时自检：

```bash
npm run check:lead-import-runtime
```

如果希望把“当前必须检测到 worker 在线”作为硬条件，可以额外设置：

```bash
REQUIRE_LEAD_IMPORT_WORKER=1 npm run check:lead-import-runtime
```

4. 可选环境变量：

```bash
LEAD_IMPORT_CHUNK_SIZE=20
LEAD_IMPORT_WORKER_CONCURRENCY=1
LEAD_IMPORT_JOB_ATTEMPTS=3
```

本地最小联调通常需要两个进程：

- 终端 A：`npm run dev`
- 终端 B：`npm run worker:lead-imports`

独立脚本会自动读取当前仓库 `.env`，所以本地直接执行 `worker:lead-imports` 与 `check:lead-import-runtime` 时不需要额外手动导出一遍环境变量。

如果未配置 `REDIS_URL` 或未启动 worker，异步导入链路无法完整工作。

## 常用校验

```bash
npx prisma validate
npx prisma generate
npm run prisma:name-drift
npm run lint
npm run build
```

## 当前仓库级原则

- 不把系统回退成旧 `SalesOrder` 主单认知
- 不随意重开 schema 改造
- 客户经营真相以 `ABCDE` 分类为准；旧 `Customer.level` 语义不再继续扩产品主线
- 主管默认经营入口是 `/dashboard`；销售默认日常入口是 `/customers`
- UI 重构必须遵循 `DESIGN.md`
- 页面主入口、兼容路由、hover / dropdown / empty-state 动作必须遵循 `UI_ENTRYPOINTS.md`
- 当前全站 UI / 视觉系统 / 产品真相切换，按 `plans/2026-04-22-sitewide-ui-and-truth-cutover.md` 分阶段执行
- 异步导入基线要求 Web 进程、Redis、worker 三者链路一致
- 重要动作必须继续保留可追踪性

## 部署与历史文档

- 正式部署说明见 [docs/deployment-baseline.md](./docs/deployment-baseline.md)
- staging 验收清单见 [docs/staging-checklist.md](./docs/staging-checklist.md)
- Prisma migration rebaseline 说明见 [docs/prisma-migration-rebaseline.md](./docs/prisma-migration-rebaseline.md)
- 历史 freeze / 阶段交接文档统一收口到 [docs/archive/README.md](./docs/archive/README.md)
