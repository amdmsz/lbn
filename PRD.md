# 酒水私域 CRM PRD

## 文档状态

- 版本：商业级当前基线
- 更新时间：2026-04-10
- 用途：作为仓库内唯一产品基线文档，约束当前交易模型、页面主视角、执行边界与后续切流方向

---

## 1. 产品定位

本系统是服务于酒水私域销售团队的内部 CRM，不是泛 ERP。

它服务的真实业务链路是：

- 线索导入
- 去重与归并
- 分配销售
- 客户承接
- 销售跟进
- 直播邀约与转化
- 成交下单
- 收款推进与催收
- 发货履约
- 物流跟进
- 审计留痕

---

## 2. 当前产品基线

### 2.1 客户与销售主线

- `Customer` 是销售执行主对象
- `Customer.ownerId` 是销售承接主字段
- Sales 主要从 `/customers` 工作，而不是 `/leads`
- `/leads` 主要服务 `ADMIN / SUPERVISOR` 做导入、审核、分配

### 2.2 线索导入执行基线

- 线索导入当前已支持异步批次处理
- 导入入口负责创建导入批次并提交后台任务
- 后台 worker 负责消费导入任务并执行解析、校验、去重、归并与落库
- Redis 是异步导入队列的运行依赖
- 导入失败时必须保留失败状态、失败信息与可追踪记录
- 异步执行方式不改变 `Lead` 与 `Customer` 的业务边界，只改变导入处理方式

### 2.3 交易与执行主线

- `TradeOrder` 是成交主单
- `SalesOrder` 是供应商子单
- `TradeOrderItem` 是销售侧父行，支持 `SKU / GIFT / BUNDLE`
- `TradeOrderItemComponent` 是执行层拆分真相
- `ShippingTask` 是子单级履约执行记录
- `PaymentPlan / PaymentRecord / CollectionTask` 是 payment layer 真相
- `CodCollectionRecord` 与 `LogisticsFollowUpTask` 分别承接 COD 与物流执行结果

### 2.4 当前页面主视角与入口基线

- `/customers` 仍是 Sales 主工作台
- `/customers/[id]` 已切到 `TradeOrder` 新写路径
- `/fulfillment` 是订单履约域统一一级入口
- `/fulfillment?tab=trade-orders` 是父单总览与管理主视角
- `/fulfillment?tab=shipping` 是 supplier 执行工作池主视角
- `/fulfillment?tab=batches` 是冻结结果 / 审计主视角
- `/orders`、`/shipping`、`/shipping/export-batches` 当前仅作为兼容跳转
- `/orders/[id]` 当前是父单优先、子单 fallback 的兼容详情页
- `/products` 是商品域唯一一级入口
- supplier 管理在 `/products?tab=suppliers`
- `/customers/public-pool` 已切到 `Customer ownership lifecycle` 工作台，并继续分出规则页与报表页

### 2.5 UI / IA 边界

- `DESIGN.md` 负责视觉系统、页面层级、组件风格与 UI 重构约束
- `UI_ENTRYPOINTS.md` 负责主入口、兼容路由、高风险 CTA 与切流检查点
- UI 重构可以升级页面结构与视觉层级，但不能静默改变业务主线、路由主入口、兼容跳转或权限边界

---

## 3. 交易模型基线

### 3.1 父单与子单

- 一个 `TradeOrder` 表示客户这次整体买了什么、送了什么、总成交金额、总收款结构、统一审核状态
- 一个 `TradeOrder` 可以拆成多个 `SalesOrder`
- 一个 `SalesOrder` 只属于一个 supplier
- 同一 supplier 的商品或组件会自动合并到同一张子单
- 不同 supplier 的商品或组件必须拆成不同子单

### 3.2 当前新写路径已支持

- 多 SKU 直售
- 多 supplier 自动拆子单
- 标准 SKU 化赠品
- 套餐父行展开为多个组件并自动拆子单

### 3.3 当前不应回退的设计

- 不允许再把 `SalesOrder` 当作交易主单思考
- 不允许绕过 `TradeOrderItemComponent` 去做跨 supplier 履约
- 不允许把订单赠品重新写回自由文本 `SalesOrderGiftItem`
- 不允许让 `/payment-records`、`/collection-tasks` 提前切成父单主视角

