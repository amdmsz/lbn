# Trade Order Revision (Phase A + A.1) 测试 Checklist

> **目的**: 给业务方 / QA 在 staging 或生产灰度验证整个 "客户反悔" 流程, 覆盖整夜 15 个 commits 实施的所有路径.
> **范围**: commit `c368d2b` (Phase A MVP) + `1244966` (Phase A.1 REDUCE_QUANTITY) + `9f20f43` (review 自修) + `afa31f1` + `2f53c81` (深度 vector 修).
> **预估**: 全跑 15-20 min.

---

## 前置准备

1. 用 **SUPERVISOR** 账号(例如 `supervisor1`)登录 `https://crm.cclbn.com`
2. 准备一张已审核 (APPROVED) 的 TradeOrder, 含 2 行 SKU, 数量分别为 10 / 5
3. 准备一个 **SALES** 账号(订单 owner)

---

## 用例 1: 整单撤销 (CANCEL kind)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 打开订单详情 `/orders/<id>` | 顶部出现 amber "客户反悔/调整需求?" 卡 + "申请撤单/减量" 按钮 |
| 2 | 点击按钮 | 弹窗显示 "整单撤销 / 减少数量" 两个 tab |
| 3 | 选 "整单撤销", 写 4+ 字原因, 点 "提交申请" | 弹窗关闭, 顶部变 "撤单申请审批中" banner, 订单状态 chip 变 "撤单审批中" |
| 4 | 切换到 SUPERVISOR 账号, 打开同一订单 | 看到 banner + "通过撤单/驳回" 按钮 |
| 5 | 点 "通过撤单" | 订单状态变 "已取消", 顶部 banner 消失, 列表里所有 SalesOrder 变 CANCELED, 所有 ShippingTask 变 CANCELED |
| 6 | 在 `/shipping` 查 | 之前的 ShippingTask 不在 active 列表 |
| 7 | 在 `/payment-records` 查 | 之前未确认的 PaymentRecord 消失 |
| 8 | 在 `/collection-tasks` 查 | 之前的 CollectionTask 消失 |
| 9 | 在 `/customers/<id>` 看金额面板 | 该订单的 collectedAmount/paidAmount = 0 (上一轮 sync 的残值已清) |

---

## 用例 2: 减少数量 (REDUCE_QUANTITY kind)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 点 "申请撤单/减量" | 弹窗 |
| 2 | 选 "减少数量" tab | 展开行级输入: 行 1 (qty=10), 行 2 (qty=5) |
| 3 | 改行 1 从 10 → 5, 行 2 不动 | 行 1 框变 amber 边框,"至少减一行" 提示消失 |
| 4 | 写原因 ("客户预算缩减") + 提交 | 成功, banner 显示 "撤单审批中 · 减少数量" |
| 5 | SUPERVISOR 通过 | 订单状态变 "草稿" (DRAFT, 不是 CANCELED) |
| 6 | SALES 重新打开订单详情 | 商品行 1 的 qty 变 5, 行 2 仍 5, 金额按新 qty 自动重算 |
| 7 | SALES 点 "继续编辑" → 重新提交审核 | 走原 submit 流程, 重新拆 SalesOrder, 主管二审 |

---

## 用例 3: 减量到 0 (变相删行)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 同 #2, 但把行 1 的 qty 改成 **0** | 框 amber 边框 |
| 2 | 主管通过 | 订单回 DRAFT, 商品行 1 **消失** (TradeOrderItem 删了), 相关 TradeOrderItemComponent 也删除 |

---

## 用例 4: 销售本人撤回 (Withdraw)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起 CANCEL 申请 (用例 1 步 1-3) | banner 出现 |
| 2 | 同 SALES 再打开订单, banner 上有 "撤回申请" 按钮 | (主管账号看不到此按钮) |
| 3 | 点 "撤回申请" | banner 消失, 订单状态恢复 APPROVED, "申请撤单/减量" 按钮再次出现 |

---

