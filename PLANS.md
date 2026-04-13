# 酒水私域 CRM 实施计划

## 文档状态

- 更新时间：2026-04-10
- 用途：记录真实里程碑状态，区分已完成、正在推进、待开始
- 维护原则：只记录当前真实基线，不把已废弃的旧交易主模型继续当未来计划，不把 UI 愿景写成已落地事实

---

## 0. 仓库级执行与文档边界

当前仓库的文档分工如下：

- `AGENTS.md`：开发执行规则、仓库级约束、交付标准
- `DESIGN.md`：视觉系统、页面层级、组件风格与 UI 重构约束
- `PRD.md`：产品真相、角色边界、当前页面主视角
- `PLANS.md`：真实里程碑状态与下一步计划
- `HANDOFF.md`：历史切流、兼容信息、交接上下文与运行时基线
- `UI_ENTRYPOINTS.md`：主入口、兼容路由、高风险 CTA 与切流检查点

当前执行原则：

- UI 重构必须遵循 `DESIGN.md`
- 页面主入口、兼容路由、hover / dropdown / empty-state 动作必须遵循 `UI_ENTRYPOINTS.md`
- 不把页面美化误做成主入口漂移
- 不把结构升级误做成 schema 或 truth layer 变更
- 异步导入基线属于运行时与工作流增强，不属于新交易模型里程碑

---

## 1. 当前真实基线

截至 2026-04-10，仓库已经完成以下关键切换：

- `TradeOrder` 父单模型已落地
- Phase 1 additive schema 已完成并验证
- Phase 2 backfill 已完成并验证
- 客户详情建单入口已切到 `TradeOrder`
- 订单履约域入口已统一到 `/fulfillment`
- `/orders`、`/shipping`、`/shipping/export-batches` 已降为兼容跳转
- 多 SKU / 多 supplier 直售已支持
- 标准 SKU 赠品新写路径已支持
- BUNDLE 新写路径已支持
- `/payment-records`、`/collection-tasks` 仍保持子单执行主视角
- `/products` 已是商品域唯一一级入口，supplier 管理收进 `/products?tab=suppliers`
- `/customers/public-pool` 已落地为 `Customer ownership lifecycle` 工作台，并分出规则页与报表页
- 线索导入已支持异步批次处理
- Redis + lead import worker 已进入真实运行基线
- `worker:lead-imports` 已作为仓库脚本提供

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

### M1A. Lead Import Async Baseline

状态：已完成

- 线索导入已支持异步批次处理
- Web 进程负责创建导入批次并入队
- Redis 已接入 lead import queue 作为运行依赖
- `worker:lead-imports` 已落地为独立后台处理进程
- 导入失败状态、失败日志与重试基线已接通
- 该项不改变 `Lead / Customer` 业务边界与 truth layer

### M2. Payment / Fulfillment V2 基线

状态：已完成

- `PaymentPlan / PaymentRecord / CollectionTask`
- `ShippingTask / ShippingExportBatch / LogisticsFollowUpTask / CodCollectionRecord`
- V2 页面与执行链收口

### M3. 商品中心基线

状态：已完成

- `Supplier / Product / ProductSku`
- `ProductBundle / ProductBundleItem` 主数据已可用于交易写路径
- 商品中心已成为商品域唯一一级入口
- supplier 管理已内收至 `/products?tab=suppliers`

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
- Step 3：父单视角、父单详情与兼容详情链路切通
- Step 4A：标准 SKU 化赠品
- Step 4B：BUNDLE 新写路径与组件拆单

### M6A. Fulfillment Domain 收口

状态：已完成

- `/fulfillment` 已成为统一域入口
- `trade-orders / shipping / batches` 三个稳定视图已落地
- `/orders`、`/shipping`、`/shipping/export-batches` 已改为兼容跳转
- 跨视图跳转与 supplier 工作池首版已完成

### M6B. Customer Public Pool 基线

状态：已完成

- `/customers/public-pool` 已落地为 `Customer ownership lifecycle`
- 自动回收、离职回收、团队规则页、报表页已完成
- 团队级 auto-assign 已支持 `ROUND_ROBIN / LOAD_BALANCING`

### M6C. Enterprise Workbench UI / IA 收口

状态：已完成