---

## 4. 商品与套餐基线

### 4.1 商品层

- `Supplier`
- `Product`
- `ProductSku`
- `ProductBundle`
- `ProductBundleItem`

### 4.2 套餐规则

- 套餐在销售侧以 `TradeOrderItem(type=BUNDLE)` 表达
- 套餐在执行侧展开为多个 `TradeOrderItemComponent`
- 组件按 supplier 自动拆入多个子单
- 导出、发货、物流、COD、保价都只看展开后的组件与 `SalesOrderItem`

### 4.3 套餐价格分摊

- 套餐父行保留成交价
- 组件按 `ProductSku.defaultUnitPrice * qty` 作为参考值做比例分摊
- 若参考值总和为 `0`，退回按数量比例
- 使用最大余数补分
- 精确到分
- 组件分摊金额总和必须严格等于套餐父行成交金额

---

## 5. 赠品基线

- 订单赠品的新写路径是 `TradeOrderItem(type=GIFT) + TradeOrderItemComponent(type=GIFT)`
- 第一版赠品必须选择标准 SKU
- 不支持自由文本赠品新写路径
- supplier 从赠品 SKU 自动继承
- 赠品金额恒为 `0`
- 赠品进入统一 supplier grouping、子单履约与导出件数

### 5.1 与 GiftRecord 的边界

- `GiftRecord` 继续服务营销 / 资格 / 运费语义
- 不把 `GiftRecord` 与订单赠品混成一条链

---

## 6. 审核、支付与履约规则

### 6.1 审核

- `TradeOrder.reviewStatus` 是主审核真相
- `SalesOrder.reviewStatus` 只是兼容镜像
- 提交审核时才物化子单
- 审核通过后才初始化 shipping / payment artifacts
- 审核拒绝时不初始化 artifacts

### 6.2 支付

- payment truth 在 `PaymentPlan / PaymentRecord / CollectionTask`
- `paymentScheme` 是订单侧场景分类，不是最终收款真相
- gift-only 子单不生成 payment artifacts
- 混合子单只按付费商品生成 payment artifacts

### 6.3 履约

- 一个 `SalesOrder` 当前仍只允许一个主 `ShippingTask`
- 导出、发货、物流、COD、保价都按子单粒度执行
- 导出品名与件数来自展开后的 `SalesOrderItem`

---

## 7. 角色边界

### ADMIN

- 全平台可见
- 管理组织、账号、团队、系统设置
- 可看全部客户、父单、子单、支付、履约、日志

### SUPERVISOR

- 团队级业务 owner
- 审核父单
- 看团队客户、团队父单、团队子单、团队支付与催收
- 可发起并追踪团队线索导入批次

### SALES

- 主要在 `/customers` 工作
- 创建和编辑自己客户的 `TradeOrder`
- 提交支付记录
- 跟进自己的催收与物流结果
- 不默认获得团队级导入批次处理视图

### SHIPPER

- 主要在 `/fulfillment?tab=shipping` 工作
- 处理 supplier 维度报单、导出、回填单号、推进履约状态
- 不承担交易审核与支付确认
- 不因执行协同而获得销售客户主链

### OPS

- 主要在直播与运营配置区域工作
- 不默认获得销售客户视图
- 不默认进入交易审核与支付确认主台

---

## 8. 当前必须稳定的边界

- 不改 Prisma schema，除非进入新的 schema 里程碑
- 不回退 `TradeOrder` 写路径
- 不把 `/payment-records`、`/collection-tasks` 改成父单主视角
- 不回头扩大 `GiftRecord` 写链
- 不扩展 legacy `Order`
- 不扩展 legacy `ShippingTask.orderId`
- 重要动作必须继续写 `OperationLog`
- UI 重构不得漂移主入口、兼容路由与关键 CTA 指向
- 异步导入只改变处理方式，不改变 `Lead` / `Customer` 业务边界

---

## 9. 下一阶段建议

当前推荐的后续方向不是再改 schema，而是继续做当前主线上的执行层与工作台收口：

