# HANDOFF
更新时间：2026-04-10

## 当前交接结论

当前仓库已经从“模型切换期”进入“正确模型上的工作流增强期”。

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

### 公海池 ownership lifecycle

- `/customers/public-pool` 已落地为 Customer ownership lifecycle 工作台
- `CustomerOwnershipEvent` 已作为 ownership 审计链真相接线
- Phase 1 工作台、Phase 2 自动回收 / 离职回收、Phase 3 自动分配引擎、Phase 4 团队规则页与报表页均已落地
- 团队级 auto-assign 已支持 `ROUND_ROBIN / LOAD_BALANCING / preview / apply / round-robin cursor`

### 订单履约中心

- Phase 1 已完成：统一域入口、IA 收口、旧路由兼容
- Phase 2 已完成：发货执行 supplier 工作池首版
- Phase 3 已完成：交易单 / 批次记录收口与跨视图联动

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
- 不要重开 schema 改造，除非有明确硬缺字段
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