# Codex Project Context

更新时间：2026-05-09

用途：账号切换、新 Codex 会话冷启动，或者长时间离开后重新接手本仓库时先读这份文件。它不是替代 `PRD.md` / `PLANS.md` / `HANDOFF.md`，而是把项目全貌、运行方式、部署路径和最近交接注意点收口到一个入口。

---

## 1. 冷启动阅读顺序

1. `CODEX_PROJECT_CONTEXT.md`
2. `AGENTS.md`
3. `README.md`
4. `PRD.md`
5. `PLANS.md`
6. `HANDOFF.md`
7. `DESIGN.md` 和 `UI_ENTRYPOINTS.md`
8. 按任务再读对应 runbook

建议优先阅读：

- `docs/deployment-baseline.md`
- `docs/public-frp-tunnel-runbook.md`
- `docs/staging-checklist.md`
- `docs/cti-outbound-call-runbook.md`
- `docs/call-ai-production-runbook.md`
- `docs/recycle-auto-finalize-runbook.md`

不要从 `docs/archive/*` 或旧 freeze 文件开始。它们只用于追溯，不是当前第一真相。

---

## 2. 项目一句话

这是酒水私域销售团队的内部 CRM，不是通用 ERP。目标是稳定支撑：

```text
lead intake -> customer operations -> order -> payment -> fulfillment -> auditability
```

当前主线：

- `Customer` 是销售执行主对象。
- `TradeOrder` 是成交主单。
- `/customers` 是销售日常工作台。
- `/dashboard` 是主管 / 管理层经营驾驶舱。
- `/products` 是商品域唯一一级入口。
- `/fulfillment` 是订单履约域统一一级入口。

---

## 3. 本地仓库快照

当前本地路径：

```powershell
C:\Users\amdmsz\Documents\LbnCrm
```

当前主分支：

```text
main -> origin/main
```

核心技术栈：

- Next.js 16 / React 19 / TypeScript
- Prisma 7 / MySQL
- NextAuth
- Redis + BullMQ for lead import queue
- systemd deployment baseline for Web / worker / CTI / Call AI timer
- Tailwind CSS v4 toolchain through PostCSS

常见目录：

- `app/`：Next.js routes 与 server actions
- `components/`：页面工作台、表格、详情区、抽屉、共享 UI
- `lib/`：领域查询、mutation、权限、导航、业务规则
- `prisma/`：schema、migration、seed
- `scripts/`：worker、部署、检查、backfill、运维脚本
- `deploy/`：systemd / nginx / mysql / frp 模板
- `docs/`：runbook、部署、验收、历史归档
- `tests/`：针对性回归测试

---

## 4. 不可回退的业务真相

- `Lead` 只做导入、去重、分配、审核；销售执行主线不回到 `/leads`。
- `Customer.ownerId` 是销售承接主字段。
- 客户经营分类以 `ABCDE` 为当前产品真相，旧 `Customer.level` 只保留兼容语义。
- `TradeOrder` 是成交主单；`SalesOrder` 是 supplier 子单。
- `TradeOrderItem / TradeOrderItemComponent` 承接销售语义与执行拆分。
- 赠品新写路径是 `TradeOrderItem(type=GIFT)`，不要回到自由文本赠品或 `GiftRecord` 主链。
- 套餐新写路径是 `TradeOrderItem(type=BUNDLE)`，组件按 supplier 自动拆单。
- Payment truth 在 `PaymentPlan / PaymentRecord / CollectionTask`。
- Fulfillment truth 在 `ShippingTask / ShippingExportBatch / ShippingExportLine / LogisticsFollowUpTask / CodCollectionRecord`。
- `/products` 是商品域唯一一级入口；supplier 管理在 `/products?tab=suppliers`。
- `/fulfillment?tab=trade-orders` 是父单总览与管理主视角，不要把口语化“下单页面”误解成旧 `/orders` 主入口。
- `OPS` 和 `SHIPPER` 不自动继承销售客户视图。
- 权限必须落在服务端，不能只靠菜单隐藏。
- 重要动作必须保留 `OperationLog` 或现有审计链。

---

## 5. 当前主入口和兼容路由

稳定主入口：

- `/dashboard`
- `/customers`
- `/customers?salesId=<salesId>`
- `/customers/[id]`
- `/customers/[id]?tab=orders&createTradeOrder=1`
- `/mobile`
- `/fulfillment?tab=trade-orders`
- `/fulfillment?tab=shipping`
- `/fulfillment?tab=batches`
- `/products`
- `/products?tab=skus`
- `/products?tab=suppliers`
- `/customers/public-pool`
- `/call-recordings`
- `/settings/*`

