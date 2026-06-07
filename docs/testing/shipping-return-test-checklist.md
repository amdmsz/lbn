# Shipping Return (Phase C) 测试 Checklist

> **目的**: 给业务方 / QA 在 staging 或生产灰度验证整个 “已发货 → 退货 → 入库 → 自动建退款单” 流程, 覆盖 Phase C 的 state machine 与 RBAC.
> **范围**: `lib/shipping/returns.ts` service + `app/(dashboard)/shipping/returns/actions.ts` + `/orders/[id]` + `/shipping/returns` + 联动的 `/finance/refunds`.
> **预估**: 全跑 25-30 min.

---

## 前置准备

1. 域名: `https://crm.cclbn.com` (生产) 或 `https://staging.cclbn.com`.
2. 准备账号:
   - **SALES** (`sales1`) — 作为某 TradeOrder 的 owner
   - **SALES_OTHER** (`sales2`) — 跨 owner 验证
   - **SUPERVISOR** (`supervisor1`) — 同团队主管
   - **SUPERVISOR_OTHER** (`supervisor2`) — 不同团队主管 (R06 跨团队隔离)
   - **SHIPPER** (`shipper1`) — 发货侧
   - **FINANCE** (`finance1`) — 退款侧
   - **ADMIN** (`admin`) — 兜底
3. 准备一张 TradeOrder:
   - `tradeStatus = APPROVED`
   - 含至少 1 张 `ShippingTask`, `shippedAt` 已写入, `status != CANCELED`
   - 含至少 1 条 `PaymentRecord` `confirmedAt != null` 且 `isReversed = false` (用于自动退款)
   - `finalAmount` 例如 ¥1000

---

## 用例 1: 销售发起退货 → 主管批 → 发货侧填运单 → 入库 → 自动建退款 (Happy Path)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 打开 `/orders/<id>` | 看到 "已发货" 状态, 出现 "申请退货" 按钮 (Phase A blocker 列表里 ALREADY_SHIPPED hint 现在是可点击链接) |
| 2 | 点击 "申请退货", 选 `CUSTOMER_REJECT`, 写 4+ 字 reasonDetail, 提交 | banner 变成 "退货审核中 · 待主管复审", 卡片底部出现状态时间线 (PENDING_REVIEW) |
| 3 | SUPERVISOR 打开同一订单 | 看到 banner + "通过/驳回" 按钮 |
| 4 | SUPERVISOR 点 "通过" | banner 变 "等待发货侧回填运单" (PENDING_RETURN_TRACKING), `OperationLog` 新增 `shipping_return.review_approved` |
| 5 | SHIPPER 打开 `/shipping/returns`, 看到该退货任务 status=PENDING_RETURN_TRACKING | 列表里能找到 |
| 6 | SHIPPER 点 "填运单", 填入 SF1234567890 + 顺丰速运, 提交 | 状态变 IN_RETURN_TRANSIT, `OperationLog` 新增 `shipping_return.tracking_filled` |
| 7 | SHIPPER 点 "确认入库", 上传一张照片 URL + remark, 提交 | 状态变 RETURNED_TO_WAREHOUSE; `shipping_return.confirmed_received` + `refund_request.created` + `shipping_return.refund_auto_created` 三条 log |
| 8 | FINANCE 打开 `/finance/refunds` | 看到新建的 PENDING_FINANCE RefundRequest, `requestedAmount = ¥1000` (= TradeOrder.finalAmount 兜底), reason = `CUSTOMER_REGRET`, reasonDetail = `"退货入库自动触发"` |
| 9 | DB 验证 | `ShippingReturn.refundRequestId` 已写为新 refund.id, `RefundRequest.sourcePaymentRecordIds` 包含步骤 0 准备的 PaymentRecord |

---

## 用例 2: 入库时财务侧人工调整 `finalRefundAmount`

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 重复用例 1 step 1-6 | 状态 IN_RETURN_TRANSIT |
| 2 | SHIPPER 入库时, 在 "实际退款金额" 字段填 ¥800 (低于申请的 ¥1000, 模拟部分破损扣损) | 入库成功 |
| 3 | 检查新建 RefundRequest | `requestedAmount = ¥800` (覆盖原 expectedRefundAmount); `ShippingReturn.expectedRefundAmount = ¥800` 也回写 |
| 4 | `OperationLog` `shipping_return.confirmed_received.afterData.overrideApplied = true` | |

---

## 用例 3: 现场签收路径 — 从 PENDING_RETURN_TRACKING 直接入库 (跳过运单回填)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起 → SUPERVISOR 通过, 状态 PENDING_RETURN_TRACKING | |
| 2 | SHIPPER 现场签收 (例如客户直接送回仓库), 不填运单, 直接点 "确认入库" | 状态变 RETURNED_TO_WAREHOUSE 成功; `OperationLog.confirmed_received.afterData.hasPhoto` / `hasRemark` 反映入库时是否上传 |
| 3 | `ShippingReturn.returnTrackingNumber` 仍为 null, `trackingFilledById` 仍为 null | 这是预期行为 |

---

