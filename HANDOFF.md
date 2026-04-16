# HANDOFF
更新时间：2026-04-10

## 当前交接结论

当前仓库已经从“模型切换期”进入“正确模型上的工作流增强期”。

客户域、履约域、产品域、抽屉体系和全局导航壳层，已经完成一轮统一的 enterprise workbench UI / IA 收口。
当前后续重点不再是“要不要重做壳层”，而是只在明确 scope 下做小尾项抛光或新的业务里程碑。

不要再把重点放回：

- 旧 `SalesOrder` 主单认知
- 重新拆 schema
- 把批次记录做回第一执行入口
- 把 `/shipping` 改回普通平铺执行列表
- 把页面美化误做成主入口漂移或工作台重做

当前真实基线应以：

- `AGENTS.md`
- `DESIGN.md`
- `PRD.md`
- `PLANS.md`
- `UI_ENTRYPOINTS.md`
- `STAGE_FREEZE_2026-04-03.md`
- `docs/deployment-baseline.md`

为准。

---

## 1. 当前真实模型基线

- `TradeOrder` = 成交主单
- `SalesOrder` = supplier 子单
- `TradeOrderItem / TradeOrderItemComponent` = 销售语义与执行拆分真相
- `ShippingTask` = supplier 子单级履约执行对象
- `ShippingExportBatch / ShippingExportLine` = 导出冻结快照真相
- `PaymentPlan / PaymentRecord / CollectionTask` = payment layer 真相
- `LogisticsFollowUpTask / CodCollectionRecord` 继续保持 fulfillment side 语义

当前边界：

- 不回退到旧 `SalesOrder` 主单思路
- 不回退到 legacy `Order`
- 不扩展 legacy `ShippingTask.orderId`
- 不混 transaction / payment / fulfillment truth layer

---

## 2. 当前 IA 基线

### 商品域

- `/products` 是商品域唯一一级入口
- supplier 管理已收进 `/products?tab=suppliers`
- `/suppliers` 仅保留为兼容跳转

### 订单履约域

- `/fulfillment` 已落地为统一域入口
- 3 个稳定视图：
  - `trade-orders`
  - `shipping`
  - `batches`

旧入口兼容：

- `/orders -> /fulfillment?tab=trade-orders`
- `/shipping -> /fulfillment?tab=shipping`
- `/shipping/export-batches -> /fulfillment?tab=batches`

### 客户与公海池

- Sales 主工作入口仍是 `/customers`
- 客户详情建单仍走 `/customers/[id]?tab=orders&createTradeOrder=1`
- `/customers/public-pool` 是 `Customer ownership lifecycle` 工作台
- `/customers/public-pool/settings` 与 `/customers/public-pool/reports` 为稳定子入口

---

## 3. 当前运行时基线补充

### 线索导入异步基线

当前线索导入已经不是纯同步处理链路。

当前运行方式：

- Web 进程负责创建导入批次与入队
- Redis 负责作为 lead import queue 连接依赖
- 独立 worker 负责消费批次并后台处理导入任务

当前仓库内的关键运行点包括：

- `npm run worker:lead-imports`
- `scripts/lead-import-worker.ts`
- `lib/lead-imports/queue.ts`
- `lib/lead-imports/worker.ts`

### 运行依赖

当前异步导入运行至少要求：

- `REDIS_URL`
- 一个正常运行的 Redis 服务
- Web 进程
- lead import worker 进程

当前可选调优变量：

- `LEAD_IMPORT_CHUNK_SIZE`
- `LEAD_IMPORT_WORKER_CONCURRENCY`
- `LEAD_IMPORT_JOB_ATTEMPTS`

### 交接注意

- 这是一条运行时链路，不是新的一级 UI 入口
- 不要误以为 `npm run dev` 就能覆盖完整异步导入处理
- staging / production 必须显式把 worker 进程纳入部署
- 如果 Redis 没配或 worker 没起，导入链路会残缺

---

## 4. 当前阶段已完成

### 交易主链

- TradeOrder Phase 1 additive schema 已完成
- Phase 2 backfill 已完成
- `/customers/[id]` 已切 TradeOrder 建单路径
- `/orders/[id]` 父单优先，子单 fallback

### Lead Import Async Baseline