## 用例 5: 主管驳回

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起任意申请, SUPERVISOR 打开 | 看到 "通过/驳回" |
| 2 | 写复审备注 ("证据不足") + 点 "驳回" | 订单状态恢复 APPROVED, banner 消失, RevisionRequest 状态 REJECTED 留痕 |
| 3 | SALES 重新打开订单 | 可以再次发起申请 |

---

## 用例 6: 阻断 — 已发货

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 让 OPS 把订单的 ShippingTask shippedAt 填实 (例如 OPS 报单录入运单号 + 标已发货) | 不影响 TradeOrder.tradeStatus |
| 2 | SALES 打开订单 | "申请撤单/减量" 按钮 **disabled** (灰色) |
| 3 | hover 鼠标 | tooltip 显示 "本订单已有 N 张发货任务进入物流环节, 需走退货流程 (阶段 C, 待开发)" |
| 4 | 卡片下方显示阻断列表 (amber 横条) | "已发货" / "已财务确认" 等具体原因列表 |

---

## 用例 7: 阻断 — 财务已确认

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 让 FINANCE/SUPERVISOR 确认一条 PaymentRecord (status=CONFIRMED) | 同上 |
| 2 | SALES 打开订单 | "申请撤单" disabled, tooltip 显示 "已有 N 条财务已确认的收款, 需走退款流程 (阶段 B, 待开发)" |

---

## 用例 8: REVISION_PENDING 不可绕过 ⭐(关键 regression 测试)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起 CANCEL 申请, 进入 REVISION_PENDING | banner 出现 |
| 2 | SALES 不撤回, 直接打开 `/customers/<id>?tab=orders&createTradeOrder=1&tradeOrderId=<id>` 想重新编辑这张订单 | server 拒, 错误提示: "本订单正在撤单/减量审批中, 请先等主管复审或撤回申请" |
| 3 | 验证: 订单状态仍是 REVISION_PENDING, 没被打回 DRAFT | banner 仍在, RevisionRequest 仍是 PENDING |

---

## 用例 9: Race — 同订单 2 个 PENDING revision ⭐

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 在浏览器 A 提交 CANCEL 申请, 同一时刻 SUPERVISOR 在浏览器 B 也提交一个 CANCEL 申请 | 只有一个能成功, 另一个抛 "本订单已有一个撤单/减量申请正在审批中" |
| 2 | DB 验证: `select count(*) from tradeorderrevisionrequest where tradeOrderId=? and status='PENDING'` = 1 | |

---

## 用例 10: Race — PENDING 期间下游变了 (auto-block)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起 CANCEL 申请, 进入 PENDING | |
| 2 | 在 SUPERVISOR 复审前, 让 OPS 录运单号 + 标已发货 | shippedAt 写入 |
| 3 | SUPERVISOR 点 "通过撤单" | 系统检测到 blockers 已出现, 自动改成 REJECTED, 错误提示: "复审期间下游状态已变更, 撤单已自动改为驳回: 已有 N 张发货任务进入物流环节" |
| 4 | 验证 OperationLog | 有 `trade_order.revision_blocked` 记录 |

---

## 用例 11: 4 眼原则

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SUPERVISOR 自己发起申请 (admin 例外不算) | 创建成功 |
| 2 | 同 SUPERVISOR 自己点 "通过" | 系统拒: "不能复审自己发起的撤单申请, 请由其他主管处理" |
| 3 | ADMIN 账号通过 | 可以 (兜底) |

---

## 用例 12: 减量 patchedLines 重复 itemId

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | (前端 dialog 默认不会让用户重复 itemId, 但可以用 curl/API 直调) | 提交 `patchedLines: [{itemId:A,newQty:5},{itemId:A,newQty:3}]` 时 server 拒 |
| 2 | 错误: "商品行 A 在同一申请里重复出现, 请合并为一条" | |

---

