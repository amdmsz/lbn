# Trade Order Revision — Phase B: 退款链路 (Plan, 待执行)

> **状态**: 蓝图阶段, 不上代码. 用户白天 review + 排期后实施.
> **依赖**: Phase A (commit `c368d2b`) + Phase A.1 (commit `1244966`) 已上线.
> **预估**: 2-3 个工作日 (含测试 + 部署).

---

## 1. 背景: Phase A 的边界, Phase B 要补的洞

Phase A MVP (CANCEL) + Phase A.1 (REDUCE_QUANTITY) 覆盖了客户反悔的"T0-T1 窗口" — 主管已审核但尚未发货 + 尚未财务确认收款的场景, 大约占实际反悔的 80%.

**Phase A 显式拦下的 3 种 blocker** (lib/trade-orders/revisions.ts `checkRevisionBlockers`):
- `ALREADY_SHIPPED`: ShippingTask.shippedAt 非空 → 走退货流程 (Phase C, 阶段独立)
- `PAYMENT_CONFIRMED`: PaymentRecord.confirmedAt 非空 → **本 Phase B 要解的**
- `COD_COLLECTED`: CodCollectionRecord.status=COLLECTED → 本 Phase B 要解的 (退款分支)

**用户实际场景**:
- 销售收完定金, 客户隔天反悔 → 现在 Phase A 拦下, 销售只能私下退钱不留痕
- 全款预付的客户改主意 → 同上

**Phase B 目标**: 让上述场景能走自动化流程, 财务侧最终确认后系统留痕, 不再依赖私下沟通.

---

## 2. Schema 新增 (3 个表 + 2 个 enum)

```prisma
enum RefundRequestStatus {
  PENDING_FINANCE      // 销售/主管发起, 等财务审批
  APPROVED_FINANCE     // 财务批准, 待出账
  PAID_OUT             // 财务已实际打款 (建反向凭证)
  REJECTED_FINANCE     // 财务驳回 (原因必填)
  WITHDRAWN            // 发起人撤回
}

enum RefundReason {
  CUSTOMER_REGRET      // 客户反悔不要了
  QUALITY_ISSUE        // 质量问题
  PRICING_DISPUTE      // 价格争议
  DUPLICATE_PAYMENT    // 重复收款
  OTHER                // 其他
}

model RefundRequest {
  id                   String                    @id @default(cuid())
  // 关联源: 优先关 RevisionRequest (反悔场景), 也允许独立发起 (财务对账场景)
  revisionRequestId    String?                   @unique
  revisionRequest      TradeOrderRevisionRequest? @relation(fields: [revisionRequestId], references: [id])
  // 退款主体
  tradeOrderId         String
  tradeOrder           TradeOrder                @relation(fields: [tradeOrderId], references: [id])
  customerId           String
  customer             Customer                  @relation(fields: [customerId], references: [id])
  // 退款金额 (Decimal, 走 Decimal helper)
  requestedAmount      Decimal                   @db.Decimal(10, 2)
  approvedAmount       Decimal?                  @db.Decimal(10, 2)
  paidAmount           Decimal?                  @db.Decimal(10, 2)
  // 链路
  status               RefundRequestStatus       @default(PENDING_FINANCE)
  reason               RefundReason
  reasonDetail         String                    @db.Text
  // 关联的 PaymentRecord (反向凭证基础)
  sourcePaymentRecordIds Json                    // [paymentRecordId, ...]
  // 流程角色
  requesterId          String
  requester            User                      @relation("RefundRequester", fields: [requesterId], references: [id])
  requestedAt          DateTime                  @default(now())
  financeReviewerId    String?
  financeReviewer      User?                     @relation("RefundFinanceReviewer", fields: [financeReviewerId], references: [id])
  reviewedAt           DateTime?
  reviewNote           String?                   @db.Text
  rejectReason         String?                   @db.Text
  // 出账信息
  payoutMethod         String?                   // ALIPAY / WECHAT / BANK_TRANSFER / OFFLINE_CASH
  payoutReference      String?                   // 转账流水号 / 收据编号
  paidOutAt            DateTime?
  paidOutById          String?
  paidOutBy            User?                     @relation("RefundPayoutBy", fields: [paidOutById], references: [id])
  // 反向凭证
  reversePaymentRecords ReversePaymentRecord[]
  createdAt            DateTime                  @default(now())
  updatedAt            DateTime                  @updatedAt
}

// 反向支付凭证 — 对原 PaymentRecord 的冲账记录
model ReversePaymentRecord {
  id                   String        @id @default(cuid())
  refundRequestId      String
  refundRequest        RefundRequest @relation(fields: [refundRequestId], references: [id])
  sourcePaymentRecordId String       // 冲账的原 PaymentRecord.id
  amount               Decimal       @db.Decimal(10, 2)  // 必为正数, 业务上表示"流出"
  occurredAt           DateTime
  payoutMethod         String
  payoutReference      String?
  createdAt            DateTime      @default(now())
  createdById          String
}
```

