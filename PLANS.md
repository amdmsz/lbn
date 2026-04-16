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

- 默认不改 Prisma schema；只有进入明确 schema milestone 时才允许增量变更，例如 `RecycleBinEntry`
- 不回头重做 backfill
- 不把 `/payment-records`、`/collection-tasks` 改成父单主视角
- 不把 `GiftRecord` 与订单赠品混链
- 不把 UI 重构扩成全站无边界重写
- 不在未明确里程碑时顺手重做 truth layer
- 不把异步导入扩写成新的 Lead / Customer 模型改造

---

## 4. 当前建议里程碑

### M6D. RecycleBinEntry Schema Milestone

状态：待开始

目标：

- 把真实回收站从 guard / dialog 语义推进为真实持久化状态
- 为 `Product / ProductSku / Supplier / LiveSession` 建立统一的回收站数据基线
- 保持商品域与直播场次的业务生命周期动作不变，不把 `enabled / disabled`、`取消 / 归档` 误当作回收站状态

范围：

- 新增统一 `RecycleBinEntry` 中心表
- 只覆盖：
  - `Product`
  - `ProductSku`
  - `Supplier`
  - `LiveSession`
- 建立 schema、repository + adapter、moveToRecycleBin、restore、purge 的服务边界顺序
- 业务页查询后续统一排除 `ACTIVE` recycle entry

明确不做：

- 不扩到 `Customer / Lead`
- 不并行采用“各模型自带 deletedAt”方案
- 不先做 `/recycle-bin` 页面
- 不把 guard / dialog 误当作真实回收站落地

第一批实施顺序：

1. schema
2. repository + adapter
3. moveToRecycleBin
4. restore
5. purge
6. 最后再做 `/recycle-bin` 页面

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

1. M6D：RecycleBinEntry Schema Milestone
2. M7：执行工作台收口
3. M7B：Lead Import Runtime / Observability 收口
4. M8：商品经营深化
5. M9：Finance / Reconciliation 首版

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

---

## 12. Customer RecycleBinEntry Planning Addendum

状态：方案已确认，待进入实现前评审

定位：

- `Customer recycle` 只处理误建轻客户。
- `Customer recycle` 不替代 `/customers/public-pool` ownership lifecycle。
- `Customer recycle` 不替代 `DORMANT / LOST / BLACKLISTED` 状态治理。
- `Customer recycle` 不替代 merge / merge release。
- 本阶段只固定 `Customer` 的 recycle planning 与 service contract，不展开 `Lead / TradeOrder / SalesOrder`。

轻客户 / 重客户边界：

- 轻客户：仅有基础识别信息，最多保留当前 `ownerId`，仍处于 `ACTIVE + PRIVATE`，尚未进入 ownership、公海、跟进、成交、支付、履约、物流、归并链。
- 重客户：只要进入以下任一链路，就不再属于可删除对象：
  - ownership lifecycle / public-pool / claim-lock
  - 销售跟进执行链
  - 成交 / 资金 / 履约 / 物流链
  - merge / import 审计链
- `ownerId` 单独存在不直接判重；否则手工误建客户几乎没有纠错空间。

允许 moveToRecycleBin 的 Customer：

- `status = ACTIVE`
- `ownershipMode = PRIVATE`
- `publicPoolEnteredAt / publicPoolReason / claimLockedUntil / lastEffectiveFollowUpAt / publicPoolTeamId / lastOwnerId` 为空
- `ownershipEvents = 0`
- `followUpTasks / callRecords / wechatRecords / liveInvitations = 0`
- `orders / tradeOrders / paymentPlans / paymentRecords / collectionTasks / giftRecords / shippingTasks / logisticsFollowUpTasks / codCollectionRecords = 0`
- `mergeLogs = 0`

不允许 moveToRecycleBin 的 Customer：