- lead import queue 已接入 Redis
- lead import worker 已落地为独立后台进程
- 导入批次可异步消费
- 失败批次与失败日志基线已接通
- 该项不改变 `Lead / Customer` 业务边界

### GIFT / BUNDLE

- GIFT 新写路径已完成
- BUNDLE 新写路径已完成
- 不再回头扩展 `SalesOrderGiftItem` 主链

### 执行与导出

- `/payment-records /collection-tasks` 仍保持子单执行主视角
- `tradeNo / subOrderNo / supplier` 识别信息已补齐
- M8A 已完成：导出真相切到 `ShippingExportLine`

### 商品域收口

- 商品中心合并 supplier 管理已完成
- 商品新建与详情编辑的 supplier 交互已统一

### Enterprise Workbench UI / IA 收口

- 客户域已完成：`/customers` 与 `/customers/[id]` 已收口到同一套企业级工作台语言
- customer lifecycle 闭环已完成：`/customers/public-pool`、规则页、报表页已与客户中心统一
- 履约域已完成：`/fulfillment` 的 `trade-orders / shipping / batches` 三视图已完成有边界收口
- 产品域已完成：`/products`、`/products/[id]`、`/products?tab=suppliers` 已完成统一收口
- 抽屉体系已完成：`product-form-drawer`、`product-sku-drawer`、`supplier-form-drawer` 与 `product-supplier-field` 内联新增供应商面板已统一语言
- 全局导航壳层已完成：app shell、左侧导航、导航分组层级、激活态与左下角账户面板已完成一轮统一收口
- 当前这部分交接结论只代表呈现层与信息架构收口，不代表 schema、truth layer、RBAC 或主入口语义发生变化

### 公海池 ownership lifecycle

- `/customers/public-pool` 已落地为 Customer ownership lifecycle 工作台
- `CustomerOwnershipEvent` 已作为 ownership 审计链真相接线
- Phase 1 工作台、Phase 2 自动回收 / 离职回收、Phase 3 自动分配引擎、Phase 4 团队规则页与报表页均已落地
- 团队级 auto-assign 已支持 `ROUND_ROBIN / LOAD_BALANCING / preview / apply / round-robin cursor`

### 订单履约中心

- Phase 1 已完成：统一域入口、IA 收口、旧路由兼容
- Phase 2 已完成：发货执行 supplier 工作池首版
- Phase 3 已完成：交易单 / 批次记录收口与跨视图联动

### RecycleBinEntry Schema Milestone Baseline

- 当前商品主数据与 `LiveSession` 已完成危险动作语义、blocker 预检与确认弹层基线，但这仍然只属于 guard / dialog 层
- 真实回收站如果继续停留在现状，将无法表达：
  - 哪些对象当前仍在回收站中
  - 谁删除的、为何删除、何时到期
  - 恢复 / 永久删除的真实状态
- 因此下一步必须作为新的 schema milestone 推进，而不是继续以 UI 小尾项方式延后
- 当前确认采用统一 `RecycleBinEntry` 中心表方案，不再并行讨论“各模型自带 deletedAt”方案
- 该 milestone 第一批只覆盖：
  - `Product`
  - `ProductSku`
  - `Supplier`
  - `LiveSession`
- 第一批实施顺序固定为：
  1. schema
  2. repository + adapter
  3. moveToRecycleBin
  4. restore
  5. purge
  6. 最后再做 `/recycle-bin` 页面
- 不要先做回收站页面，也不要把 `enabled / disabled`、`取消 / 归档`、现有 guard / dialog 误当作真实回收站状态

---

## 5. 当前页面定位

### 交易单视图

主对象：`TradeOrder`

定位：

- 父单总览入口
- 成交审核入口
- supplier 拆单结果回看入口
- 父单履约摘要入口

注意：

- 真实一级入口是 `/fulfillment?tab=trade-orders`
- `/orders` 仅为兼容跳转，不再视作一级工作台

### 发货执行视图

主对象：`SalesOrder + ShippingTask`

定位：

- supplier 工作池
- 发货员主操作入口
- 阶段化推进报单、回物流、发货执行

当前已具备：

- 顶部阶段切换
- supplier 汇总条
- 当前 supplier 发货池
- supplier 级批量动作

注意：

