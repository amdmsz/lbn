# 酒水私域 CRM 阶段封板文档

## 文档状态
- 日期：2026-04-03
- 性质：阶段封板 / 基线冻结
- 作用：冻结当前仓库真实业务基线、信息架构、执行边界与后续接手共识

---

## 1. 封板结论

截至当前阶段，仓库已经完成从旧 `SalesOrder` 主单认知向 `TradeOrder -> SalesOrder -> ShippingTask` 新主链的切换，系统当前的核心问题已经不再是模型方向错误，而是如何在现有正确模型上继续做业务域收口与工作台增强。

当前可视为已形成稳定基线的部分：

- 客户运营主线已稳定：`Lead` 做导入、去重、分配与审计，`Customer` 做销售执行与长期经营。
- 交易主线已稳定：`TradeOrder` 是成交主单，`SalesOrder` 是 supplier 子单。
- 商品成交语义已稳定：`TradeOrderItem / TradeOrderItemComponent` 是销售语义与执行拆分真相。
- 支付与履约分层已稳定：payment truth 在 `PaymentPlan / PaymentRecord / CollectionTask`，fulfillment truth 在 `ShippingTask / ShippingExportBatch / ShippingExportLine / LogisticsFollowUpTask / CodCollectionRecord`。
- 订单履约中心已成型：`/fulfillment` 已成为统一业务域入口，域内承接 `交易单 / 发货执行 / 批次记录` 三视图。
- 发货执行已完成 supplier 工作池首版，批次导出真相已切到 `ShippingExportLine` 冻结快照。

这意味着：

- 不应再回退到旧 `SalesOrder` 作为交易主单的思路。
- 不应再为了“统一页面”去打散现有分层 truth layer。
- 后续优化应优先围绕业务域组织、执行联动、审计可读性和工作流效率展开。

---

## 2. 当前产品主链

### 2.1 客户与销售主链

- `Lead`：导入、来源、去重、分配、审计。
- `Customer`：销售执行主对象。
- `Customer.ownerId`：销售 ownership 主字段。
- Sales 主要工作区仍是 `/customers`，不是 `/leads`。

### 2.2 交易主链

- `TradeOrder`：一次商业成交的主单真相。
- `TradeOrderItem`：销售侧父行，承接 `SKU / GIFT / BUNDLE` 语义。
- `TradeOrderItemComponent`：执行拆分真相，负责 supplier grouping、gift component、bundle component。
- `SalesOrder`：一个 supplier 子单，只做 supplier 范围内的执行锚点，不再承担交易真相。

### 2.3 支付主链

- `PaymentPlan`：应收结构。
- `PaymentRecord`：实际提交的收款记录。
- `CollectionTask`：待催收和跟进任务。

### 2.4 履约主链

- `ShippingTask`：supplier 子单级履约执行记录。
- `ShippingExportBatch`：导出批次实体。
- `ShippingExportLine`：冻结导出快照真相。
- `LogisticsFollowUpTask`：物流跟进任务，独立于订单状态和 shipping status。
- `CodCollectionRecord`：COD 履约侧回款结构。

---

## 3. 当前真实模型基线

### 3.1 交易结构

- `TradeOrder = 成交主单`
- `SalesOrder = supplier 子单`
- 一个 `TradeOrder` 可以拆成多个 `SalesOrder`
- 一个 `SalesOrder` 仍只允许一个 `supplierId`
- cross-supplier deal 必须拆成多个 supplier 子单

### 3.2 商品与执行拆分

- `TradeOrderItem` 支持 `SKU / GIFT / BUNDLE`
- `TradeOrderItemComponent` 是执行拆分真相
- 普通 SKU、赠品、套餐组件都通过 component 层进入 supplier grouping
- 执行层以 materialized `SalesOrderItem` 为履约对象，而不是直接以 bundle 父行或 gift 兼容表履约

### 3.3 Gift / Bundle 写路径

- GIFT 新写路径已完成：`TradeOrderItem(type=GIFT) + TradeOrderItemComponent(type=GIFT)`
- BUNDLE 新写路径已完成：bundle 父行进入 `TradeOrderItem(type=BUNDLE)`，展开组件进入 `TradeOrderItemComponent`
- 不再回头把 gift 主链写回 `SalesOrderGiftItem`
- `GiftRecord` 继续保留其营销与资格语义，不与订单 gift 主链混用

### 3.4 Review / Payment / Fulfillment 边界

