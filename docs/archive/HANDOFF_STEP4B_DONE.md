# HANDOFF_STEP4B_DONE

## 1. 当前基线

截至 2026-04-02，仓库当前真实基线如下：

- `TradeOrder` 是成交主单
- `SalesOrder` 是 supplier 子单
- `TradeOrderItem` 支持 `SKU / GIFT / BUNDLE`
- `TradeOrderItemComponent` 是执行拆分真相
- Phase 1 additive schema 已完成
- Phase 2 backfill 已完成并验证
- `/customers/[id]` 已切到 `TradeOrder` 新写路径
- `/orders` 与 `/orders/[id]` 已切到父单优先视角
- `/shipping`、`/payment-records`、`/collection-tasks` 仍保持子单执行主视角

## 2. 已完成到哪一步

### Step 1

- 父单服务层已落地：
  - `lib/trade-orders/mutations.ts`
  - `lib/trade-orders/queries.ts`
  - `lib/trade-orders/workflow.ts`

### Step 2

- 客户详情建单入口已切到 `TradeOrder` 表单
- 支持多 SKU / 多 supplier 直售
- 提交审核时自动物化多个 supplier 子单

### Step 3

- `/orders` 已切到 `TradeOrder` 父单列表
- `/orders/[id]` 已切到父单详情页
- 子单详情仍保留为兼容次级入口

### Step 4A

- 标准 SKU 化赠品新写路径已落地
- 赠品进入统一 component 拆单与 supplier 子单履约

### Step 4B

- BUNDLE 新写路径已落地
- 套餐父行写入 `TradeOrderItem(type=BUNDLE)`
- 套餐组件写入多个 `TradeOrderItemComponent(type=GOODS, source=BUNDLE_COMPONENT)`
- 组件按 supplier 自动拆入多个子单
- 套餐价格按 `ProductSku.defaultUnitPrice * qty` 参考值比例分摊，参考值总和为 0 时退回按数量比例，并用最大余数补分，精确到分

## 3. 哪些不能动

以下边界当前必须稳定：

- 不要把系统回退成单 `SalesOrder` 交易主模型
- 不要绕过 `TradeOrderItemComponent` 去做 bundle / gift / cross-supplier 执行
- 不要把订单赠品重新写回自由文本 `SalesOrderGiftItem`
- 不要改 `/shipping`、`/payment-records`、`/collection-tasks` 的主视角
- 不要把 `GiftRecord` 与订单赠品混成一条链
- 不要扩展 legacy `Order`
- 不要扩展 legacy `ShippingTask.orderId`
- 没有新的 schema 方案前，不要随意改 Prisma schema

## 4. 下一步做什么

建议下一步进入“执行工作台收口”而不是再开新的 schema 里程碑：

1. 统一 `/shipping`、`/payment-records`、`/collection-tasks` 中的 `tradeNo / subOrderNo / supplier` 展示
2. 强化 bundle / gift 在子单执行页中的可读性
3. 继续保持 execution surfaces 以子单为主，而不是强行父单化
4. 仅在需要直播价格表、商品经营深化时，再进入下一轮 product-layer 里程碑

## 5. 验证基线

最近一轮完成后已通过：

- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npm run build`

## 6. 交接提醒

- 新账号拉最新分支后，先读：
  - `PRD.md`
  - `PLANS.md`
  - `AGENTS.md`
  - 本文档
- 然后再看：
  - `lib/trade-orders/*`
  - `components/trade-orders/*`
  - `app/(dashboard)/orders/*`
  - `app/(dashboard)/customers/[id]/*`