- 真实一级入口是 `/fulfillment?tab=shipping`
- `/shipping` 仅为兼容跳转

### 批次记录视图

主对象：`ShippingExportBatch + ShippingExportLine`

定位：

- 冻结结果页
- 文件下载页
- 重生成入口
- 审计页

不再作为第一执行入口。

注意：

- 真实一级入口是 `/fulfillment?tab=batches`
- `/shipping/export-batches` 仅为兼容跳转

---

## 6. 当前不要回退的边界

- 不要把系统回退成旧 `SalesOrder` 主单认知
- 不要重开 schema 改造，除非进入明确 schema milestone；当前唯一已确认例外是 `RecycleBinEntry`
- 不要把 `/payment-records`、`/collection-tasks` 改成父单主视角
- 不要把批次记录重新升成主工作台
- 不要动 `GiftRecord` 主链去替代订单 gift 主链
- 不要混 payment truth 和 fulfillment truth
- 不要在 UI 重构时漂移主入口、兼容路由或 CTA 指向
- 不要把工作台页面做成 marketplace / marketing 风格
- 不要把异步导入运行链路重新退回成仅同步处理假设

---

## 7. 当前 UI / 设计交接规则

当前 UI 方向已经固定为：

- `Linear`：骨架、层级、工作台精度
- `Cohere`：KPI 行、数据密度、主管视图
- `Vercel`：排版、间距、边框、细节克制
- `Claude / Notion`：详情页、空状态、写作表面的少量温和感

当前 UI 任务执行原则：

- 先看 `DESIGN.md`
- 再看 `UI_ENTRYPOINTS.md`
- 不改变业务主线与页面主入口
- 先抽共享基元，再落具体页面
- 优先做模块级渐进重构，不做无边界全站重写

---

## 8. 当前推荐阅读顺序

1. `README.md`
2. `AGENTS.md`
3. `DESIGN.md`
4. `PRD.md`
5. `PLANS.md`
6. `UI_ENTRYPOINTS.md`
7. `docs/deployment-baseline.md`
8. `docs/staging-checklist.md`
9. `scripts/lead-import-worker.ts`
10. `lib/lead-imports/*`
11. `STAGE_FREEZE_2026-04-03.md`
12. `docs/deployment-baseline.md`
13. `app/(dashboard)/fulfillment/page.tsx`
14. `components/fulfillment/order-fulfillment-center.tsx`
15. `app/(dashboard)/customers/public-pool/*`
16. `components/customers/public-pool-*`
17. `components/trade-orders/*`
18. `components/shipping/*`
19. `lib/trade-orders/*`
20. `lib/shipping/*`

---

## 9. 当前后续建议

当前后续建议优先级：

1. 在现有模型上做 workflow enhancement
2. 做客户中心与客户详情的 bounded UI / IA 升级
3. 收口异步导入运行时文档、部署基线与可观测性说明
4. 单独规划 finance / reconciliation
5. 在新的 replayable migration 基线上继续维护 schema 变更

不建议：

- 重新设计交易模型
- 重开大范围 schema 里程碑
- 在没有新目标时随意重构 truth layer
- 在没有明确 scope 时顺手做全站 UI 重写

---

## 10. 验证基线

当前阶段封板和文档同步后，验证命令保持：

- `npx prisma validate`
- `npx prisma generate`
- `npm run lint`
- `npm run build`

如果联调异步导入，还要额外确认：

- Redis 可连接
- `npm run worker:lead-imports` 可正常启动
- 导入批次可被 worker 消费

---

## 11. 2026-04-03 Trade-Orders UX / Logistics Closeout

当前 `trade-orders` 视图的扫描效率与物流交互已经完成 closeout：

- 默认列表继续保持 `TradeOrder` 父单主叙事，不回退到子单主视角
- 状态列已经压薄为紧凑 2x2 履约摘要，不再使用厚重状态块
- supplier / batch / logistics 的低频补充信息已从默认行内移出
- 收货信息列中的物流现在只保留一个状态按钮：
  - hover：展示承运商和完整物流单号
  - click：打开次级物流轨迹面板
- 完整物流时间线继续留在次级层，不再回填到默认列表高度
- 物流查询链路已通过服务端适配层接入 `/api/logistics/track`

当前不建议再把 `trade-orders` 列表默认态重新扩回多行物流文本或底部展开块。