兼容路由：

- `/orders` -> `/fulfillment?tab=trade-orders`
- `/shipping` -> `/fulfillment?tab=shipping`
- `/shipping/export-batches` -> `/fulfillment?tab=batches`
- `/suppliers` -> `/products?tab=suppliers`
- `/orders/[id]` 是父单优先、子单 fallback 的兼容详情页
- `/gifts` 不再是 active workflow，保留历史兼容跳转

任何 workflow cutover 都要同步检查 CTA、hover、dropdown、empty-state、more-action 和兼容路由。

---

## 6. 本地启动和校验

PowerShell 本地启动：

```powershell
Set-Location C:\Users\amdmsz\Documents\LbnCrm
npm install
Copy-Item .env.example .env
npx prisma migrate deploy
npx prisma generate
npm run dev
```

默认访问：

```text
http://localhost:3000
```

异步导入完整联调还需要 Redis 和独立 worker：

```powershell
$env:REDIS_URL='redis://127.0.0.1:6379'
npm run worker:lead-imports
```

运行时自检：

```powershell
npm run check:lead-import-runtime
```

强制检查 worker 在线：

```powershell
$env:REQUIRE_LEAD_IMPORT_WORKER='1'
npm run check:lead-import-runtime
```

常规质量门禁：

```powershell
npx prisma validate
npx prisma generate
npm run prisma:name-drift
npm run lint
npm run build
```

按需测试：

```powershell
npm run test:lead-imports
npm run test:system-settings
```

本仓库的 `build` 脚本固定为 `next build --webpack`。不要把服务器构建切成只装 production dependencies，因为 Tailwind / PostCSS / TypeScript / ESLint 链路依赖 `devDependencies`。

---

## 7. 生产和公网运行基线

正式部署主文档是：

```text
docs/deployment-baseline.md
```

该文档用 `/srv/jiuzhuang-crm/current` 作为模板路径；最近实际线上操作使用过：

```text
/var/www/jiuzhuang-crm
```

接手生产任务时先在服务器上确认真实路径，不要只按模板路径假设。

常见线上对象：

- 环境文件：`/etc/jiuzhuang-crm/jiuzhuang-crm.env`
- Web service：`jiuzhuang-crm.service`
- Lead import worker service：`jiuzhuang-crm-import-worker.service`
- CTI Gateway service：`jiuzhuang-crm-cti-gateway.service`
- Call AI timer：`jiuzhuang-crm-call-ai-worker.timer`
- Web 域名：`https://crm.cclbn.com`

更新服务时优先使用仓库脚本：

```bash
bash scripts/release-preflight.sh
npm run prisma:deploy:safe
bash scripts/release-smoke.sh https://crm.cclbn.com
REQUIRE_LEAD_IMPORT_WORKER=1 npm run check:lead-import-runtime
```

单机更新脚本：

```bash
sudo ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env \
SERVICE_NAME=jiuzhuang-crm \
WORKER_SERVICE_NAME=jiuzhuang-crm-import-worker \
APP_USER=crm \
APP_GROUP=crm \
bash scripts/deploy-update.sh
```

生产 / 预发禁用：

- `prisma migrate dev`
- `prisma migrate reset`
- 把 `prisma db push` 当正式发布手段
- 跳过 build 或 migration status 直接重启

公网 / FRP / 移动端入口看：

```text
docs/public-frp-tunnel-runbook.md
```

不要假设公网 IP 永远不变。需要公网验证时，以 DNS、runbook、服务器当前 Nginx / frp 配置为准。`crm.cclbn.com` 应保持为固定公网入口；动态内网公网 IP 变化应由 frpc 主动连接公网 frps 吸收。

---

## 8. 近期发布和会话记忆已经沉淀的事实

- `f7cbbe8 fix: expose order sales filter and duplicate lead replacement`
  - “下单页面筛选业务员”实际落点是 `/fulfillment?tab=trade-orders`。
  - query 层已有 `salesId`，主要修复是 UI 主筛选区显露和 `lib/fulfillment/navigation.ts` typed params 对齐。
  - duplicate-customer replacement 已按“未加微信、未成交、无交易/履约阻断”口径收口，主管可决定是否作为新线索、是否保留历史、历史可见性。