- `TradeOrder.reviewStatus` 是主审核真相
- `SalesOrder.reviewStatus` 只是兼容镜像
- 审核通过后才初始化 payment / fulfillment artifacts
- payment truth 继续留在 payment layer
- fulfillment truth 继续留在 fulfillment layer

---

## 4. 当前信息架构基线

### 4.1 一级业务域

当前仓库的一线业务入口已经不是按表拆页，而是按业务域组织：

- 客户运营
- 商品域
- 订单履约中心
- 收款协同
- 设置 / 报表

### 4.2 商品域

当前商品域基线已经收口完成：

- `/products` 是商品域唯一一级入口
- 供货商管理已经收进 `/products?tab=suppliers`
- `/suppliers` 仅作为兼容跳转页保留
- 新建商品与商品详情编辑已经统一 supplier 交互模式：
  - 可搜索选择 supplier
  - 可原地新增 supplier
  - 新增成功后自动回填 supplier，不丢失当前商品表单输入

### 4.3 订单履约中心

当前 `订单履约中心` 已落地为统一业务域：

- 入口：`/fulfillment`
- 域内三视图：
  - `交易单`
  - `发货执行`
  - `批次记录`

兼容路由：

- `/orders -> /fulfillment?tab=trade-orders`
- `/shipping -> /fulfillment?tab=shipping`
- `/shipping/export-batches -> /fulfillment?tab=batches`

---

## 5. 订单履约中心当前封板基线

### 5.1 交易单

主对象：`TradeOrder`

当前定位：

- 成交审核入口
- 父单总览入口
- supplier 拆单结果回看入口
- 父单履约摘要入口

当前已具备：

- `TradeOrder` 父单列表
- supplier 子单数摘要
- 履约阶段摘要：
  - 待报单 supplier 子单
  - 已报单待物流子单
  - 已发货子单
  - 履约异常子单
- 最近相关 batch 引用
- 跳转到 `发货执行 / 批次记录` 的域内快捷入口

当前仍然坚持：

- 主叙事对象是 `TradeOrder`
- `SalesOrder / ShippingTask / ShippingExportBatch` 只作为摘要或跳转上下文
- 不把交易单页做成第二个发货执行页

### 5.2 发货执行

主对象：`SalesOrder + ShippingTask`

当前定位：

- supplier 工作池
- 发货员日常执行入口
- 按阶段推进报单、回物流、发货结果更新

当前已具备：

- 顶部阶段切换：
  - 待报单
  - 已报单待物流
  - 已发货
  - 履约异常
- supplier 汇总条
- 当前 supplier 发货池
- supplier 级批量动作：
  - 批量生成批次
  - 下载最新文件
  - 重生成最新文件
  - 批量回填物流

当前仍然坚持：

- 主叙事对象是 supplier 子单执行
- `TradeOrder` 只做父单上下文
- `ShippingExportBatch` 只做执行结果，不反过来抢执行入口

### 5.3 批次记录

主对象：`ShippingExportBatch + ShippingExportLine`

当前定位：

- 冻结结果页
- 文件下载页
- 重生成入口
- 历史审计页

当前已具备：

- 批次号、supplier、导出时间
- 冻结行数 / 子单数 / 父单数
- 文件状态表达
- 文件下载 / 重生成
- 回到来源 `TradeOrder`
- 回到来源发货执行上下文

当前仍然坚持：

- 批次记录退居二线
- 不再承担第一执行工作台角色
- 发货执行仍然先于批次记录

---

## 6. M8A / M8B / 履约中心阶段成果

### 6.1 M8A：ShippingExportLine runtime 已切流

当前导出链路已经不是运行时临时拼接，而是：

1. 先生成 `ShippingExportLine drafts`
2. 事务内写入：
   - `ShippingExportBatch`
   - `ShippingExportLine`
   - `ShippingTask.reportStatus`
   - `OperationLog`
3. 事务后基于 `ShippingExportLine` 生成文件并回写 `fileName / fileUrl`

当前真相：

- 导出文件基于冻结快照生成
- 重复导出读取同一批 `ShippingExportLine`
- 历史回看与审计以快照为准
- 文件生成失败时允许 `fileUrl` 为空，但不回滚已冻结 lines

### 6.2 M8B / M8B.5：商品中心与 supplier 管理收口

已完成：

- 商品中心合并供货商管理
- `/suppliers` 改为兼容跳转
- 商品新建与详情编辑统一 supplier 交互
- supplier 次级视图已有轻量搜索与状态筛选