---

## 12. 当前部署基线补充

- 登录页 UI 已不再把 demo 账号与默认密码当作正式基线暴露
- 正式环境不再依赖 `prisma/seed.mjs` 初始化账号
- 首个管理员初始化应使用 `npm run admin:bootstrap`
- lead import worker 已纳入当前正式运行基线
- Redis 已成为异步导入链路的运行依赖
- 当前 staging / production 部署基线以 `docs/deployment-baseline.md` 为准
- 当前 Prisma migration rebaseline 已完成，空库正式环境可使用 `npx prisma migrate deploy`
- rebaseline 之前创建的旧环境，如数据库结构已与 `schema.prisma` 一致，需要先做一次 migration metadata reconcile

---

## 13. 当前 Staging 验收边界

当前建议进入 staging 验收的范围：

- 客户主线：`/customers`、客户详情、TradeOrder 建单入口
- 订单履约主线：`/fulfillment` 三视图与兼容跳转
- 商品域主线：`/products` 与 supplier 内嵌管理
- 公海池主线：ownership lifecycle、规则页、报表页、自动分配、自动回收
- 线索导入异步链路：Web、Redis、worker、批次状态推进
- 登录 / 部署基线：环境变量、Prisma 同步、首个管理员初始化、导出目录

当前不应混入 staging 验收范围：

- PBX / 外呼
- 新功能扩展
- 新 schema 改造
- 与当前 release 无关的二次 schema 重构
- 无边界全站 UI 翻修

---

## 14. Customer RecycleBinEntry Planning Addendum

当前对 `Customer recycle` 的交接结论已经固定如下：

- `Customer recycle` 只删除误建轻客户。
- `Customer recycle` 不替代 `/customers/public-pool` ownership lifecycle。
- `Customer recycle` 不替代 `DORMANT / LOST / BLACKLISTED`。
- `Customer recycle` 不替代 merge / merge release。
- 当前这一步只确认 `Customer` 的 planning 与 service contract，不展开 `Lead / TradeOrder / SalesOrder`。

轻客户 / 重客户固定边界：

- 轻客户：仅有基础识别信息，最多带当前 `ownerId`，仍处于 `ACTIVE + PRIVATE`，尚未进入 ownership、公海、跟进、成交、支付、履约、物流、归并链。
- 重客户：只要进入以下任一链路，就不能再按误建客户删除：
  - ownership lifecycle / public-pool / claim-lock
  - 销售跟进执行链
  - 成交 / 资金 / 履约 / 物流链
  - merge / import 审计链
- `ownerId` 单独存在不阻断 move；否则手工误建客户缺少纠错空间。

move guard 固定返回口径：

- 返回：
  - `mode = move`
  - `decision = movable | blocked`
  - `summary`
  - `targetSnapshot`
  - `blockers`
  - `blockerGroups`
- `targetSnapshot` 至少包括：
  - `targetType = CUSTOMER`
  - `targetId`
  - `name`
  - `phone`
  - `status`
  - `ownershipMode`
  - `ownerLabel`
- `blockers[]` 至少包括：
  - `code`
  - `name`
  - `group`
  - `description`
  - `suggestedAction`
- move 允许范围固定为：
  - `status = ACTIVE`
  - `ownershipMode = PRIVATE`
  - 无公海字段
  - 无 ownership event
  - 无跟进痕迹
  - 无订单 / 资金 / 履约 / 物流链
  - 无 merge 审计链
- `DORMANT / LOST / BLACKLISTED` 必须阻断 move。

restore guard 固定返回口径：

- 返回：
  - `mode = restore`
  - `decision = restorable | blocked`
  - `summary`
  - `targetSnapshot`
  - `blockers`
  - `blockerGroups`
- restore 固定规则：
  - `DORMANT / LOST / BLACKLISTED` 阻断 move，但不阻断 restore。
  - 跟进、成交、支付、履约、物流痕迹不阻断 restore。
  - restore 仅保留最小硬阻断：
    - `对象缺失`
    - `已完成归并且当前对象不应恢复为独立客户`

purge blocker 固定返回口径：

- 返回：
  - `mode = purge`
  - `decision = purgeable | blocked`
  - `summary`
  - `targetSnapshot`
  - `blockers`
  - `blockerGroups`
