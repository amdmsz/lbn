# 2026-05-22 Order, Shipping, and Product UI Cutover Plan

## 状态

- Status: proposed, pending implementation
- Scope: 订单中心 / 发货执行 / 下单流程 / 商品中心的 UI 与交互收口
- Trigger: 用户要求把订单页、发货页、创建订单页、商品页都做得更清晰、更适合财务和发货实操

---

## 1. 目标

把当前偏“信息堆叠”的交易工作台，收口成一套清晰、安静、可扫读的业务界面：

- 订单页更像 workbench，不像杂项信息展示板
- 发货页更像执行台，不像说明文档拼贴
- 下单页更像“点客户 -> 加商品 -> 选数量/付款方式 -> 确认金额”的高效流程
- 商品页更像商品管理台，不像字段堆砌页面

最终要达到的体验是：

- 一眼能看懂当前该做什么
- 少文案、少噪音、少无效层级
- 多箱酒、多物流单号、多 supplier 场景能顺手处理
- 主管以上角色可以更快完成审核、发货、对账和导出

---

## 2. Scope

### 2.1 Primary surfaces

- `/fulfillment?tab=trade-orders`
- `/fulfillment?tab=shipping`
- `/customers/[id]?tab=orders&createTradeOrder=1`
- `/products`

### 2.2 Related support surfaces

- `components/trade-orders/*`
- `components/shipping/*`
- `components/products/*`
- `components/customers/*` 的建单入口
- `lib/trade-orders/*`
- `lib/shipping/*`
- `lib/products/*`

### 2.3 Out of scope

- 不做整站大改
- 不改 payment / fulfillment truth layer 的业务归属
- 不重写 RBAC 基线
- 不在本阶段做大范围 schema 迁移，除非多物流单号确实没有承载方式
- 不把订单中心重新变成创建订单主入口

---

## 3. Invariants

- `TradeOrder` 仍是成交主单
- `SalesOrder` 仍是 supplier 子单 / 执行粒度
- 发货真相仍归 `ShippingTask / ShippingExportBatch / LogisticsFollowUpTask`
- 支付真相仍归 `PaymentPlan / PaymentRecord / CollectionTask`
- 创建订单仍从客户详情主入口进入
- 订单中心只负责查看、筛选、审核、跳转，不把所有执行动作塞回列表
- 发货执行页必须支持一个订单下多个箱、多个物流单号的表达
- 重要动作仍然写 `OperationLog`
- RBAC 必须服务端生效，不只靠前端隐藏按钮
- loading / empty / error 状态必须保留

---

## 4. 主要问题

1. 订单中心信息层级太散，父单、子单、支付、物流、批次混在一起，扫读成本高。
2. 发货页文案太多，像操作说明书，不像发货台。
3. 多箱酒 / 多物流单号场景没有足够顺手的录入方式。
4. 下单页步骤太重，不符合“选客户后快速建单”的实际操作。
5. 商品页布局偏乱，字段和筛选噪音过多。
6. 财务和发货员需要的字段没有被优先排在第一屏。

---

## 5. Target UX

### 5.1 Order center

- 顶部只保留当前页标题、关键指标、主搜索、少量状态筛选
- 订单行以“客户 / 金额 / 商品摘要 / 发货进度 / 异常”五类信息为主
- 多 supplier 订单显示聚合摘要，不在列表里伪装成单一物流号
- 行内动作保持少而清晰：详情、审核、去发货、更多
- 低频信息折叠到详情页或展开区

### 5.2 Shipping

- 页面主任务是“把货发出去”，不是讲业务规则
- 输入区按操作顺序组织：
  1. 选订单 / supplier 子单
  2. 填箱数 / 物流单号 / 承运方
  3. 确认发货状态
  4. 提交
- 多箱酒必须能拆分录入，不能只靠单个 tracking number
- 异常、补录、改号、补箱等动作要有清晰主次
- 文案尽量压缩成字段标签和短提示

### 5.3 Order creation

- 先点客户，再进入建单
- 主流程是：
  - 选客户
  - 加商品
  - 填数量
  - 选付款方式
  - 确认金额
