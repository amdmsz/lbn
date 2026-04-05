# 酒水私域 CRM 实施计划

## 文档状态

- 更新时间：2026-04-05
- 用途：记录真实里程碑状态，区分已完成、正在推进、待开始
- 维护原则：只记录当前真实基线，不把已废弃的旧交易主模型继续当未来计划

---

## 1. 当前真实基线

截至 2026-04-02，仓库已经完成以下关键切换：

- `TradeOrder` 父单模型已落地
- Phase 1 additive schema 已完成并验证
- Phase 2 backfill 已完成并验证
- 客户详情建单入口已切到 `TradeOrder`
- `/orders` 已切到父单视角
- 多 SKU / 多 supplier 直售已支持
- 标准 SKU 赠品新写路径已支持
- BUNDLE 新写路径已支持
- `/shipping`、`/payment-records`、`/collection-tasks` 仍保持子单执行主视角

---

## 2. 已完成里程碑

### M0. 基础工程与认证

状态：已完成

- Next.js / Prisma / MySQL / NextAuth 基线
- 认证、RBAC、基础布局

### M1. Leads / Customers 基线

状态：已完成

- 线索导入、去重、分配
- 客户中心与客户详情工作台
- 基于 `Customer.ownerId` 的销售主线

### M2. Payment / Fulfillment V2 基线

状态：已完成

- `PaymentPlan / PaymentRecord / CollectionTask`
- `ShippingTask / ShippingExportBatch / LogisticsFollowUpTask / CodCollectionRecord`
- V2 页面与执行链收口

### M3. 商品中心基线

状态：已完成

- `Supplier / Product / ProductSku`
- `ProductBundle / ProductBundleItem` 主数据已可用于交易写路径

### M4. Legacy 冻结与 V2 切流

状态：已完成

- 冻结 legacy `Order` 新写路径
- 冻结 legacy `ShippingTask.orderId` 新写路径
- `/orders`、客户详情订单区、`/shipping` 已切到 V2 可用基线

### M5. TradeOrder Phase 1 / Phase 2

状态：已完成

- Phase 1 additive schema
- Phase 2 backfill
- `tradeOrderId` 锚点打通到 payment / fulfillment descendants

### M6. TradeOrder 新写路径 Step 1 ~ Step 4B

状态：已完成

- Step 1：父单服务层
- Step 2：客户详情建单入口切换
- Step 3：`/orders` 与 `/orders/[id]` 切父单视角
- Step 4A：标准 SKU 化赠品
- Step 4B：BUNDLE 新写路径与组件拆单

---

## 3. 当前不在进行中的事项

以下事项当前明确不作为正在推进项：

- 不改 Prisma schema
- 不回头重做 backfill
- 不把 `/shipping`、`/payment-records`、`/collection-tasks` 改成父单主视角
- 不把 `GiftRecord` 与订单赠品混链

---

## 4. 下一步建议里程碑

### M7. 执行工作台收口

状态：待开始

目标：

- 继续统一 `tradeNo / subOrderNo / supplier` 在执行工作台中的展示
- 强化父单与子单之间的关系可读性
- 不改变 `/shipping`、`/payment-records`、`/collection-tasks` 的主查询粒度

范围：

- `/shipping` 中补父单编号与子单编号展示
- `/payment-records` 中补父单编号与子单编号展示
- `/collection-tasks` 中补父单编号与子单编号展示
- 子单详情与执行摘要页的 bundle / gift 可读性收口

明确不做：

- 不改 schema
- 不改 payment / fulfillment truth layer
- 不父单化 execution 列表

### M8. 商品经营深化

状态：待开始

目标：

- 在现有 `ProductBundle` 基线上，补商品经营能力
- 为直播专属商品、价格表、套餐经营做准备

范围：

- `PriceBook`
- `PriceBookItem`
- `LiveSessionProduct`
- 商品中心与直播商品绑定增强

明确不做：

- 不做 ERP
- 不做库存
- 不做复杂采购

### M9. Finance / Reconciliation 首版

状态：待开始

目标：

- 基于当前 payment layer 与 fulfillment layer，补管理层 finance 预览

范围：

- `/finance/payments`
- `/finance/reconciliation`
- `/finance/exceptions`