- `DORMANT / LOST / BLACKLISTED`：继续走客户状态治理，不走 recycle。
- `PUBLIC / LOCKED` 或已有公海字段：继续走 `/customers/public-pool`。
- 已有 `ownershipEvents / lastOwnerId / claimLockedUntil / lastEffectiveFollowUpAt`：说明已进入 ownership 或跟进保护链。
- 已有跟进、通话、微信、直播邀约痕迹：继续走跟进终止、失效、公海等业务动作。
- 已有关联订单、支付、催收、礼品、履约、物流、COD：继续保留客户真相，不删除。
- 已进入 merge 审计链：继续走 merge，不删除。

service contract 固定口径：

- move guard 返回：
  - `mode = move`
  - `decision = movable | blocked`
  - `summary`
  - `targetSnapshot`
    - `targetType = CUSTOMER`
    - `targetId`
    - `name`
    - `phone`
    - `status`
    - `ownershipMode`
    - `ownerLabel`
  - `blockers`
    - `code`
    - `name`
    - `group`
    - `description`
    - `suggestedAction`
  - `blockerGroups`
    - `group`
    - `summary`
    - `items`

- restore guard 返回：
  - `mode = restore`
  - `decision = restorable | blocked`
  - `summary`
  - `targetSnapshot`
  - `blockers`
  - `blockerGroups`
- restore 固定规则：
  - `DORMANT / LOST / BLACKLISTED` 阻断 move，但不阻断 restore。
  - 跟进、成交、支付、履约、物流痕迹不阻断 restore。
  - restore 只保留最小硬阻断：
    - `对象缺失`
    - `已完成归并且当前对象不应恢复为独立客户`

- purge blocker 返回：
  - `mode = purge`
  - `decision = purgeable | blocked`
  - `summary`
  - `targetSnapshot`
  - `blockers`
  - `blockerGroups`
- purge 固定规则：
  - `purge` 是最严 guard。
  - move blocker 中的阻断项，默认同时阻断 purge。
  - `关联线索`、`客户标签` 额外阻断 purge。

blocker 分组与建议动作：

- `对象状态`
  - blocker：`对象缺失`
  - suggestedAction：先确认原始客户记录是否仍存在；不存在则不再恢复或清理。
- `客户生命周期`
  - blocker：`非 ACTIVE 客户`
  - suggestedAction：改走 `DORMANT / LOST / BLACKLISTED` 状态治理，不走 recycle。
- `公海与归属链`
  - blocker：`公海客户`、`锁定客户`、`已有归属历史`
  - suggestedAction：改走 `/customers/public-pool` ownership lifecycle。
- `销售跟进痕迹`
  - blocker：`已有有效跟进时间`、`跟进任务`、`通话记录`、`微信记录`、`直播邀请`
  - suggestedAction：保留客户，改走跟进终止、冻结、失效或公海治理。
- `成交与资金链`
  - blocker：`历史订单`、`成交主单`、`礼品记录`、`支付计划`、`支付记录`、`催收任务`
  - suggestedAction：保留客户，在订单 / 支付域做取消、作废、关闭等业务动作。
- `履约与物流链`
  - blocker：`发货任务`、`物流跟进`、`COD 回款记录`
  - suggestedAction：保留客户，在履约 / 物流链完成后续治理。
- `归并与导入审计`
  - blocker：`归并审计链`、`关联线索`、`客户标签`
  - suggestedAction：保留 merge / import 审计上下文，不做 recycle 清理。
- `其他阻断`
  - suggestedAction：保留服务端返回原始阻断项，避免前端擅自推断。

`/recycle-bin?tab=customers` 规划口径：

- tab：`customers`
- targetType：`customer`
- 列表字段至少包括：
  - `name`
  - `phone`
  - `status`
  - `level`
  - `ownershipMode`
  - `ownerLabel`
  - `deletedAt`
  - `deletedBy`
  - `deleteReason`
  - `blockerSummary`
- 风险补充字段至少包括：
  - `lastEffectiveFollowUpAt`
  - `tradeOrderSummary.approvedCount`
  - `importSummary.linkedLeadCount`

当前规划边界：

- 当前只固定实现前评审口径，不在本阶段展开 schema、旧 migration 或页面接线。
- 服务端 guard 继续作为唯一真相来源，前端只消费结果，不在组件里重写客户可删规则。

---

