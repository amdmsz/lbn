# 酒水私域 CRM 实施计划

## 文档状态

- 更新时间：2026-04-22
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
- 当前已进入全站 UI / 视觉系统 / 客户经营真相切换计划，先改文档真相，再改 KPI / shell / 关键工作台
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
- recycle 主线已完成真实持久化回收站、业务页接线与 `/recycle-bin` 治理页收口
- `Customer / TradeOrder` 已完成双终态 lifecycle：`move -> restore -> finalize(PURGE | ARCHIVE)`
- auto-finalize worker、dry-run、runbook、deployment baseline 已补齐，剩余为 staging / production 运维落地

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

### M6D. Recycle / Recycle-Bin / Dual-Terminal 收口

状态：已完成（研发收尾完成，剩余运维执行）

- `RecycleBinEntry` 已作为真实持久化回收站基线落地到当前已接入域
- `Customer / TradeOrder` 已完成双终态 lifecycle、finalize 视角、history archive contract 与 archive snapshotVersion=2 固化
- `/recycle-bin` 已支持 `ACTIVE / ARCHIVED / PURGED / RESTORED` 历史终态列表、结构化详情、导出与审计检索增强
- `Customer` 已完成详情页与列表 inline recycle、批量回收、批量标签、跨页选择、blocked explanation 收口
- `TradeOrder` 已完成业务页 recycle 入口、finalize 视角与 grouped blocker explanation 收口
- `Lead` 与其他已接入域继续沿用现有 restore / purge 语义，并统一纳入 `/recycle-bin`
- auto-finalize 已具备真实执行入口、dry-run、stdout summary、alert code、runbook 与 deployment/staging checklist

---

## 3. 当前不在进行中的事项

以下事项当前明确不作为正在推进项：

- 默认不改 Prisma schema；只有进入明确 schema milestone 时才允许增量变更，例如 `RecycleBinEntry`
- 不回头重做 backfill
- 不把 `/payment-records`、`/collection-tasks` 改成父单主视角
- 不把 `GiftRecord` 与订单赠品混链
- 不把全站 UI / truth cutover 偷偷扩成新的交易真相或 schema 重写
- 不在未明确里程碑时顺手重做 truth layer
- 不把异步导入扩写成新的 Lead / Customer 模型改造

---

## 4. 当前建议里程碑（不含 recycle 主线）

### M7. 全站 UI / 视觉系统 / 客户经营真相切换

状态：待开始，Phase 0 文档重置为第一步

目标：

- 把客户经营真相从旧 `Customer.level` 语义切到 `ABCDE`
- 把主管首页切到 `员工经营表 -> 员工客户池`
- 把销售首页切到 `/customers` 日常作业台
- 把全局壳层、颜色系统、页面骨架和共享基元统一切到新的轻量高级 workbench 语言

阶段：

- Phase 0：文档真相重置
- Phase 1：`ABCDE` 分类合同与 KPI 口径
- Phase 2：共享 shell / token / 视觉系统
- Phase 3：Supervisor cockpit
- Phase 4：Sales daily workbench
- Phase 5：Customer dossier
- Phase 6：secondary surface alignment
- Phase 7：validation / hardening

明确不做：

- 不偷改交易 / 支付 / 履约真相
- 不静默改主入口和兼容路由
- 不把 UI 改造顺手扩成 schema rewrite

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

1. M7 Phase 0：文档真相重置
2. M7 Phase 1：`ABCDE` 分类合同与 KPI 口径
3. M7 Phase 2 ~ Phase 5：shell / supervisor cockpit / sales workbench / customer dossier
4. M7 Phase 6 ~ Phase 7：secondary alignment 与 hardening
5. M8：商品经营深化
6. M9：Finance / Reconciliation 首版

---

## 6. 进入下一里程碑前必须保持的边界

- `TradeOrder` 继续是成交主单
- `SalesOrder` 继续是 supplier 子单
- bundle / gift / direct SKU 都继续走 `TradeOrderItemComponent`
- `payment / fulfillment truth` 不重新混用
- 客户经营分类真相以 `ABCDE` 为准；旧 `Customer.level` 不再继续扩产品语义
- 主管首页主链为员工经营表，销售首页主链为 `/customers` 表格作业台
- UI 重构不得漂移主入口与兼容路由
- 异步导入基线不得因部署遗漏而失效
- 重要动作继续留痕
- `npm run lint` 和 `npm run build` 必须始终保持通过

---

## 7. 当前 UI / IA 级别补充

