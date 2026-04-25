# 2026-04-25 Order Center Workbench Redesign Plan

## Scope

重构订单中心 UI / IA，使 `/fulfillment?tab=trade-orders` 更好用、方便、功能更强且视觉更高级。

本计划覆盖：

- `/fulfillment?tab=trade-orders` 父单列表工作台
- `/fulfillment?tab=shipping` 与父单列表之间的上下文跳转体验
- `/fulfillment?tab=batches` 批次入口在订单中心里的呈现方式
- `/orders` 兼容入口继续 redirect 到 `/fulfillment?tab=trade-orders`
- `/orders/[id]` 详情页保持 parent-first，作为第二阶段单独优化

本计划不覆盖：

- Prisma schema 变更
- 交易、支付、履约 truth layer 变更
- 创建订单主入口迁移
- 旧 `SalesOrder` 作为主单的回退
- payment / fulfillment 责任混用

## Invariants（不变量）

- `TradeOrder` 仍是成交主单，订单中心必须 parent-first。
- `SalesOrder` 仍是 supplier 子单，只作为履约执行粒度展示。
- 一个 `TradeOrder` 可以拆出多个 supplier 子单；每个 supplier 子单代表一个独立发货来源。
- 多 supplier 订单必须支持多物流单号：一个 supplier 子单对应自己的 `ShippingTask`、物流单号、发货状态、COD / 保价执行结果。
- 订单中心展示父单时不能把多 supplier 履约压扁成一个物流状态，只能显示汇总与异常提示；具体发货动作必须下钻到 supplier 子单 / shipping 执行视图。
- `/fulfillment` 仍是订单与履约域唯一一级主入口。
- `/orders` 仍只是兼容入口，不重新变成一级主工作台。
- 创建订单仍从客户详情主入口进入：`/customers/[id]?tab=orders&createTradeOrder=1`。
- 发货执行仍从 `/fulfillment?tab=shipping` 承接，不把发货操作塞回父单列表。
- 批次记录仍从 `/fulfillment?tab=batches` 承接，不把批次审计混进父单行内。
- RBAC 仍由服务端查询和 action 保证，不能只靠隐藏按钮。
- 重要动作继续写 `OperationLog`，不改已有审计链。
- loading / empty / error 状态必须保留。

## Current Problems

1. 信息过密但层级不清：父单、子单、支付、履约、批次入口同时堆在行内。
2. 行卡片过长：单条订单承担了列表、详情、执行摘要、跳转菜单多个职责。
3. 筛选区像表单，不像工作台 control surface。
4. 状态语言不够聚焦：审核、履约、收款、批次状态同时出现，主行动不明显。
5. 兼容文案和历史 mojibake 影响可读性，也增加维护风险。
6. 管理者和销售查看订单时缺少不同优先级：管理看异常和待审，销售看自己订单进度。

## Target UX

### Page Structure

1. Header：短标题 + 当前角色视角 + 主要 CTA。
2. Summary：4 个核心指标，聚焦待审、待发货、履约异常、成交金额。
3. Control Bar：搜索优先，状态/focus/supplier 收进紧凑筛选条。
4. Work Queue：订单列表主内容，默认只展示决策必要信息。
5. Context Rail：右侧或下方显示当前筛选下的异常、待审、发货提示和快捷跳转。

### Trade Order Row

每行只保留 5 类信息：

- 身份：父单号、客户、销售、更新时间
- 金额：成交金额、支付进度摘要
- 商品：最多 2 行商品摘要 + 件数
- 执行：子单数量、发货阶段、异常数量
- 动作：查看详情、审核、去发货、更多

多 supplier 订单的行内展示规则：

- 父单行显示“2 个 supplier / 2 个物流任务”这类汇总，不直接展示一个伪物流单号。
- 如果只有一个 supplier 子单，可以在行内显示该子单的发货阶段和物流摘要。
- 如果有多个 supplier 子单，行内显示 supplier chips / count，并提供“查看履约拆分”或“去发货执行”的下钻入口。
- 异常优先级高于普通进度：任一 supplier 子单异常时，父单行进入异常提示态。

隐藏或折叠：

- 完整子单列表
- 完整支付记录
- 完整物流详情
- 批次文件信息
- 回收站高级信息

这些内容进入详情页、hover/popover 或下钻入口。

### Filters