- 如果要继续加第二个订单，提供明显的 `+` 视觉入口，支持继续追加商品 / 新订单块
- 页面应尽量像“订单编辑器”，而不是完整 CRM 表单

### 5.4 Products

- 商品页要更像商品台账和操作台
- 列表、筛选、详情、供应商信息要分层
- 减少重复标签、冗长说明和视觉噪音
- 保留关键库存 / 价格 / 状态 / 供应商关系的快速判断能力

---

## 6. Implementation Plan

### Phase 1 — 信息架构收口

- [ ] 梳理订单中心、发货页、下单页、商品页的第一屏信息优先级
- [ ] 统一页面标题、主 CTA、筛选条、表格行、空态的风格
- [ ] 清理明显冗余的文案和重复说明
- [ ] 确认多箱 / 多物流单号的数据承载方式

Exit criteria:

- 四个主页面的视觉语言和操作顺序先统一起来

### Phase 2 — Order Center Rebuild

- [ ] 重构 `/fulfillment?tab=trade-orders` 的列表层级
- [ ] 把父单、子单、支付、发货摘要拆成更清楚的视觉块
- [ ] 多 supplier / 多物流任务用聚合摘要表达
- [ ] 强化待审、待发货、异常三种主要工作队列
- [ ] 保留原有跳转与权限，不改主数据流

Exit criteria:

- 订单页一眼能扫出该处理什么，不再像一张拼接表

### Phase 3 — Shipping Workbench Rebuild

- [ ] 重排 `/fulfillment?tab=shipping` 的操作顺序
- [ ] 把发货文案压缩成字段化、动作化表达
- [ ] 支持一个订单多箱、多物流单号的录入体验
- [ ] 将补录、改号、异常处理放入清晰的 secondary area
- [ ] 保留发货、履约、批次的现有 truth 层

Exit criteria:

- 发货员可以不看一大段说明，也知道怎么完成发货

### Phase 4 — Customer-Scoped Order Composer

- [ ] 让客户详情页里的建单入口更像“订单编辑器”
- [ ] 以客户为起点进入建单，不再要求用户先理解太多系统结构
- [ ] 商品选择、数量、付款方式、金额确认做成线性流
- [ ] 为追加第二个订单提供明显 `+` 入口
- [ ] 让下单过程更适合实际销售动作

Exit criteria:

- 销售可以在客户页快速完成一单或多单追加

### Phase 5 — Product Center Cleanup

- [ ] 压缩商品中心的筛选和说明文字
- [ ] 重新整理商品列表、详情、供应商信息的层次
- [ ] 让商品页更利于快速查找、比价和维护
- [ ] 保留供应商和商品状态的关键判断信息

Exit criteria:

- 商品页更清晰、更像运营台账，而不是信息拼盘

---

## 7. Validation Strategy

每个 phase 至少验证：

```bash
npm run lint
npm run build
```

关键手动验证：

- `/fulfillment?tab=trade-orders`
- `/fulfillment?tab=shipping`
- `/customers/[id]?tab=orders&createTradeOrder=1`
- `/products`
- 主管以上账号的审核、发货、删除、导出权限
- 多箱酒订单的多物流单号录入与展示
- 订单追加第二单的 `+` 交互

业务验证：

- 父单金额、子单数量、物流任务数不丢失
- 发货状态与物流单号能正确追踪到对应子单 / 箱
- 财务关心的字段在导出和列表中仍可找到
- OperationLog 没有断

---

## 8. Rollback Notes

- 该计划应按页面拆分成独立 patch
- 订单页、发货页、下单页、商品页不要混成一个 mega diff
- 如果某个 phase 影响扫描速度或操作路径，优先回滚该 phase
- 如发现多物流单号当前 schema 无法表达，先停在 schema 兼容方案，不直接做 UI 假实现

---

## 9. Recommended Next Step

建议下一轮按这个顺序做：

1. 先确认多箱 / 多物流单号的数据表达方式
2. 再重构 `/fulfillment?tab=trade-orders`
3. 然后重构 `/fulfillment?tab=shipping`
4. 接着收口客户内建单流程
5. 最后整理 `/products`