## 用例 4: 销售本人撤回

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起退货, 进入 PENDING_REVIEW | banner 出现 |
| 2 | SALES 同一订单页面有 "撤回" 按钮 (主管账号看不到此按钮) | |
| 3 | 点 "撤回", 写可选 reason ("客户反悔") | banner 消失, ShippingReturn.status = CANCELED, `OperationLog` 新增 `shipping_return.canceled` |
| 4 | SALES 可再次发起新申请 | 同 shippingTask 上新申请不会被旧 CANCELED 阻塞 |

---

## 用例 5: 主管驳回 (rejectReason 必填)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起 → SUPERVISOR 打开看到 banner | |
| 2 | SUPERVISOR 不填 rejectReason 点 "驳回" | 前端表单校验拒, 提示 "驳回时请至少填写 4 个字的驳回原因" (zod superRefine) |
| 3 | 填 4+ 字驳回原因 ("证据不足") + 提交 | 状态变 REJECTED; `OperationLog` 新增 `shipping_return.review_rejected` |
| 4 | SALES 重新打开订单 | 可再次发起新申请, 旧 REJECTED 不阻塞 |

---

## 用例 6: 4 眼 — 主管自审 (admin 例外)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SUPERVISOR 自己发起退货 (canRequestShippingReturn 允许 SUPERVISOR) | 创建成功 |
| 2 | 同 SUPERVISOR 自己点 "通过" | 服务端拒, 抛 "不能审核自己发起的退货申请, 请由其他主管处理" |
| 3 | SUPERVISOR_OTHER (或 ADMIN) 通过 | 可以 (admin 兜底) |

---

## 用例 7: 跨团队 R06 隔离

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES (TeamA) 发起一张退货 | 创建成功 |
| 2 | SUPERVISOR_OTHER (TeamB, 不同 team) 打开 `/orders/<id>` 想 "通过" | 服务端拒 (assertSupervisorTeamScope): "您只能对本团队成员负责的对象执行此操作, 跨团队请联系对方主管或 ADMIN" |
| 3 | 同团队 SUPERVISOR 通过 | 可以 |
| 4 | ADMIN 兜底也可以通过 | |

---

## 用例 8: RBAC — SHIPPER 不能发起 / 审核 / SALES 不能填运单

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SHIPPER 在 `/shipping/returns` 想点 "新建退货" | 前端不应给入口; 即便绕过直接 POST action, 服务端 `canRequestShippingReturn` gate 拒: "您没有发起退货的权限" |
| 2 | SHIPPER 想审核 PENDING_REVIEW | 服务端拒: "您没有审核退货申请的权限" |
| 3 | SALES 想填运单 (PENDING_RETURN_TRACKING) | 服务端拒: "您没有填写退货运单的权限" (`canFillShippingReturnTracking` 仅 ADMIN/SHIPPER/OPS) |
| 4 | SALES 想确认入库 | 服务端拒: "您没有确认退货入库的权限" (`canConfirmShippingReturnReceived` 同 fillTracking) |

---

## 用例 9: 防 race — 同 ShippingTask 两人同时发起

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 在浏览器 A 提交退货申请, 同一时刻 ADMIN 在浏览器 B 也对同一 shippingTask 提交退货申请 | 第一个落, 第二个 throw "本发货任务已有进行中的退货申请 xxxxxx (状态 PENDING_REVIEW), 请先处理" |
| 2 | DB 验证 `SELECT COUNT(*) FROM shippingreturn WHERE shippingTaskId=? AND status IN ('PENDING_REVIEW','PENDING_RETURN_TRACKING','IN_RETURN_TRANSIT','RETURNED_TO_WAREHOUSE')` | = 1 |

---

## 用例 10: 防 race — 已撤回后再次发起

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | SALES 发起 → 撤回 (status = CANCELED) | |
| 2 | SALES 同一 shippingTask 再次发起 | 创建成功, status = PENDING_REVIEW, 旧 CANCELED 不视为 active |
| 3 | DB 验证 `shippingreturn` 有 2 条 (1 CANCELED + 1 PENDING_REVIEW) | |

---

## 用例 11: Blocker — shippingTask.shippedAt = null

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 选一张 ShippingTask 尚未发货 (shippedAt = null) 的订单 | |
| 2 | SALES 尝试发起退货 | 服务端拒: "该发货任务尚未发货, 无需退货" |
| 3 | UI 应该灰掉 "申请退货" 按钮, 不让点 | |

---

## 用例 12: Blocker — TradeOrder 已 CANCELED / REVISION_PENDING / 已 cancel

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 订单 tradeStatus = REVISION_PENDING (Phase A 撤单审批中) | "申请退货" 按钮应被禁用 |
| 2 | 即使绕过直接调 action | 服务端拒: "成交主单当前状态 REVISION_PENDING, 仅 APPROVED 后才能发起退货" |
| 3 | 订单 tradeStatus = CANCELED | 同上, 不能发起 |
| 4 | 订单已有进行中的 RETURNED_TO_WAREHOUSE 退货 | 同 shippingTask 不能再起, 但同订单不同 shippingTask 可以 (按 shippingTask 维度判 race) |

---