- purge 固定规则：
  - `purge` 是最严 guard。
  - move blocker 中的阻断项默认同时阻断 purge。
  - `关联线索`、`客户标签` 额外阻断 purge。

blocker 分组与建议动作固定为：

- `对象状态`
  - blocker：`对象缺失`
  - suggestedAction：确认原始客户记录是否仍存在。
- `客户生命周期`
  - blocker：`非 ACTIVE 客户`
  - suggestedAction：改走 `DORMANT / LOST / BLACKLISTED` 状态治理。
- `公海与归属链`
  - blocker：`公海客户`、`锁定客户`、`已有归属历史`
  - suggestedAction：改走 `/customers/public-pool` ownership lifecycle。
- `销售跟进痕迹`
  - blocker：`已有有效跟进时间`、`跟进任务`、`通话记录`、`微信记录`、`直播邀请`
  - suggestedAction：改走跟进终止、冻结、失效或公海治理。
- `成交与资金链`
  - blocker：`历史订单`、`成交主单`、`礼品记录`、`支付计划`、`支付记录`、`催收任务`
  - suggestedAction：在订单 / 支付域继续治理，不删除客户。
- `履约与物流链`
  - blocker：`发货任务`、`物流跟进`、`COD 回款记录`
  - suggestedAction：在履约 / 物流链继续治理，不删除客户。
- `归并与导入审计`
  - blocker：`归并审计链`、`关联线索`、`客户标签`
  - suggestedAction：保留 merge / import 审计上下文，不做 recycle 清理。
- `其他阻断`
  - suggestedAction：保留服务端原始返回，不做前端重写。

`/recycle-bin?tab=customers` 固定规划口径：

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

交接提醒：

- 服务端 guard 继续是唯一真相来源；前端只消费 `decision / blockers / blockerGroups`，不在组件里重写客户可删规则。
- 当前只进入实现前评审，不在这一步重开 schema、旧 migration 或页面接线。

---

## 15. Customer / TradeOrder Dual-Terminal Recycle Lifecycle Addendum

本节为当前有效交接口径，覆盖上一节仅面向 `Customer` 的单对象 recycle planning。

交接结论：

- `move` 与 `finalize` 解耦。
- `move` 的新语义是进入 `3` 天冷静期，不等于将来一定可以 `PURGE`。
- `finalize` 固定拆成两个终态：
  - `PURGE`
  - `ARCHIVE`
- `Customer` 与 `TradeOrder` 的 heavy 对象允许先进入 recycle，但最终只允许封存 / 脱敏归档，不允许物理删除。
- `Customer recycle` 不替代 `/customers/public-pool` ownership lifecycle，不替代 `DORMANT / LOST / BLACKLISTED`，不替代 merge / merge release。
- `TradeOrder recycle` 不替代取消 / 作废 / 关单，也不替代审核、拆单、支付、履约、物流链治理。

为什么不能“有关联也直接硬删”：

- `Customer` 一旦进入 ownership、公海、跟进、成交、支付、履约、物流、merge、import 审计链，硬删会破坏这些业务链的主锚点。
- `TradeOrder` 一旦进入审核、拆单、支付、催收、履约、导出、物流、COD 链，硬删会破坏成交主单与执行子链的真相链。
- 最终只会出现两种错误：
  - 级联删掉仍需保留的业务真相
  - 留下没有主锚点的孤儿记录
- 因此 move 可以放宽，但 finalize 必须拆成 `PURGE / ARCHIVE` 两条终态。

为什么 `ARCHIVE` 不能伪装成 `PURGED`：

- `PURGED` 表示对象与其可删上下文已经被真实清除。
- `ARCHIVE` 表示对象退出主工作台，但仍保留审计锚点、业务摘要或脱敏历史壳。
- 如果把 `ARCHIVE` 伪装成 `PURGED`，后续无法区分“真的删掉了”与“只是不再作为活跃对象返回”，会污染审计和生命周期语义。

Customer 规则：

- light Customer：
  - 误建轻客户。
  - 仅有基础识别信息，最多带当前 `ownerId`、客户标签等弱关联。
  - 仍处于 `ACTIVE + PRIVATE`。
  - 尚未进入 ownership、公海、claim lock、跟进、成交、支付、履约、物流、merge、import 审计链。