- 第一优先级：关键词搜索（父单号、客户、电话、收件人、商品）。
- 第二优先级：工作队列 tab：全部 / 待审 / 待发货 / 待物流 / 已发货 / 异常。
- 第三优先级：supplier、成交状态、子单数量、排序，放到 compact advanced filter。
- 保留 URL search params，确保分享和回退可用。

### Visual Direction

- Linear/Cohere 风格 workbench。
- 轻量表格或 dense row card，不做大块营销式卡片。
- 用少量 accent 标记主行动，不用彩虹状态。
- 操作按钮分主次：主按钮最多 1 个，其他进入 secondary/more。

## Implementation Checklist

### Phase 1 — Stabilize Existing Order Center

- 修复 `components/trade-orders/trade-orders-section.tsx` 中破损中文文案和未闭合字符串风险。
- 修复 `components/fulfillment/order-fulfillment-center.tsx` 中破损中文文案和 KPI label。
- 不改数据查询、不改 action、不改 route。
- 验证 `/fulfillment?tab=trade-orders`、`/orders` redirect、`/orders/[id]` 仍可构建。

### Phase 2 — Recompose Fulfillment Shell

- 调整 `components/fulfillment/order-fulfillment-center.tsx`：
  - Header 简化为“订单中心”。
  - Summary 重排为成交主单维度 KPI。
  - Toolbar 改成主 tab + current context strip。
- 保留 `RecordTabs` 和已有 URL tab 逻辑。
- 不改变 `buildOrderFulfillmentHref*` 行为。

### Phase 3 — Rebuild Trade Order List Workbench

- 在 `components/trade-orders/trade-orders-section.tsx` 内重构列表：
  - 顶部 compact filter bar。
  - 状态/focus 作为 work queue tabs。
  - 订单行拆成 `TradeOrderRowHeader`、`TradeOrderExecutionStrip`、`TradeOrderActionCluster`。
- 将低频信息折叠进 `<details>` 或 secondary area。
- 保留审核、回收、详情、发货、批次跳转行为。

### Phase 4 — Strengthen Action Routing

- 明确 CTA：
  - 待审：主 CTA 是审核。
  - 待发货/待物流：主 CTA 是去发货执行；多 supplier 父单必须跳到带父单号 keyword 的 shipping 视图，不在父单行内直接填单号。
  - 已发货：主 CTA 是看物流/详情。
  - 异常：主 CTA 是去异常发货视图。
- 保留 “去客户中心建单” 入口，不从订单中心直接新建无客户订单。

### Phase 5 — Detail Page Follow-up

- 单独优化 `components/trade-orders/trade-order-detail-section.tsx`。
- 顶部改成主单 dossier：金额、审核、支付、履约状态一屏读完。
- 子单、支付、履约、日志拆成清晰 sections。
- 继续支持 child-id fallback。

## Validation Strategy

每阶段至少执行：

```bash
npm run lint
npm run build
```

关键手动验证：

- `/fulfillment?tab=trade-orders`
- `/fulfillment?tab=trade-orders&focusView=PENDING_REVIEW`
- `/fulfillment?tab=shipping`
- `/fulfillment?tab=batches`
- `/orders` redirect
- `/orders/[tradeOrderId]`
- `/orders/[salesOrderId]` child fallback
- 管理员、主管、销售、发货员的入口和可见性

数据验证：

- 待审数量不变
- 成交金额不变
- 子单数量不变
- 多 supplier 父单的 supplier 数、子单数、物流任务数不被合并丢失
- 多物流单号在详情页和 shipping 执行页仍按 supplier 子单分别展示
- 发货阶段跳转 search params 正确
- 批次跳转仍带 `keyword` 或 `exportNo`

## Rollback Notes

- 该重构应只改 UI components 和少量显示 helper。
- 不改 Prisma schema，不需要 migration rollback。
- 若列表体验有问题，可优先回滚：
  - `components/trade-orders/trade-orders-section.tsx`
  - `components/fulfillment/order-fulfillment-center.tsx`
- 若详情体验有问题，可单独回滚：
  - `components/trade-orders/trade-order-detail-section.tsx`
- 路由文件和 server actions 不应在本重构中变更；若误改应立即回滚。

## Recommended Execution

建议下一 session 先做 Phase 1 + Phase 2，控制影响面：

1. 先修破损文案，保证现有订单中心稳定构建。
2. 再重排 fulfillment shell 的 header / summary / toolbar。
3. build 通过后再进入 TradeOrder list 重构。