---

## 3. 状态机扩展

```
TradeOrder + RevisionRequest 联动:

REVISION_PENDING [当 blocker=PAYMENT_CONFIRMED 时, 主管复审通过会走 B 分支]
    │
    └── 自动创建 RefundRequest, status=PENDING_FINANCE
         │
         ├── [财务驳回] → RefundRequest.REJECTED_FINANCE
         │              └── TradeOrder 回 APPROVED (恢复原状)
         │              └── RevisionRequest 标 REJECTED
         │
         └── [财务批准] → RefundRequest.APPROVED_FINANCE
              │
              └── [财务记录出账] → RefundRequest.PAID_OUT
                   │
                   └── 创建 ReversePaymentRecord (镜像原 PaymentRecord)
                   └── 同 Phase A 逆向其他下游 (ShippingTask CANCELED 等)
                   └── TradeOrder.tradeStatus = CANCELED
                   └── RevisionRequest 标 APPROVED
```

---

## 4. 权限设计 (新增 2 个权限函数, 复用 RBAC 框架)

```typescript
// lib/auth/access.ts 新增:
export function canApproveRefundRequest(role: RoleCode) {
  // 仅 FINANCE / ADMIN; SUPERVISOR 不允许 (4 眼原则)
  return role === "ADMIN" || role === "FINANCE";
}

export function canRecordRefundPayout(role: RoleCode) {
  return role === "ADMIN" || role === "FINANCE";
}
```

**注意**: 当前 RoleCode 没有 FINANCE 角色, 需要先在 schema 加 enum value + seed user.
这是 Phase B 第一步阻断 — **需要业务确认**: 财务这个角色是新建还是复用 ADMIN?

---

## 5. 实施步骤 (按 PR 拆分)

### PR 1: Schema + Migration (4h)
- 加 RefundRequestStatus / RefundReason enum
- 加 RefundRequest / ReversePaymentRecord 表
- 加 User relation
- 写 migration SQL (含 FK)
- prisma validate + 本地 migrate dev 测试
- 不上线 (等 PR 2-3 一起)

### PR 2: 服务端 lib/trade-orders/refunds.ts (8h)
- requestRefund(actor, input): 销售/主管发起, 关联 RevisionRequest 或独立
- approveRefund(actor, refundId, approvedAmount, note): 财务批准
- rejectRefund(actor, refundId, rejectReason): 财务驳回
- recordRefundPayout(actor, refundId, payoutMethod, reference): 出账后调用
- 自动联动: PAID_OUT 时调用 executePostRefundCleanup() 走 Phase A 同款逆向

### PR 3: 修改 lib/trade-orders/revisions.ts (4h)
- checkRevisionBlockers 时, 如果只是 PAYMENT_CONFIRMED 而非 SHIPPED, 不再阻断, 改成"提示走退款"
- reviewTradeOrderRevision APPROVED 时, 检查是否需要走退款分支, 自动创建 RefundRequest

### PR 4: UI (8h)
- 新页面 /finance/refund-requests (FINANCE 角色)
- TradeOrderRevisionPanel 加 "已收款, 需走退款" 状态
- 新 components/refunds/refund-review-panel.tsx (财务审批界面)
- 客户详情页加退款记录展示