- `/customers` 与 `/customers/[id]` 已完成一轮企业级 workbench 收口
- `/customers/public-pool`、`/customers/public-pool/settings`、`/customers/public-pool/reports` 已完成 customer lifecycle 闭环统一收口
- `/fulfillment` 的 `trade-orders / shipping / batches` 三视图已完成有边界 UI / IA 收口
- `/products`、`/products/[id]` 与 `/products?tab=suppliers` 已完成产品域统一收口
- `product-form-drawer`、`product-sku-drawer`、`supplier-form-drawer` 与 `product-supplier-field` 内联新增供应商面板已统一到同一套轻量抽屉语言
- 全局 app shell、左侧导航、导航分组与左下角账户面板已完成一轮统一壳层收口
- 该里程碑不改变 schema、truth layer、RBAC、主入口语义与 compatibility routes

---

## 3. 当前不在进行中的事项

以下事项当前明确不作为正在推进项：

- 不改 Prisma schema
- 不回头重做 backfill
- 不把 `/payment-records`、`/collection-tasks` 改成父单主视角
- 不把 `GiftRecord` 与订单赠品混链
- 不把 UI 重构扩成全站无边界重写
- 不在未明确里程碑时顺手重做 truth layer
- 不把异步导入扩写成新的 Lead / Customer 模型改造

---

## 4. 当前建议里程碑

### M7. 执行工作台收口

状态：待开始

目标：

- 继续统一 `tradeNo / subOrderNo / supplier` 在执行工作台中的展示
- 强化父单与子单之间的关系可读性
- 不改变 `/payment-records`、`/collection-tasks` 的主查询粒度

范围：

- `/payment-records` 中补父单编号与子单编号展示
- `/collection-tasks` 中补父单编号与子单编号展示
- 子单详情与执行摘要页的 bundle / gift 可读性收口
- 跨执行页的 TradeOrder / SalesOrder 识别一致性收口

明确不做：

- 不改 schema
- 不改 payment / fulfillment truth layer
- 不父单化 execution 列表

### M7B. Lead Import Runtime / Observability 收口

状态：待开始

目标：

- 收口异步导入的运行时说明、部署基线、staging 验收与可观测性说明
- 让 Web、Redis、worker 三段链路在 README / HANDOFF / deployment / staging 文档中保持一致

范围：

- README 本地启动说明
- HANDOFF 运行时基线
- deployment / staging 文档
- 导入失败、重试与 worker 日志的交接说明

明确不做：

- 不改 Lead / Customer 业务边界
- 不重开 schema
- 不做新的导入页面主入口设计

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
2. M7B：Lead Import Runtime / Observability 收口
3. M8：商品经营深化
4. M9：Finance / Reconciliation 首版

---

## 6. 进入下一里程碑前必须保持的边界

- `TradeOrder` 继续是成交主单
- `SalesOrder` 继续是 supplier 子单
- bundle / gift / direct SKU 都继续走 `TradeOrderItemComponent`
- `payment / fulfillment truth` 不重新混用
- 旧执行主链继续稳定
- 重要动作继续留痕
- UI 重构不得漂移主入口与兼容路由
- 异步导入基线不得因部署遗漏而失效
- `npm run lint` 和 `npm run build` 必须始终保持通过

---

## 7. 当前 UI / IA 级别补充

当前 UI 方向作为仓库级设计约束已经确定为：

- `Linear` 风格骨架
- `Cohere` 风格数据层密度
- `Vercel` 风格排版与细节
- `Claude / Notion` 少量温和感

当前这部分属于 `DESIGN.md` 约束，不单独作为 truth-layer 里程碑。

执行方式：

- 以页面模块为单位渐进重构
- 先共享基元，再落页面
- 不把视觉升级误做成业务模型改造

---

## 8. Product Center Baseline Addendum

状态：已完成基线，轻量一致性收口中

- Product Center is now the single first-level entry for the product domain.
- Supplier management moved into `/products?tab=suppliers`.
- `/suppliers` remains compatibility-only and redirects into Product Center.
- Product create and product detail editing should converge on the same supplier interaction:
  searchable supplier selection plus inline supplier creation with automatic backfill.
- No schema change, procurement, inventory, or settlement scope is included in this baseline.

---

## 9. Fulfillment Center Baseline Addendum

状态：已完成基线，进入工作流增强阶段

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

---

## 10. Trade-Order Scan Efficiency And Logistics UX Closeout

状态：已完成收口，不开启新 schema 里程碑

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

---

## 11. Customer Public Pool Baseline Addendum

状态：已完成基线，ownership workflow enhancement baseline 已收口

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
