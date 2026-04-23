# 酒水私域 CRM PRD

## 文档状态

- 版本：全站 UI / truth cutover 基线
- 更新时间：2026-04-22
- 用途：作为仓库内唯一产品基线文档，约束当前交易模型、页面主视角、执行边界与本轮全站 cutover 方向

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

### 2.1 客户分类与销售主线

- `Customer` 是销售执行主对象
- 客户经营分类真相切到单一 `ABCDE` 体系：
  - `A`：已复购
  - `B`：已加微信
  - `C`：已邀约
  - `D`：未接通
  - `E`：拒加
- `ABCDE` 是单选当前状态，不是并行多标签
- 分类优先级固定为：`A > C > B > E > D`
- 历史通话、微信、直播邀约和复购结果应尽量映射回当前 `ABCDE` 分类
- 旧 `Customer.level`（如 `NEW / REGULAR / VIP`）不再作为前台产品真相继续扩展；若代码里暂留，只允许作为兼容存量
- `Customer.ownerId` 是销售承接主字段
- Sales 主要从 `/customers` 工作，而不是 `/leads`
- Sales 默认日常第一屏是“今日分配客户作业台”，以高密度表格为主
- Supervisor 默认日常第一屏是 `/dashboard` 的“员工经营表”，再下钻员工客户池
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

- `/dashboard` 是主管与管理层的经营驾驶舱主入口，首屏应优先展示员工经营表和当日经营口径
- `/customers` 是 Sales 主工作台，同时承接 Supervisor 下钻后的员工客户池
- `/customers/[id]` 是客户 dossier（轻档案）主入口，详情页不再承担厚重首页式信息堆叠
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
- 本轮 cutover 默认遵循：少介绍文字、薄 header、table-first、progressive disclosure，而不是继续堆大导航块和说明文案
- Supervisor KPI 以日经营口径为主，不直接复用“近 30 天通用 dashboard 卡片”作为首页真相
- 接通率按“已分配客户口径”计算，不按“总拨打次数口径”计算
- 邀约相关口径默认使用直播邀约真相

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
- 默认从 `/dashboard` 工作
- 首屏先看员工经营表，再下钻员工客户池
- 首页指标以当日分配、接通、加微、邀约、出单、销售额和 `ABCDE` 分布为主
- 审核父单
- 看团队客户、团队父单、团队子单、团队支付与催收
- 可发起并追踪团队线索导入批次

### SALES

- 主要在 `/customers` 工作
- 首屏优先是今日分配客户表格，不是厚重 dashboard
- 需要在表格中直接修改备注和 `ABCDE` 分类
- 导入时带来的意向 / 购买字段属于首屏识别信息，应默认可见
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
- UI / truth cutover 不得破坏 `ABCDE` 分类优先级、日经营 KPI 口径与角色主视角
- 异步导入只改变处理方式，不改变 `Lead` / `Customer` 业务边界

---

## 9. 下一阶段建议

当前推荐的后续方向不是继续做局部视觉 polishing，而是按阶段执行全站 UI / 视觉系统 / 产品真相切换：

- 先把 `ABCDE` 分类、主管首页口径、销售首页口径写成仓库第一真相
- 把 Supervisor 首页切成“员工经营表 -> 员工客户池”主链
- 把 `/customers` 切成真正的销售日常作业台：默认表格、内联分类、内联备注、弱化厚重说明文案
- 把 `/customers/[id]` 收成更轻的客户 dossier
- 重做 app shell、颜色系统、页面骨架、共享 KPI / table / filter / section primitives
- 全站级视觉升级以“更轻、更静、更高级、更少废话”为目标，但不改变交易 / 支付 / 履约真相
- 仅在 `ABCDE` 真相无法由现有结构承接时，再单独评估 schema milestone，而不是把 schema 改造混进 UI 重构

---

## 10. Product Center Baseline Addendum

- Product Center and supplier management are now one product-domain surface.
- `/products` remains the default first-level entry for product work.
- Supplier management now lives inside `/products?tab=suppliers`.
- `/suppliers` is compatibility-only and redirects into Product Center.
- Product create and product detail editing should use the same supplier interaction pattern: searchable supplier selection plus inline supplier creation with automatic backfill.
- This baseline does not introduce procurement, inventory, settlement, or schema changes.

### Product Master-Data Delete Baseline (M2)

- `Product / ProductSku` delete means entering the existing `recycle-bin` lifecycle, not hard delete.
- Deleting product master data must not change:
  - `supplierId` execution truth
  - trade-order split semantics
  - historical order / trade-order / fulfillment snapshot rendering
- Historical documents continue to read existing snapshot fields such as:
  - `productNameSnapshot`
  - `skuNameSnapshot`
  - `specSnapshot`
  - `supplierNameSnapshot`
- Product deletion cascades the currently unhidden `ProductSku` records into recycle-bin by default.
- Deleted product master data must disappear immediately from:
  - `/products` active `Product / SKU` views
  - new sales-order SKU pickers
  - new trade-order SKU and bundle pickers
- M2 only completes:
  - allow move-to-recycle even when historically referenced
  - keep delete snapshot in `blockerSnapshotJson`
  - hide deleted master data from current business selection