### PR 5: 测试 + 部署 (4h)
- 单测覆盖: 退款金额边界 / 部分退款 / 重复 PaymentRecord 处理
- 端到端: 发起 → 财务批 → 记账 → 验证 ReversePaymentRecord 链路完整

**合计**: ~28h = ~3.5 工作日

---

## 6. 风险与决策点 (用户白天确认)

1. **FINANCE 角色**: 新建 enum value 还是复用 ADMIN 兜底?
2. **部分退款**: 允许吗? 例如客户原付 1000 定金, 同意退 800 留 200 违约金?
3. **退款 vs 退货**: 这俩可以独立发起还是必须先退货才能退款?
4. **审计窗口**: 已收款 30 天内允许退款 vs 无时限?
5. **反向凭证生效时机**: 财务批准就立即建 (但未真出账) vs PAID_OUT 才建?
6. **PaymentRecord cancel 策略**: 软删 (delete) vs 加 isReversed 标志保留?

---

## 7. 跟 Phase A.1 的兼容性

Phase A.1 已经实施了 CANCEL + REDUCE_QUANTITY 两种 kind, 都基于"无收款" 前提.

Phase B 上线后:
- requestTradeOrderRevision 不变, 接受 CANCEL / REDUCE_QUANTITY 都行
- checkRevisionBlockers 拆成两层: hard_blockers (ALREADY_SHIPPED) + soft_blockers (PAYMENT_CONFIRMED → 自动转 Phase B 路径)
- 主管 APPROVED 一个有 PAYMENT_CONFIRMED 的 RevisionRequest 时, 会触发 "需要财务流程" 路径

UI 上对销售/主管透明 — 唯一新增的等待节点是 "等待财务审批" (replaces 当前的 "已 cancel").

---

## 8. 测试用例 (至少要覆盖)

| 场景 | 路径 | 预期 |
|---|---|---|
| 客户付 100% 全款预付后 24h 反悔 | 销售发起 CANCEL + 财务批准 + 记录 ALIPAY 转账 | PAID_OUT 完成, ReversePaymentRecord -100%, TradeOrder=CANCELED |
| 客户付 30% 定金后反悔 | 销售发起 CANCEL + 财务批准 (退 30% 全额) | 同上 |
| 客户付 30% 定金后改成减量 50% | 销售发起 REDUCE + 财务批准 (退 15% 差额) | TradeOrderItem.qty 减半 + ReversePaymentRecord 15% |
| 财务驳回退款申请 | 任意 kind + 财务点驳回 | RevisionRequest=REJECTED + TradeOrder 回 APPROVED + 不建 ReversePaymentRecord |
| 重复发起退款 | 在 PENDING_FINANCE 期间再发起 | 拒绝, "本订单已有进行中退款" |
| 财务批准但未出账时, 销售撤回 | requester withdraw | RevisionRequest=WITHDRAWN + 不建 ReversePaymentRecord |
| 退款金额超过实际收款 | 财务设 approvedAmount > sum(PaymentRecord.amount) | 服务端 throw |
| 退款方式离线现金 | payoutMethod=OFFLINE_CASH | payoutReference 可空, 但需要主管二签? (业务定) |

---

## 9. 后续 Phase C: 退货链路 (独立蓝图)

退款 ≠ 退货. 已发货场景需要:
- ShippingReturn 表 (退货任务)
- OPS/SHIPPER 接货 → 入库 → 触发退款流程
- 这是更大块工作, 留作 Phase C, 不在本 Plan 内

---

**结论**: Phase B 不是单纯加表加 service — 它涉及到引入 FINANCE 角色 + 财务审批工作流, 是组织流程层面变更. 建议:
1. 用户确认 FINANCE 角色定义 (新建 / 复用 ADMIN)
2. PRD 层确认部分退款 / 反向凭证策略
3. 然后按 PR 1-5 顺序实施

我没有自动上 Phase B 代码 — 因为这些决策点必须业务方确认, 一旦上线后 schema 不易回退.