当前 UI 方向已不再是“仅做渐进式页面 polish”，而是一次明确的全站 cutover：

- 先共享壳层和视觉系统，再落主管 / 销售两个核心工作台
- 默认减少顶部介绍、厚重导航块和解释性文案
- 以 table-first、progressive disclosure、轻量抽屉和内联编辑为主
- 视觉质量来自结构、比例、留白、字体和表格秩序，而不是堆卡片和堆说明文字

这部分继续受 `DESIGN.md` 约束，但当前已经成为仓库级 active milestone，而不是“有空再做”的局部美化项

---

## 8. Product Center Baseline Addendum

状态：已完成基线，轻量一致性收口中

- Product Center is now the single first-level entry for the product domain.
- Supplier management moved into `/products?tab=suppliers`.
- `/suppliers` remains compatibility-only and redirects into Product Center.
- Product create and product detail editing should converge on the same supplier interaction:
  searchable supplier selection plus inline supplier creation with automatic backfill.
- No schema change, procurement, inventory, or settlement scope is included in this baseline.

### Product Delete M2 Closeout

状态：进行中，本轮实现闭环

- M2 目标固定为：允许 `Product / ProductSku` 进入回收站、立即从现行业务隐藏、保留历史快照、历史单据不坏。
- M2 已完成边界应包括：
  - 商品域 delete 不再因为历史引用或 SKU 挂载而阻塞 `moveToRecycleBin`
  - `Product` 删除默认级联当前未隐藏的 `ProductSku`
  - 删除前快照与历史引用摘要进入 `blockerSnapshotJson`
  - `/products`、新建销售单 SKU 选择器、新建成交单 SKU / bundle 选择器统一排除商品域 `ACTIVE` 回收条目
- M2 明确不做：
  - 商品域 `ARCHIVE` finalize
  - `ACTIVE + ARCHIVED` hidden filter 全链切换
  - 商品域 history archive payload
- M3 的直接前置是真正接入商品域 `archive finalize`，届时再把当前隐藏态从 `ACTIVE` 扩成 `ACTIVE + ARCHIVED`

---

### Product Delete M3 Closeout

- M3 已完成边界：
  - `Product / ProductSku` 已接入商品域 finalize preview 与执行
  - 商品域 finalize 已支持 `ARCHIVE | PURGE` 双终态
  - 商品域 `historyArchive` 已接入 `PRODUCT / PRODUCT_SKU` archive payload
  - 商品域当前隐藏态已从 `ACTIVE` 升级为 `ACTIVE + ARCHIVED`
  - `/products` 当前 `Product / SKU` 列表、详情查询、新建销售单 SKU 选择器、新建成交单 SKU / bundle 选择器均已统一排除 archived 商品对象
- 当前 finalize 真相固定为：
  - `ProductSku` 有历史引用时只 `ARCHIVE`
  - `ProductSku` 无历史引用时可 `PURGE`
  - `Product` 只要有历史引用，或删除前仍有 SKU 聚合保留意义，就只 `ARCHIVE`
  - 只有轻量 `Product` 才允许 `PURGE`
- M3 明确仍不做：
  - 商品域 live record 的额外脱敏改写
  - 新 schema
  - 订单 / 成交 / 履约历史快照重构
  - 新的商品域删除系统

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

## 12. Recycle 主线最终收口基线

状态：已完成，当前剩余项以运维执行为主

已完成内容：

- 真实持久化回收站已经覆盖当前已接入域，并统一汇入 `/recycle-bin`
- `Customer / TradeOrder` 已完成双终态 lifecycle：`move -> restore -> finalize(PURGE | ARCHIVE)`
- `/recycle-bin` 已支持 `ACTIVE / ARCHIVED / PURGED / RESTORED`、结构化历史详情、导出与审计检索增强
- `Customer / TradeOrder` 的 history archive 已固化为查询层 contract，优先读取 `snapshotVersion=2`，旧历史条目继续走 `LEGACY_FALLBACK`
- `Customer` 已完成详情页、列表 inline、批量回收、批量标签、跨页选择与 blocker explanation 收口
- `TradeOrder` 已完成业务页 recycle 入口、finalize 视角与 blocker explanation 收口
- `Lead` 与商品主数据 / 直播场次等已接入域继续按现有 restore / purge 语义接入 `/recycle-bin`
- auto-finalize 已具备真实执行入口、dry-run、stdout summary、alert code、runbook、staging checklist 与 deployment baseline