明确不做：

- 不做完整财务系统
- 不做总账
- 不接真实支付 API

---

## 5. 当前建议执行顺序

1. M7：执行工作台收口
2. M8：商品经营深化
3. M9：Finance / Reconciliation 首版

---

## 6. 进入下一里程碑前必须保持的边界

- `TradeOrder` 继续是成交主单
- `SalesOrder` 继续是 supplier 子单
- bundle / gift / direct SKU 都继续走 `TradeOrderItemComponent`
- 旧执行主链继续稳定
- 重要动作继续留痕
- `npm run lint` 和 `npm run build` 必须始终保持通过
## 0. 2026-04-02 Product Center Baseline Addendum

Status: completed baseline, light consistency closeout in progress.

- Product Center is now the single first-level entry for the product domain.
- Supplier management moved into `/products?tab=suppliers`.
- `/suppliers` remains compatibility-only and redirects into Product Center.
- Product create and product detail editing should converge on the same supplier interaction:
  searchable supplier selection plus inline supplier creation with automatic backfill.
- No schema change, procurement, inventory, or settlement scope is included in this baseline.

## 0. 2026-04-03 Fulfillment Center Baseline Addendum

Status: completed baseline, entering post-cutover workflow enhancement instead of model redesign.

- The order fulfillment domain has completed Phase 1 to Phase 3 baseline closeout.
- `/fulfillment` is now the unified domain entry.
- The 3 stable views are:
  - `trade-orders`
  - `shipping`
  - `batches`
- Phase 1 completed:
  - IA closeout
  - unified domain entry
  - route compatibility for `/orders`, `/shipping`, `/shipping/export-batches`
- Phase 2 completed:
  - shipping view upgraded into a supplier work pool
  - stage switching
  - supplier summaries
  - current supplier pool
  - supplier-level batch and logistics actions
- Phase 3 completed:
  - trade-orders strengthened as parent-order overview
  - batches strengthened as frozen result / audit view
  - cross-view jumps closed inside `/fulfillment`
- Current batch export truth is `ShippingExportLine`, not runtime item assembly.
- Current planning boundary:
  - do not reopen schema work without a new hard milestone
  - do not revert to old `SalesOrder` master-order thinking
  - do not make batch records the primary execution entry again
- Recommended next work should focus on workflow enhancement, finance/reconciliation, or migration-chain cleanup as separate scoped work.
- For the exact frozen baseline, use `STAGE_FREEZE_2026-04-03.md` as the current stage checkpoint.

## 0. 2026-04-03 Trade-Order Scan Efficiency And Logistics UX Closeout

Status: completed closeout, no new schema or truth-layer milestone opened.

- The `trade-orders` list has completed its scan-efficiency closeout.
- The default row state is now thinner and remains `TradeOrder`-first.
- Fulfillment summary in the status column is now a compact 2x2 inline summary instead of large status blocks.
- Low-frequency list details are no longer expanded under each row.
- Receiver information keeps logistics collapsed by default.
- Current logistics interaction baseline:
  - default state: a single logistics status button only
  - hover: carrier name and full tracking number
  - click: secondary trace drawer with current status and full timeline
- Current logistics trace path is already connected through the server-side adapter and `/api/logistics/track`.
- This closeout does not reopen:
  - schema work
  - shipping truth redesign
  - a new fulfillment workbench milestone

## 0. 2026-04-04 Customer Public Pool Baseline Addendum

Status: completed baseline, ownership workflow enhancement baseline closed for this phase.

- Public pool is now a `Customer` ownership lifecycle domain, not a Lead 2.0 extension.
- Current completed items include:
  - `CustomerOwnershipEvent`
  - public-pool workbench
  - inactive recycle preview/apply
  - owner-exit recycle preview/apply
  - team rules page
  - reports page
  - team-level auto-assign preview/apply
- Current stable team-level auto-assign strategies are:
  - `ROUND_ROBIN`
  - `LOAD_BALANCING`
- Current planning boundary:
  - do not reopen schema work for public pool in this release-prep stage
  - do not regress sales execution back to `Lead`
  - do not move Prisma enum runtime objects back into frontend/shared settings or metadata code