## 13. Customer / TradeOrder Dual-Terminal Recycle Lifecycle Addendum

状态：规则已定稿，待进入实现前评审

本节为当前有效口径，覆盖上一节仅面向 `Customer` 的单对象 recycle 规划。

定位：

- 本节只固定 `Customer / TradeOrder` 的 recycle lifecycle 规则与 contract，不进入 schema 和实现。
- `move` 与 `finalize` 解耦：进入回收站只表示进入 `3` 天冷静期，不等于将来一定可以 `PURGE`。
- `finalize` 固定拆成两个终态：
  - `PURGE`
  - `ARCHIVE`
- `Customer recycle` 只处理误建轻客户，不替代 `/customers/public-pool` ownership lifecycle，不替代 `DORMANT / LOST / BLACKLISTED`，不替代 merge / merge release。
- `TradeOrder recycle` 只处理误建草稿单，不替代取消 / 作废 / 关单，也不替代审核、拆单、支付、履约、物流链治理。

为什么不能“有关联也直接硬删”：

- `Customer` 一旦进入 ownership、公海、跟进、成交、支付、履约、物流、merge、import 审计链，硬删会直接破坏这些记录的主锚点。
- `TradeOrder` 一旦进入审核、拆单、支付、催收、履约、导出、物流、COD 链，硬删会直接破坏成交主单与执行子链的真相链。
- 这样只会产生两种错误结果：
  - 级联删掉仍需保留的业务真相
  - 留下失去主锚点的孤儿记录
- 因此必须把 `move` 放宽，但把 `finalize` 拆成 `PURGE / ARCHIVE` 两条终态。

为什么 `ARCHIVE` 不能伪装成 `PURGED`：

- `PURGED` 表示对象与其可删上下文已经被真实清除。
- `ARCHIVE` 表示对象退出主工作台，但仍保留审计锚点、业务摘要或脱敏后的历史外壳。
- 如果把 `ARCHIVE` 伪装成 `PURGED`，后续就无法区分“真实物理删除”与“最终封存 / 脱敏归档”，会直接污染审计语义和生命周期语义。

Customer 规则：

- 轻对象：
  - 误建轻客户。
  - 仅有基础识别信息，最多带当前 `ownerId`、客户标签等弱关联。
  - 仍处于 `ACTIVE + PRIVATE`。
  - 尚未进入 ownership、公海、claim lock、跟进、成交、支付、履约、物流、merge、import 审计链。
- 重对象：
  - 只要进入以下任一强链路，即视为 heavy：
  - `ownership lifecycle / public-pool / claim-lock / lastOwner`
  - `followUp / call / wechat / live invitation`
  - `tradeOrder / paymentPlan / paymentRecord / collectionTask`
  - `shippingTask / logisticsFollowUp / COD`
  - `merge / import audit / linked lead`
- 仍应阻断 move 的 Customer：
  - `DORMANT / LOST / BLACKLISTED`
  - `PUBLIC / LOCKED`
  - 已进入 `/customers/public-pool`
  - 已进入 merge 主流程
- 允许 move 的 Customer 新语义：
  - 进入 `3` 天冷静期。
  - 退出主工作台，但不预判 `3` 天后一定能 `PURGE`。
  - 到期后必须重新按最新服务端真相判断 `PURGE` 或 `ARCHIVE`。
- `3` 天到期后的 Customer 终态：
  - 轻对象：`PURGE`
  - 重对象：`ARCHIVE`
- Customer `ARCHIVE` 语义：
  - 保留 customer id 与下游锚点。
  - 不再回到 `/customers` 主工作台。
  - 对 `phone / wechatId / address / remark` 脱敏或清空。
  - `name` 仅保留最小可读掩码。

TradeOrder 规则：

- 轻对象：
  - 纯误建草稿单。
  - `tradeStatus = DRAFT`。
  - 尚未生成 `SalesOrder`。
  - 尚未进入审核、支付、催收、履约、导出、物流、COD 链。
