# 酒水私域 CRM 实施计划

## 文档状态

- 更新时间：2026-04-02
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