- M3 is still required for:
  - product-domain `ARCHIVE` finalize
  - `ACTIVE + ARCHIVED` hidden filter cutover
  - product-domain history archive payload contract

### Product Master-Data Finalize Baseline (M3)

- `Product / ProductSku` now use the same recycle finalization contract as the rest of the recycle-bin domain:
  - light objects -> `PURGE`
  - historically referenced or aggregation-meaningful objects -> `ARCHIVE`
- Product-domain hidden filtering is now `ACTIVE + ARCHIVED`, not `ACTIVE` only.
- `ARCHIVED` product master data must stay out of:
  - `/products` current `Product / SKU` views
  - product detail compatibility reads
  - new sales-order SKU pickers
  - new trade-order SKU and bundle pickers
- Current product finalize truth:
  - `ProductSku` with historical references -> `ARCHIVE`
  - `ProductSku` without historical references -> `PURGE`
  - `Product` with historical references -> `ARCHIVE`
  - `Product` with delete-time SKU aggregation meaning -> `ARCHIVE`
  - only light `Product` objects without historical references and without retained SKU aggregation meaning may `PURGE`
- Product-domain `ARCHIVE` keeps the existing live `Product / ProductSku` records and uses recycle-bin hidden filtering plus archive payload as the audit truth.
- Product-domain archive payload is now part of the existing `historyArchive` contract and must not fork a new archive system.
- This baseline still does not change:
  - `supplierId` execution truth
  - trade-order split semantics
  - historical order / trade-order / fulfillment snapshot rendering

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
- For the archived freeze snapshot only, see `docs/archive/STAGE_FREEZE_2026-04-03.md`.

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

---

## 14. 商品中心企业级重构补充基线

- `/products` 继续是商品域唯一一级入口。
- 商品中心域内固定为 3 个视图：
  - `Product` 主数据视图：`/products`
  - `SKU` 经营视图：`/products?tab=skus`
  - `Supplier` 轻量辅助目录：`/products?tab=suppliers`
- `/products/[id]` 保留为兼容深链接详情页，不再作为日常主维护入口。
- 商品中心 M1 主维护路径固定为：高密度表格 + 右侧详情抽屉。
- 本轮不把 `Supplier` 扩成采购系统；`supplierId` 继续保留为订单拆单与履约执行真相。

### 14.1 字段归属冻结

以下字段在后续 schema milestone 中固定按此落层，不再反复给备选：

| 层级 | 字段 | 冻结原因 |
| --- | --- | --- |
| `Product` | `brandName` | 品牌属于同款商品身份，不应随销售规格变化 |
| `Product` | `seriesName` | 系列是同款商品的经营归属，不应被 SKU 拆散 |
| `Product` | `categoryCode` | 类目用于主数据归档和统一筛选，天然属于商品主档 |
| `Product` | `primarySalesSceneCode` | 销售场景标签优先描述“这款酒主要怎么卖”，不是规格能力 |
| `Product` | `supplyGroupCode` | 供货归类用于内部筛选和分组，不能覆盖 `supplierId` 执行真相 |
| `Product` | `financeCategoryCode` | 财务辅助归类主要服务主档区分，不应随 SKU 波动 |
| `Product` | `internalSupplyRemark` | 供货内部备注通常描述同款商品整体供货背景，放 SKU 会碎片化 |

字段冻结原则：

- `Product` 只承载“同款商品身份”和跨 SKU 共享的经营归类。
- `supplierId` 继续是执行真相，不被 `supplyGroupCode`、`internalSupplyRemark` 等辅助字段替代。
- 所有新增字段都走 additive 方式，不改旧字段语义，不改拆单真相。

### 14.2 角色可见性冻结

当前字段真相先冻结如下；是否开放 `/products` 给 `SALES` 属于后续单独 RBAC 决策，不在 M1 扩权：

| 字段 / 能力 | ADMIN | SUPERVISOR | SALES | SHIPPER | OPS |
| --- | --- | --- | --- | --- | --- |
| `supplier identity` | 可见可编辑 | 可见可编辑 | 默认隐藏 | 可见只读 | 默认隐藏 |
| `supplyGroupCode` | 可见可编辑 | 可见可编辑 | 默认隐藏 | 可见只读 | 默认隐藏 |
| `financeCategoryCode` | 可见可编辑 | 可见可编辑 | 默认隐藏 | 默认隐藏 | 默认隐藏 |
| `internalSupplyRemark` | 可见可编辑 | 可见可编辑 | 默认隐藏 | 可见只读 | 默认隐藏 |
| `defaultUnitPrice` / 默认售价 | 可见可编辑 | 可见可编辑 | 可见只读 | 可见只读 | 可见只读 |

角色收口原则：

- `ADMIN`：商品中心全量可见可改。
- `SUPERVISOR`：商品、SKU、类目和供货辅助字段主维护角色。
- `SALES`：即使未来开放 `/products`，也默认隐藏供货/财务敏感字段，只看销售需要的信息。
- `SHIPPER`：可见 supplier identity 与供货归类，但不再维护会影响订单拆单真相的主字段。
- `OPS`：维持只读商品工作台，不自动继承供货/财务敏感可见性。