## 用例 13: 入库联动退款链 — 有 confirmed PaymentRecord

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 准备订单, finalAmount = ¥1000, 已有 1 条 PaymentRecord confirmed=¥1000 isReversed=false | |
| 2 | 走完 happy path 到 confirmReceived | 一条 RefundRequest 自动建, `requestedAmount = ¥1000`, `sourcePaymentRecordIds = [pr_1]`, reason = `CUSTOMER_REGRET` |
| 3 | FINANCE 在 `/finance/refunds` 看到新单 | status = PENDING_FINANCE |
| 4 | FINANCE 走 approveRefund + recordPayout (Phase B 既有流程) | PaymentRecord.isReversed = true, ReversePaymentRecord 落库 |

---

## 用例 14: 入库联动退款链 — 没 confirmed PaymentRecord (skip 不阻塞)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 准备订单, 但 PaymentRecord 全部 `confirmedAt = null` 或 `isReversed = true` | |
| 2 | 走 happy path 到 confirmReceived | 入库成功, status = RETURNED_TO_WAREHOUSE, **但** `refundRequestId = null` |
| 3 | `OperationLog` 应有 `shipping_return.refund_auto_skipped` 一条, `afterData.reason = "NO_CONFIRMED_PAYMENT_RECORD"` | 提醒财务手动建退款 |
| 4 | FINANCE 在 `/finance/refunds` 用 "新建退款申请" 手工补建 | 走 Phase B 既有 `requestRefund` 流程 |

---

## 用例 15: 入库联动退款链 — race blocker (同订单已有 PENDING_FINANCE RefundRequest)

| 步 | 动作 | 预期 |
|---|---|---|
| 1 | 提前在 `/finance/refunds` 已经手工建过一条 PENDING_FINANCE RefundRequest 给同一 tradeOrder | |
| 2 | SHIPPER 走 happy path 到 confirmReceived | 服务端整 tx 抛错: "本订单已有进行中的退款申请 xxxxxx (状态 PENDING_FINANCE), 请先处理后再确认退货入库" |
| 3 | DB 验证 ShippingReturn 状态保持 IN_RETURN_TRANSIT (整 tx 回滚) | 入库未落, RefundRequest 数量不变 |
| 4 | FINANCE 先处理旧 PENDING_FINANCE 后, SHIPPER 重试入库 | 成功, 新 RefundRequest 落地 |

---

## 故障兜底测试

| 场景 | 预期 |
|---|---|
| 网络断开后重提交相同申请 | 第二次 throw "本发货任务已有进行中的退货申请..." |
| 主管复审期间 db 临时不可用 | tx 回滚, ShippingReturn 保持 PENDING_REVIEW, 不会半成 |
| SHIPPER 入库期间 db 临时不可用 | 整 tx 回滚, ShippingReturn 保持 IN_RETURN_TRANSIT, RefundRequest 未建 |
| SHIPPER 入库填的 photo URL 超过 2000 字符 | zod schema 拒, 提示长度过长 |
| SHIPPER 入库填的 finalRefundAmount 为负或 0 | 走 isPositiveAmount check → 沿用 expectedRefundAmount (兜底, 不抛错), 见 `lib/shipping/returns.ts:486-489` |

---

## 数据回滚指南 (如果上线后出错)

1. **代码层回滚**: `git revert <commit-sha>` 然后 `bash scripts/deploy-update.sh`. 退货链路是 add-only:
   - revert Phase C UI commits (panel + actions + page wiring)
   - revert `lib/shipping/returns.ts` service commit
   - `ShippingReturn` 表 + enum 是 add-only schema, 已上线的数据不会被删
2. **DB 层回滚** (仅极端情况): 不需要 — 若要清掉所有退货数据 `DELETE FROM shippingreturn WHERE 1=1` (不推荐, 失审计). 若要清掉自动建的 RefundRequest, 它们的 `reasonDetail = "退货入库自动触发"` 是可识别标记.
3. **联动撤销**: 若要把已自动建的 RefundRequest 当作误建, FINANCE 走 `withdrawRefund` (Phase B 既有), 不要直接 DELETE.

---

## 上线后监控

观察 1 周以下指标:
- `OperationLog` 含 `shipping_return.*` 的条数 (按 action 拆: requested / review_approved / review_rejected / tracking_filled / confirmed_received / refund_auto_created / refund_auto_skipped / canceled)
- `OperationLog` 含 `shipping_return.refund_auto_skipped` 的条数: 太多说明前置 PaymentRecord 没及时确认, FINANCE 工作量异常
- `OperationLog` 含 `shipping_return.refund_auto_created` 与 `refund_request.created` 数量是否对齐 (两条 log 在同 tx 里各写一条)
- 退货周期: `shipping_return.confirmed_received.afterTime - shipping_return.requested.createdAt` 平均时长

---

**测试完成后**: 如果用例 1/3/4/5/6/9/13/14/15 全过, 可以开放给销售/主管/发货侧全员使用. 用例 8/11/12 失败表示 RBAC 或 blocker 检测 broken, 应立即 revert. 用例 13/14/15 失败表示与 Phase B 联动断了, 必须 revert.
