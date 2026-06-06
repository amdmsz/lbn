# CLAUDE.md

@AGENTS.md

## Project Brief

这是酒水私域销售团队内部 CRM，不是通用 ERP。

当前主线是：

- `Customer`：销售执行主对象，销售主要在 `/customers` 工作。
- `TradeOrder`：成交主单，不能回退成旧 `SalesOrder` 主单思路。
- `/products`：商品域唯一一级入口，supplier 管理在 `/products?tab=suppliers`。
- `/fulfillment`：订单履约域统一入口。
- `PaymentPlan / PaymentRecord / CollectionTask` 是收款真相。
- `ShippingTask / ShippingExportBatch / LogisticsFollowUpTask / CodCollectionRecord` 是履约真相。

所有权限必须落在服务端。涉及删除、移交、支付、履约、导入、审核等重要动作时，必须保留 `OperationLog` 或现有审计链。

## Must Read First

建议 Claude Code 接手时先读：

1. `CODEX_PROJECT_CONTEXT.md`
2. `README.md`
3. `AGENTS.md`
4. `PRD.md`
5. `PLANS.md`
6. `UI_ENTRYPOINTS.md`
7. `DESIGN.md`
8. `HANDOFF.md`

部署相关先读：

- `docs/deployment-baseline.md`
- `docs/public-frp-tunnel-runbook.md`

## Recent Context: Customer Batch Delete

最近修复了“客户列表选中后还是不能删除”的问题。

根因不是服务没上线，而是普通“回收”按钮被 recycle eligibility guard 禁用。那些导入 / 中转 / 有归属审计锚点的客户不满足“误建轻客户回收”条件，所以不能简单放宽回收规则。

已新增独立的客户列表批量“硬删”入口：

- commit: `cda490b fix: add customer batch hard delete`
- GitHub `origin/main` 已推送。
- 线上尚未部署，原因是本机 SSH key 登录生产服务器失败。

相关文件：

- `app/(dashboard)/customers/actions.ts`
- `components/customers/customer-center-workbench.tsx`
- `components/customers/customers-table.tsx`
- `lib/customers/force-delete.ts`

行为说明：

- 普通“回收”规则不变。
- 新增“硬删”只对 `ADMIN / SUPERVISOR` 开放。
- 批量硬删需要输入确认短语：`永久删除`。
- 必须填写删除原因。
- 服务端仍复用 `forceHardDeleteCustomer`，逐条做权限 / 可见范围 / 主管团队范围校验，并走原有硬删审计事务。

已通过本地验证：

```powershell
npx prisma validate
npm run lint
npm run build
git diff --check
```

## Production Deploy Notes

生产域名：

```text
https://crm.cclbn.com
```

最近线上真实路径通常是：

```bash
/var/www/jiuzhuang-crm
```

部署文档模板路径是 `/srv/jiuzhuang-crm/current`，不要盲目假设，先在服务器确认。

有服务器权限后，可在生产服务器执行：

```bash
cd /var/www/jiuzhuang-crm
sudo ENV_FILE=/etc/jiuzhuang-crm/jiuzhuang-crm.env \
SERVICE_NAME=jiuzhuang-crm \
WORKER_SERVICE_NAME=jiuzhuang-crm-import-worker \
APP_USER=crm \
APP_GROUP=crm \
SMOKE_BASE_URL=https://crm.cclbn.com \
bash scripts/deploy-update.sh
```

部署后至少验证：

```bash
curl -I https://crm.cclbn.com/login
curl -i https://crm.cclbn.com/api/mobile/dashboard
```

未登录访问 `/api/mobile/dashboard` 返回 `401 Unauthorized` 属于正常健康信号。

## Suggested Next Work For Claude

1. 先完成生产部署，并确认 `/customers` 批量选择后出现“硬删”按钮。
2. 用 `ADMIN / SUPERVISOR` 账号手动验证：选择被回收 guard 阻断的客户，输入 `永久删除` 和原因后可以硬删。
3. 若继续优化 UI，只在客户列表批量操作栏和硬删弹窗范围内做，不要重写回收站生命周期规则。
4. 若发现服务端仍阻断，优先检查 `forceHardDeleteCustomer` 的 scope / role / dependency cleanup，而不是改前端按钮状态。
5. 每次改完至少跑：

```powershell
npx prisma validate
npm run lint
npm run build
```