- 重对象：
  - 只要满足以下任一条件，即视为 heavy：
  - 非 `DRAFT`
  - 已生成 `SalesOrder`
  - 已有 `paymentPlan / paymentRecord / collectionTask`
  - 已有 `shippingTask / exportLine / logisticsFollowUp / COD`
  - 已进入审核、驳回、取消、作废、关闭等正式业务语义
- TradeOrder move 放宽边界：
  - 放宽的是“与其他对象有关联”本身不再自动等于不能 move。
  - 但仍不应把正在活跃支付、履约、物流执行中的订单直接放进 recycle；否则会破坏 `/fulfillment` 当前执行真相。
  - move 放宽仅适用于“存在历史关联，但已不再承担活跃执行主视图职责”的对象。
- `3` 天到期后的 TradeOrder 终态：
  - 轻对象：`PURGE`
  - 重对象：`ARCHIVE`
- TradeOrder `ARCHIVE` 语义：
  - 保留 `tradeNo / customer snapshot / tradeStatus / reviewStatus / finalAmount` 及对子单、支付、催收、履约、导出、物流、COD 的锚点。
  - 对 `receiverName / receiverPhone / 地址快照` 做脱敏。
  - 不再作为主工作台活跃对象返回。

双终态 lifecycle contract：

- `move`
  - 语义：进入 `3` 天冷静期。
  - 结论：`move` 成功不代表将来一定能 `PURGE`。
  - 约束：前端不在组件里预测最终终态，只消费服务端返回。
- `restore`
  - 截止点：只允许在对象仍处于回收站冷静期、且尚未完成最终 `PURGE` 或 `ARCHIVE` 前执行。
  - 到达最终 `PURGE` 或最终 `ARCHIVE` 后，不再从 recycle-bin 恢复回 active 对象。
  - `Customer` 补充：`DORMANT / LOST / BLACKLISTED` 阻断 move，但不阻断冷静期内 restore。
  - `TradeOrder` 补充：restore 不回滚原有取消 / 驳回 / 关闭等业务真相，只负责撤销 recycle 态。
- `finalize`
  - 触发点：对象进入回收站满 `3` 天。
  - 判断源：必须基于“最新服务端真相”重算。
  - 禁止事项：不允许只依赖 `move` 当时快照做最终处理。
  - 固定终态：
    - `PURGE`
    - `ARCHIVE`
  - 判断原则：
    - 最新真相仍为 light：`PURGE`
    - 最新真相已为 heavy：`ARCHIVE`
- `PURGE`
  - 只允许 light 对象进入。
  - 表示真实物理删除。
- `ARCHIVE`
  - 只允许 heavy 对象进入。
  - 表示最终封存 / 脱敏归档，不等于物理删除。
  - 必须与 `PURGED` 保持独立语义。

`/recycle-bin` 展示 contract：

- `customers` 与 `trade-orders` 两个 tab 都要展示：
  - `最终处理：可 purge`
  - `最终处理：仅封存`
  - `剩余时间`
- 剩余时间固定以“距最终处理”口径展示，例如：
  - `距最终处理 2d 6h`
- 冷静期内的按钮语义：
  - light 对象显示 `永久删除`
  - heavy 对象不显示 `永久删除`
  - heavy 对象只显示 `3 天后仅封存`
- “提前永久删除”规则：
  - 只对 light 对象开放
  - 仅管理员可见
- blocker / summary 展示方向：
  - 不再只回答“能不能删”
  - 要明确回答“为什么最终可 purge”或“为什么最终仅封存”

必须先改规则再实现的项：

- 先把保留期口径从当前历史值统一为 `3` 天冷静期，再谈后续实现。
- 先把 lifecycle 口径从“restore / purge 二元”改成“move / restore / finalize，且 finalize = `PURGE | ARCHIVE`”。
- 先确认 `Customer / TradeOrder` 的 light / heavy 判定口径，再改 move guard 放宽范围。
- 先确认 heavy 对象的 `ARCHIVE` 语义不是“伪装成 purged”，再做最终处理实现。
- 先确认 `/recycle-bin` 的按钮和文案语义，再开放“提前永久删除”。
- 先确认到期重算必须基于最新服务端真相，再做任何定时最终处理。