- heavy Customer：
  - 只要进入以下任一链路即视为 heavy：
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
- `Customer move` 成功后的语义：
  - 对象进入 `3` 天冷静期。
  - 不代表 `3` 天后一定能 purge。
  - 到期后必须以最新服务端真相重算 `PURGE` 或 `ARCHIVE`。
- `Customer finalize`：
  - light：`PURGE`
  - heavy：`ARCHIVE`
- `Customer ARCHIVE`：
  - 保留 customer id 与下游锚点。
  - 不再回到 `/customers` 主工作台。
  - 对 `phone / wechatId / address / remark` 做脱敏或清空。
  - `name` 仅保留最小可读掩码。

TradeOrder 规则：

- light TradeOrder：
  - 纯误建草稿单。
  - `tradeStatus = DRAFT`。
  - 尚未生成 `SalesOrder`。
  - 尚未进入审核、支付、催收、履约、导出、物流、COD 链。
- heavy TradeOrder：
  - 满足以下任一条件即视为 heavy：
  - 非 `DRAFT`
  - 已生成 `SalesOrder`
  - 已有 `paymentPlan / paymentRecord / collectionTask`
  - 已有 `shippingTask / exportLine / logisticsFollowUp / COD`
  - 已进入审核、驳回、取消、作废、关闭等正式业务语义
- TradeOrder move 放宽边界：
  - “有关联”本身不再自动等于不能 move。
  - 但仍不应把正在活跃支付、履约、物流执行中的订单直接放进 recycle，否则会破坏 `/fulfillment` 的当前执行真相。
  - move 放宽只适用于存在历史关联但已不再承担活跃执行主视图职责的对象。
- `TradeOrder finalize`：
  - light：`PURGE`
  - heavy：`ARCHIVE`
- `TradeOrder ARCHIVE`：
  - 保留 `tradeNo / customer snapshot / tradeStatus / reviewStatus / finalAmount` 及对子单、支付、催收、履约、导出、物流、COD 的锚点。
  - 对 `receiverName / receiverPhone / 地址快照` 做脱敏。
  - 不再作为主工作台活跃对象返回。

双终态 lifecycle contract：

- `move`
  - 新语义：进入 `3` 天冷静期。
  - 不等于将来一定能 `PURGE`。
- `restore`
  - 只允许在对象仍处于回收站冷静期、且尚未完成最终 `PURGE` 或 `ARCHIVE` 前执行。
  - 到达最终 `PURGE` 或最终 `ARCHIVE` 后，不再恢复回 active 对象。
  - `Customer` 补充：`DORMANT / LOST / BLACKLISTED` 阻断 move，但不阻断冷静期内 restore。
  - `TradeOrder` 补充：restore 不回滚原有取消 / 驳回 / 关闭等业务真相，只撤销 recycle 态。
- `finalize`
  - 触发点：进入回收站满 `3` 天。
  - 判断源：必须基于“最新服务端真相”重算。
  - 禁止只看 move 当时快照。
  - 固定终态：
    - `PURGE`
    - `ARCHIVE`
  - 判断规则：
    - 最新真相仍为 light：`PURGE`
    - 最新真相已为 heavy：`ARCHIVE`
- “提前永久删除”
  - 只对 light 对象开放。
  - 仅管理员可见。
  - heavy 对象不显示“永久删除”。

`/recycle-bin` 展示 contract：

- `customers` 与 `trade-orders` tab 都需要展示：
  - `可 purge`
  - `仅封存`
  - `剩余时间`
- 剩余时间固定用“距最终处理”口径展示。
- heavy 对象只显示：
  - `3 天后仅封存`
- blocker / summary 不再只回答“能不能删”，而要明确回答：
  - 为什么最终可 purge
  - 为什么最终仅封存

交接提醒：

- 这一步只固定规则和 contract，不重开 schema，不改旧 migration，不顺手改现有 recycle 实现。
- 后续实现必须先统一 lifecycle 语义，再做页面接线、按钮语义和最终处理执行。
- 服务端 guard 与 finalize 判定继续是唯一真相来源，前端只消费结果，不在组件里重写轻重对象判断。
- 当前只覆盖 `Customer / TradeOrder`，不顺手展开 `Lead / SalesOrder`。