### 6.3 订单履约中心 Phase 1 ~ Phase 3

当前可视为已完成：

- Phase 1：IA 收口与统一域入口
- Phase 2：发货执行 supplier 工作池首版
- Phase 3：交易单 / 批次记录收口与跨视图联动

当前闭环已经形成：

- `交易单 -> 发货执行`
- `交易单 -> 批次记录`
- `批次记录 -> 发货执行`
- `批次记录 -> 交易单`

---

## 7. 角色基线

### ADMIN

- 全平台可见
- 可进入全部客户、交易、收款、履约、设置和日志视图

### SUPERVISOR

- 团队级 owner
- 可审核父单
- 可协调团队履约与收款

### SALES

- 主工作区是 `/customers`
- 可进入订单履约中心中的 `交易单`
- 不以 `/shipping` 作为主操作工作台

### SHIPPER

- 主工作区是 `订单履约中心 -> 发货执行`
- 处理 supplier 维度报单、导出、回填物流、推进履约

### OPS

- 仍以直播与运营协同为主
- 不因当前收口而获得销售客户视图或发货操作主权

---

## 8. 当前明确冻结的边界

以下边界在当前阶段必须保持稳定：

- 不回退到旧 `SalesOrder` 主单认知
- 不改 `TradeOrder / SalesOrder` 父子单模型
- 不改 `/shipping /payment-records /collection-tasks` 的子单执行主粒度
- 不把 payment truth 压回订单状态字段
- 不把 fulfillment truth 压回父单字段
- 不把 `GiftRecord` 和订单 gift 主链混成一条链
- 不扩展 legacy `Order`
- 不扩展 legacy `ShippingTask.orderId`
- 重要动作继续写 `OperationLog`

---

## 9. 当前已知技术与文档债

### 9.1 文档债

- `PRD.md / PLANS.md / HANDOFF.md` 中仍有一部分历史阶段表述，未完全同步到当前“订单履约中心 Phase 3 已完成”的现实基线。
- 本文档应视为当前阶段封板的真实基线说明。

### 9.2 Migration 风险

根据当前 handoff 历史记录：

- `npx prisma validate` 与 `npx prisma generate` 已是当前稳定验证路径
- 历史 `prisma migrate dev` 链可能仍存在旧 migration shadow database 问题

因此当前原则是：

- 没有新的 schema 里程碑前，不主动触碰 migration 链清理
- 后续若进入 schema 变更阶段，应单独开 migration 修复范围，不与业务功能混做

### 9.3 后续未完成但已明确方向的内容

- 发货执行 supplier 工作池的更深层交互仍可继续深化
- 批次历史 backfill 仍可后续补齐
- 更深的 finance / reconciliation 域仍未启动为当前主线

---

## 10. 下一阶段建议

当前阶段封板后，后续继续推进应遵守以下原则：

1. 先做工作流增强，不先动 schema
2. 先做业务域闭环增强，不回退到技术对象拆页
3. 先做履约、审计、主管视角可读性，不盲目扩展新大域

推荐后续方向：

- 围绕订单履约中心继续做更深的联动增强
- 或单独开启 finance / reconciliation 首版
- 或单独修复 Prisma 历史 migration 链

不建议：

- 在当前阶段重新设计交易模型
- 重新把批次记录升回主入口
- 把 `/shipping` 父单化
- 在没有新 schema 目标时随意修改 Prisma schema

---

## 11. 新接手时的阅读顺序

若后续由新账号或新线程继续接手，建议先读：

1. `AGENTS.md`
2. `PRD.md`
3. `PLANS.md`
4. `STAGE_FREEZE_2026-04-03.md`
5. `app/(dashboard)/fulfillment/page.tsx`
6. `components/fulfillment/order-fulfillment-center.tsx`
7. `components/trade-orders/*`
8. `components/shipping/*`
9. `lib/trade-orders/*`
10. `lib/shipping/*`

---

## 12. 封板摘要

当前项目已经完成以下关键转折：

- 交易主链完成 V2 切换
- GIFT / BUNDLE 新写路径完成
- 商品中心与 supplier 管理完成收口
- 订单履约中心完成 IA 收口、supplier 工作池首版和三视图联动闭环
- 导出真相完成切换到 `ShippingExportLine`

从当前阶段开始，项目已不再处于“模型还没定”的阶段，而是进入“在正确模型上继续增强企业级工作流与审计闭环”的阶段。