- `cf55076 fix: restore trade order gift lines`
  - customer-scoped TradeOrder 表单和查询恢复 `GIFT` 行显示 / 保存路径。
  - 验证链路为 `git diff --check`、`npm run lint`、`npm run build`。
- lead import remark visibility 修复已完成并部署过。
  - 后端 mapping 不是主要问题；当用户说“模板里有备注但导入不显示备注”时，优先查 preview / detail visibility。
- 最近成功部署后通常验证：
  - 本地 `npx prisma validate`
  - `npm run lint`
  - `npm run build`
  - 服务器 `/var/www/jiuzhuang-crm` fast-forward
  - `https://crm.cclbn.com/login` HTTPS smoke
  - 未登录访问 `/api/mobile/dashboard` 返回 `401 Unauthorized` 属于健康信号

如果用户说“帮我提交 GitHub”或“更新服务器”，默认交付是 commit / push / deploy / verification，而不是只改本地代码。

---

## 9. 常见坑和处理方式

- Windows 环境中 `rg.exe` 偶尔会因权限失败；直接换 PowerShell `Select-String` / `Get-ChildItem`。
- 生产构建必须 `npm ci --include=dev`，不要 `--omit=dev`。
- `npm run build` 失败如果是偶发 `spawn EPERM`，先在真实 host shell 重跑确认，不要马上重写代码。
- 生产服务器 git pull 如果遇到 `.git/objects` 权限错误，先查 repo ownership。
- MySQL / timezone / 数据库重启后，如果 Prisma pool 仍报连接超时，需要重启 `jiuzhuang-crm` Web 进程；只重启 MySQL 可能不够。
- 手工 SQL 查表名前先看 `prisma/schema.prisma` 的 `@@map` / `@map`，例如客户真实表名可能是 `customer`，不是直觉里的 `customers`。
- release smoke 要用 HTTPS 路径；公网和内网路径要分开验证。
- 导入批次长时间不推进时，先查 Redis、worker service、queue 状态和 worker 日志。
- 外呼 / 录音 / AI 相关问题要区分 CRM、CTI Gateway、Asterisk、录音存储、Call AI worker，不要全归因到 Web。

---

## 10. 改代码前的最小执行协议

1. 先确认当前目录和 git 状态：

```powershell
Set-Location C:\Users\amdmsz\Documents\LbnCrm
git status --short --branch
```

2. 读任务相关文档和模块，不要凭印象改：

- 业务真相：`PRD.md`
- 里程碑：`PLANS.md`
- 历史切流：`HANDOFF.md`
- UI 入口：`UI_ENTRYPOINTS.md`
- 部署：`docs/deployment-baseline.md`

3. 中高风险任务先写 plan：

```text
plans/<YYYY-MM-DD>-<topic>.md
```

4. 修改涉及权限、所有权、审核、支付、履约、导入、删除时，必须确认：

- server-side RBAC
- ownership / scope filter
- `OperationLog` 或等价审计链
- loading / empty / error 状态
- compatibility routes 和旧 CTA 没有被重新打开

5. 完成前至少跑：

```powershell
npx prisma validate
npm run lint
npm run build
```

如果改了 Prisma schema，再跑：

```powershell
npx prisma generate
npm run prisma:predeploy:check
```

---

## 11. 用户协作偏好

- 目标明确时直接推进，少问低价值问题。
- 输出要有 exact commands（可复制粘贴命令）和 verification evidence（验证证据）。
- 用户说“继续”时，通常是让你继续打通 blocker，不是停在解释。
- 用户说“成熟产品，头部企业的小程序”时，默认按生产级 UX / 稳定性处理。
- 用户说“安全第一”时，安全控制是 MVP requirement，不是后续优化。
- 用户说“你登录上去帮我操作”时，默认进入实际服务器操作路径，并先确认路径 / 用户 / 服务名。

---

## 12. 最短接手摘要

- `Customer` 主线，`TradeOrder` 主单，`/products` 商品入口，`/fulfillment` 履约入口。
- 不回退 `SalesOrder` 主单，不扩 legacy `Order` / `ShippingTask.orderId`。
- RBAC / ownership / OperationLog 必须在服务端保住。
- 异步导入依赖 Redis + `worker:lead-imports`，不能只起 Web。
- 生产发布走 `release-preflight -> prisma:deploy:safe -> service restart -> smoke -> worker check`。
- 新账号先读本文件，再读 `AGENTS.md`、`PRD.md`、`PLANS.md`、`HANDOFF.md`、`UI_ENTRYPOINTS.md`。