## 用例 13: 减量后金额聚合正确 (REDUCE 真 P1 修复后)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 原订单: 行 1 qty=3 unit=¥100 subtotal=¥300, 行 2 qty=5 unit=¥50 subtotal=¥250, finalAmount=¥550 | |
| 2 | REDUCE: 行 1 qty=1 (减 2 件) | |
| 3 | 通过后查 TradeOrder | finalAmount=¥350 (=¥100+¥250), 行 1 subtotal=¥100, 行 1 关联 TradeOrderItemComponent.qty 按 1/3 比例精确缩放 (用 Decimal 不是 Number, 不会出现 0.333... 尾差) |
| 4 | 如果 componentQty * (1/3) 取整后 = 0, 组件应该被 delete (不是 max(1)) | |

---

## 用例 14: 减量后 SalesOrder/TradeOrder 金额字段归零 (本轮 vector 修复)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 原订单审过, 假设有 ¥100 定金 (PaymentRecord CONFIRMED=false), 此时 TradeOrder.collectedAmount = ¥100 | |
| 2 | REDUCE 申请通过 | TradeOrder.collectedAmount/paidAmount/codAmount = ¥0, 所有 SalesOrder 同样字段 = ¥0 |
| 3 | dashboard / reports / customer 详情 看金额面板 | 不再读到 ¥100 残值 |

---

## 用例 15: 操作日志完整性

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 完成用例 1 (CANCEL 通过) | `OperationLog` 应有 4 条: revision_requested → revision_approved_cancel + 多条 sub-order 的 cascading log |
| 2 | 完成用例 2 (REDUCE 通过) | action = `trade_order.revision_approved_reduce`, afterData 含 cancelled IDs + reduce touched/deleted item ids |
| 3 | 完成用例 5 (驳回) | action = `trade_order.revision_rejected` + reviewNote |
| 4 | 完成用例 8 (withdraw) | action = `trade_order.revision_withdrawn` |
| 5 | 完成用例 10 (auto-block) | action = `trade_order.revision_blocked` + blockers JSON |

---

## 故障兜底测试

| 场景 | 预期 |
|---|---|
| 网络断开重提交 (重复提交相同申请) | 第二次 throw "已有 PENDING 申请" |
| 主管批准期间 db 临时不可用 | 整个 transaction 回滚, RevisionRequest 状态保持 PENDING, 不会半成 |
| SALES 申请时 patchedLines JSON 格式错 | server 返友好错误, 不暴露内部 stack |

---

## 数据回滚指南 (如果上线后出错)

1. **代码层回滚**: `git revert <commit-sha>` 然后 `bash scripts/deploy-update.sh`. 安全 commit 排序 (按依赖):
   - 先 revert `2f53c81` (sweep)
   - 再 revert `afa31f1` (REVISION_PENDING bypass fix)
   - 再 revert `9f20f43` (R01-R05)
   - 最后 revert `1244966` (Phase A.1 主功能) 如果决定不上线减量
2. **DB 层回滚** (仅极端情况): 不需要 — Phase A schema (RevisionRequest 表) 是 add-only, 已上线的数据不会被删. enum REVISION_PENDING 也是 add-only. 如果要清掉所有 revision 数据 `DELETE FROM tradeorderrevisionrequest WHERE 1=1` (不推荐, 失审计).

---

## 上线后监控

观察 1 周以下指标:
- `OperationLog` 含 `trade_order.revision_*` 的条数(应该被实际使用,而不是 0)
- `OperationLog` 含 `trade_order.revision_blocked` 的条数(应少,说明 race 防御工作)
- `OperationLog` 含 `trade_order.revision_rejected` 的条数(看驳回率,如果太高说明销售在乱发申请)
- 任何 sentry/log error 含 "ensureCollectionTaskForPlan failed" (R10 修复后, 错误带 cause 链可定位)

---

**测试完成后**: 如果用例 8/9/10/13/14 全过, 可以开放给销售/主管全员使用. 用例 6/7 失败表示 blocker 检测 broken, 应该立即 revert.