- 统一 execution surfaces 中的 `tradeNo / subOrderNo / supplier` 展示
- 补订单履约域与子单执行页的产品层体验
- 继续完善 bundle / gift 在执行侧的可读性
- 在不改业务真相的前提下，升级客户中心与客户详情的 UI / IA
- 继续完善异步导入批次的可观测性与运行时部署基线
- 仅在确有必要时再评估新的 schema 里程碑

---

## 10. Product Center Baseline Addendum

- Product Center and supplier management are now one product-domain surface.
- `/products` remains the default first-level entry for product work.
- Supplier management now lives inside `/products?tab=suppliers`.
- `/suppliers` is compatibility-only and redirects into Product Center.
- Product create and product detail editing should use the same supplier interaction pattern: searchable supplier selection plus inline supplier creation with automatic backfill.
- This baseline does not introduce procurement, inventory, settlement, or schema changes.

---

## 11. Order Fulfillment Center Baseline Addendum

- `/fulfillment` is now the unified first-level business entry for order fulfillment.
- The fulfillment domain is organized into exactly 3 views:
  - `trade-orders`: parent-order overview and management entry
  - `shipping`: supplier-scoped execution workbench
  - `batches`: frozen export result / audit / regenerate view
- Legacy entry compatibility remains:
  - `/orders -> /fulfillment?tab=trade-orders`
  - `/shipping -> /fulfillment?tab=shipping`
  - `/shipping/export-batches -> /fulfillment?tab=batches`
- `TradeOrder` remains the transaction master record.
- `SalesOrder` remains the supplier sub-order execution anchor.
- `ShippingTask` remains the supplier-scoped fulfillment execution record.
- `ShippingExportBatch / ShippingExportLine` are now the frozen export truth.
- Shipping execution is no longer modeled as a flat task list in product IA. It is now a supplier work pool with:
  - stage switching
  - supplier summaries
  - current supplier pool
  - supplier-level batch actions
- Batch records are positioned as result and audit views, not the first execution workbench.
- Trade-order cards now carry parent-order fulfillment summaries and latest batch references, but they remain `TradeOrder`-first views.
- No schema change is required for this baseline.
- Do not reopen the old `SalesOrder`-as-master-order direction.
- Do not collapse transaction / payment / fulfillment layers back into one mixed workflow.
- For the current frozen baseline and handoff-safe summary, see `STAGE_FREEZE_2026-04-03.md`.

---

## 12. Trade-Order Scanning And Logistics Interaction Addendum

- The current `trade-orders` view is now frozen as a denser parent-order overview rather than a thick card list.
- The default list state should answer only:
  - who placed the deal
  - what was sold
  - what status it is in
  - where to go next
- Receiver information now keeps logistics collapsed by default.
- In the receiver column, logistics is represented by a single status button only.
- Hovering the logistics status button shows lightweight logistics basics:
  - carrier name
  - full tracking number
- Clicking the logistics status button opens a secondary trace drawer for:
  - current logistics status
  - latest update time
  - latest checkpoint
  - full logistics timeline when available
- Logistics detail must remain a secondary layer and must not expand the default list row height again.
- The logistics trace query path is server-side only and remains routed through `/api/logistics/track`.
- No schema change is required for this closeout.

---

## 13. Customer Public Pool Baseline Addendum

- Customer public pool is now a `Customer` ownership lifecycle surface, not a Lead 2.0 clone.
- The mainline entry is `/customers/public-pool`.
- Current stable sub-surfaces are:
  - `/customers/public-pool`
  - `/customers/public-pool/settings`
  - `/customers/public-pool/reports`
- `CustomerOwnershipEvent` is the ownership audit truth for pool entry, claim, assign, release, recycle, auto-assign, and owner restore flows.
- Current completed baseline includes:
  - v1 ownership lifecycle
  - customer public-pool workbench
  - inactive recycle preview/apply
  - owner-exit recycle preview/apply
  - team public-pool rules
  - team public-pool reports
  - auto-assign preview/apply
- Team-level auto-assign is already wired to `TeamPublicPoolSetting` and currently supports:
  - `ROUND_ROBIN`
  - `LOAD_BALANCING`
  - round-robin cursor persistence
- This baseline does not reopen lead schema redesign and must not be interpreted as a return to Lead-centric sales execution.