当前有效规则：

- `Customer recycle` 只处理误建 light Customer，不替代 public-pool、`DORMANT / LOST / BLACKLISTED`、merge
- `TradeOrder recycle` 只处理误建草稿单，不替代取消 / 作废 / 关单，也不替代审核、支付、履约、物流治理
- `move` 的语义是进入 `3` 天冷静期，不等于未来一定能 `PURGE`
- `finalize` 必须按最新服务端真相重算：
  - light：`PURGE`
  - heavy：`ARCHIVE`
- `restore` 只允许发生在冷静期内；一旦进入 `ARCHIVED / PURGED`，不再恢复回 active 对象
- `ARCHIVE` 不是伪装成 `PURGED`；它保留审计锚点、结构化摘要与脱敏快照
- `ACTIVE | ARCHIVED` 已统一视为主工作台不可见，并作为相关 stale write 的写入互斥条件
- “提前永久删除”只对 light 对象开放，且仅管理员可执行

已冻结边界：

- 不再为这条线扩新域、新页面或新业务功能
- 不再改 schema，除非出现阻断级错误
- 不再改双终态 lifecycle 顶层语义，除非发现实现与当前规则不一致
- 不重开旧 migration 语义，不回退到单终态回收站口径
- 不在组件里重写轻重对象、move guard、finalize preview 或 blocker 规则

仍需人工 / 运维动作：

- 在 staging 按 runbook 完成一次真实 dry-run 演练并留档
- 为 production 配置 `RECYCLE_AUTO_FINALIZE_ACTOR_ID`、batch limit、failed/backlog 告警阈值与日志落盘
- 把 `npm run worker:recycle-auto-finalize` 接到真实调度器
- 首次上线前按 `docs/staging-checklist.md` 和 `docs/deployment-baseline.md` 完成最后人工核对

后续如果再接这条线：

- 不要重复做 schema / lifecycle 规划，直接以当前实现和文档为准
- 先读：
  - `HANDOFF.md`
  - `docs/recycle-auto-finalize-runbook.md`
  - `docs/staging-checklist.md`
  - `app/(dashboard)/recycle-bin/*`
  - `lib/recycle-bin/*`
  - `scripts/recycle-auto-finalize.ts`
- 只有在出现新的明确 milestone 时，才允许在这条线之上继续扩能力

---

## 13. 商品中心企业级重构里程碑

状态：M1 已开始并进入页面骨架落地

### M1. 信息架构与页面骨架收口

状态：进行中

范围：

- `/products` 固定为商品域唯一一级入口
- 域内固定 3 视图：`Product / SKU / Supplier`
- `Product` 与 `SKU` 两个视图统一改为高密度企业表格骨架
- 列表主链改为右侧详情抽屉；`/products/[id]` 保留兼容深链接详情页
- 清理未生效的 `category` 占位逻辑
- 不改 schema
- 不改订单建单页
- 不做复杂批量编辑
- 不做保存视图

冻结决策：

- `supplierId` 继续保留为执行真相，不被供货辅助字段替代
- `Product` 字段固定为：
  - `brandName`
  - `seriesName`
  - `categoryCode`
  - `primarySalesSceneCode`
  - `supplyGroupCode`
  - `financeCategoryCode`
  - `internalSupplyRemark`
当前验收口径：

- `/products` 有 `Product / SKU / Supplier` 三视图
- `Product` 与 `SKU` 首屏都以表格为主，不再使用商品卡片流
- 商品与 SKU 都能从列表进入右侧详情抽屉
- `SHIPPER` 不再维护商品 / SKU / Supplier 主数据
- `OPS` 在商品视图下不再默认看到 supplier identity

### M2. 字段补齐与筛选体系

状态：待开始

范围：

- additive schema 增量补齐商品经营字段
- 建立品牌 / 系列 / 类目 / 场景 / 供货归类 / 财务归类 / 包装形式等筛选体系
- 补字段级服务端可见性裁剪

明确不做：

- 不把 Supplier 扩成采购系统
- 不改 `TradeOrder / SalesOrder` 拆单真相

### M3. 详情抽屉增强与批量维护

状态：待开始

范围：

- 批量编辑核心字段
- 详情抽屉内的分区编辑与快捷动作增强
- 待整理标记与资料完整度提示

### M4. 保存视图与治理机制

状态：待开始

范围：

- 保存筛选视图
- 待整理商品治理
- 重复商品识别辅助
- 列表噪音控制和经营整理台增强
