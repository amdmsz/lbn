/**
 * Phase C 退货链路 service 层.
 *
 * Phase A (revisions) 拦下了 ALREADY_SHIPPED 的撤单 — 这是本 Phase C 要解的洞.
 * 已发货后客户改主意, 不能简单 cancel, 必须先把货退回仓库才能走 Refund.
 *
 * 状态机:
 *   PENDING_REVIEW ──[主管批准]──→ PENDING_RETURN_TRACKING ──[发货侧填回单]──→ IN_RETURN_TRANSIT
 *                                                                              │
 *                                                                              └─[发货侧确认入库]──→ RETURNED_TO_WAREHOUSE
 *                                                                                                    └─[自动联动]──→ RefundRequest (PENDING_FINANCE)
 *                 ├──[主管驳回]──→ REJECTED
 *                 └──[发起人/主管撤回]──→ CANCELED
 *
 * 角色边界:
 *   - SALES: 仅可对自己负责的成交主单发起退货
 *   - SUPERVISOR: 本团队范围内审核 / 撤回 (跨团队由 ADMIN 兜底)
 *   - SHIPPER / OPS: 填回单, 确认入库
 *   - ADMIN: 全链路兜底
 *   - FINANCE 不参与退货, 仅消费下游自动建立的 RefundRequest
 *
 * 4 眼原则:
 *   - 主管复审不允许 requester 自审 (admin 兜底)
 *   - 与 lib/payments/refunds.ts.approveRefund 对齐
 *
 * 关键联动 (confirmShippingReturnReceived):
 *   全部在一个 prisma.$transaction:
 *     1. 把 ShippingReturn 状态推进到 RETURNED_TO_WAREHOUSE, 落入库时间/入库人/照片
 *     2. 找该 TradeOrder 下所有 confirmedAt != null && isReversed == false 的 PaymentRecord
 *     3. 若有可冲账记录: 内联建 RefundRequest (PENDING_FINANCE),
 *        sourcePaymentRecordIds = 这些记录, requestedAmount = expectedRefundAmount,
 *        reason = CUSTOMER_REGRET, reasonDetail = "退货入库自动触发",
 *        再把 refundRequest.id 写回 ShippingReturn.refundRequestId
 *     4. 若没有可冲账记录: 不阻塞入库, 仅写一条 OperationLog 说明 (财务后续手工补)
 *
 *   不复用 lib/payments/refunds.ts.requestRefund — 它内部已有独立的 prisma.$transaction,
 *   在我们已有 tx 内调用会破坏原子性. 这里复刻其核心写入路径并补对应 OperationLog,
 *   与 requestRefund 行为对齐 (含 COLLECTION 模块 refund_request.created log).
 *
 * 审计:
 *   每个 state transition 都写 OperationLog (module=SHIPPING, targetType=TRADE_ORDER).
 */

import {
  OperationModule,
  OperationTargetType,
  Prisma,
  RefundReason,
  RefundRequestStatus,
  ShippingReturnReason,
  ShippingReturnStatus,
  TradeOrderStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";

import {
  canConfirmShippingReturnReceived,
  canFillShippingReturnTracking,
  canRequestShippingReturn,
  canReviewShippingReturn,
} from "@/lib/auth/access";
import { assertSupervisorTeamScope } from "@/lib/auth/team-scope";
import { prisma } from "@/lib/db/prisma";
import {
  greaterThan,
  isPositiveAmount,
  sumDecimal,
  toDecimal,
} from "@/lib/payments/decimal";

export type ShippingReturnActor = {
  id: string;
  role: RoleCode;
};

const NON_TERMINAL_STATUSES: ShippingReturnStatus[] = [
  ShippingReturnStatus.PENDING_REVIEW,
  ShippingReturnStatus.PENDING_RETURN_TRACKING,
  ShippingReturnStatus.IN_RETURN_TRANSIT,
  ShippingReturnStatus.RETURNED_TO_WAREHOUSE,
];

const ACTIVE_BEFORE_RECEIVED_STATUSES: ShippingReturnStatus[] = [
  ShippingReturnStatus.PENDING_REVIEW,
  ShippingReturnStatus.PENDING_RETURN_TRACKING,
  ShippingReturnStatus.IN_RETURN_TRANSIT,
];

// === Zod schemas ===

const requestShippingReturnSchema = z.object({
  tradeOrderId: z.string().min(1, "缺少成交主单"),
  shippingTaskId: z.string().min(1, "缺少发货任务"),
  reason: z.nativeEnum(ShippingReturnReason),
  reasonDetail: z
    .string()
    .trim()
    .min(4, "请至少填写 4 个字的退货原因详情")
    .max(800, "原因过长 (上限 800 字)"),
  // 期望退款金额: 申请阶段可不填, 兜底用订单 finalAmount;
  // 入库时财务侧可继续在 RefundRequest 流程里改
  expectedRefundAmount: z.string().optional(),
});

const reviewShippingReturnSchema = z
  .object({
    shippingReturnId: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reviewNote: z.string().trim().max(800).optional(),
    rejectReason: z.string().trim().max(800).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "REJECTED") {
      if (!value.rejectReason || value.rejectReason.trim().length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "驳回时请至少填写 4 个字的驳回原因",
          path: ["rejectReason"],
        });
      }
    }
  });

const fillTrackingSchema = z.object({
  shippingReturnId: z.string().min(1),
  returnTrackingNumber: z
    .string()
    .trim()
    .min(4, "请填写退货运单号 (至少 4 位)")
    .max(120),
  returnCarrier: z.string().trim().min(1, "请填写退货承运商").max(120),
});

const confirmReceivedSchema = z.object({
  shippingReturnId: z.string().min(1),
  receivedPhotoUrl: z.string().trim().max(2000).optional(),
  receivedRemark: z.string().trim().max(800).optional(),
  // 入库时如对期望退款金额做了调整, 允许覆盖. 不传则沿用申请时的 expectedRefundAmount.
  finalRefundAmount: z.string().optional(),
});

const cancelSchema = z.object({
  shippingReturnId: z.string().min(1),
  reason: z.string().trim().max(400).optional(),
});

// === 服务函数 ===

/**
 * 1. 销售 / 主管 / ADMIN 发起退货申请.
 *    必须命中 APPROVED 的 TradeOrder + 已发货 (shippedAt != null) 的 ShippingTask.
 *    同一 ShippingTask 不允许并存多条 active 退货 (active = 非 CANCELED/REJECTED).
 */
export async function requestShippingReturn(
  actor: ShippingReturnActor,
  rawInput: z.input<typeof requestShippingReturnSchema>,
) {
  if (!canRequestShippingReturn(actor.role)) {
    throw new Error("您没有发起退货的权限");
  }
  const input = requestShippingReturnSchema.parse(rawInput);

  const tradeOrder = await prisma.tradeOrder.findUnique({
    where: { id: input.tradeOrderId },
    select: {
      id: true,
      tradeNo: true,
      customerId: true,
      ownerId: true,
      tradeStatus: true,
      finalAmount: true,
    },
  });
  if (!tradeOrder) {
    throw new Error("成交主单不存在或已被回收");
  }
  if (tradeOrder.tradeStatus !== TradeOrderStatus.APPROVED) {
    throw new Error(
      `成交主单当前状态 ${tradeOrder.tradeStatus}, 仅 APPROVED 后才能发起退货`,
    );
  }

  // SALES 只能给自己负责的订单发起
  if (
    actor.role === "SALES" &&
    tradeOrder.ownerId &&
    tradeOrder.ownerId !== actor.id
  ) {
    throw new Error("您只能给自己负责的订单发起退货申请");
  }

  // SUPERVISOR 跨团队隔离 (跟撤单 scope 对齐)
  await assertSupervisorTeamScope(actor, tradeOrder.ownerId);

  // 期望退款金额: 优先用入参, 否则按订单 finalAmount 兜底
  // (财务可在入库 / RefundRequest 审批阶段再改 finalRefundAmount)
  const expectedRefundAmount = input.expectedRefundAmount
    ? toDecimal(input.expectedRefundAmount)
    : toDecimal(tradeOrder.finalAmount);
  if (!isPositiveAmount(expectedRefundAmount)) {
    throw new Error("预计退款金额必须大于 0 (或订单 finalAmount 不为 0)");
  }
  // 预计退款金额不得超过订单成交价 (兜底, 不做精细校验, 留给财务侧 RefundRequest 复核)
  if (greaterThan(expectedRefundAmount, tradeOrder.finalAmount)) {
    throw new Error(
      `预计退款金额 ${expectedRefundAmount.toFixed(2)} 超过订单成交金额 ${toDecimal(tradeOrder.finalAmount).toFixed(2)}`,
    );
  }

  const shippingTask = await prisma.shippingTask.findUnique({
    where: { id: input.shippingTaskId },
    select: {
      id: true,
      tradeOrderId: true,
      shippedAt: true,
      status: true,
    },
  });
  if (!shippingTask) {
    throw new Error("发货任务不存在");
  }
  if (shippingTask.tradeOrderId !== tradeOrder.id) {
    throw new Error("发货任务不属于当前成交主单");
  }
  if (!shippingTask.shippedAt) {
    throw new Error("该发货任务尚未发货, 无需退货");
  }
  if (shippingTask.status === "CANCELED") {
    throw new Error("该发货任务已取消, 无法发起退货");
  }

  return prisma.$transaction(async (tx) => {
    // 防 race: 同一发货任务不允许同时有多张 ACTIVE 退货
    const existingActive = await tx.shippingReturn.findFirst({
      where: {
        shippingTaskId: shippingTask.id,
        status: { in: NON_TERMINAL_STATUSES },
      },
      select: { id: true, status: true },
    });
    if (existingActive) {
      throw new Error(
        `本发货任务已有进行中的退货申请 ${existingActive.id.slice(-6)} (状态 ${existingActive.status}), 请先处理`,
      );
    }

    const created = await tx.shippingReturn.create({
      data: {
        tradeOrderId: tradeOrder.id,
        shippingTaskId: shippingTask.id,
        customerId: tradeOrder.customerId,
        status: ShippingReturnStatus.PENDING_REVIEW,
        reason: input.reason,
        reasonDetail: input.reasonDetail,
        expectedRefundAmount,
        requesterId: actor.id,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action: "shipping_return.requested",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: tradeOrder.id,
        description: `Requested shipping return for trade order ${tradeOrder.tradeNo}`,
        afterData: {
          shippingReturnId: created.id,
          shippingTaskId: shippingTask.id,
          reason: input.reason,
          expectedRefundAmount: expectedRefundAmount.toFixed(2),
        },
      },
    });

    return created;
  });
}

/**
 * 2. 主管 / ADMIN 审核退货申请.
 *    APPROVED → PENDING_RETURN_TRACKING; REJECTED → REJECTED.
 *    4 眼: 发起人 != 审核人 (ADMIN 例外, 与 refunds.ts 对齐).
 */
export async function reviewShippingReturn(
  actor: ShippingReturnActor,
  rawInput: z.input<typeof reviewShippingReturnSchema>,
) {
  if (!canReviewShippingReturn(actor.role)) {
    throw new Error("您没有审核退货申请的权限");
  }
  const input = reviewShippingReturnSchema.parse(rawInput);

  const target = await prisma.shippingReturn.findUnique({
    where: { id: input.shippingReturnId },
    select: {
      id: true,
      status: true,
      requesterId: true,
      tradeOrderId: true,
      tradeOrder: { select: { id: true, tradeNo: true, ownerId: true } },
    },
  });
  if (!target) {
    throw new Error("退货申请不存在");
  }
  if (target.status !== ShippingReturnStatus.PENDING_REVIEW) {
    throw new Error(`退货申请当前状态 ${target.status}, 不能审核`);
  }
  if (target.requesterId === actor.id && actor.role !== "ADMIN") {
    throw new Error("不能审核自己发起的退货申请, 请由其他主管处理");
  }

  // SUPERVISOR 跨团队隔离
  await assertSupervisorTeamScope(actor, target.tradeOrder?.ownerId ?? null);

  const reviewedAt = new Date();
  const nextStatus =
    input.decision === "APPROVED"
      ? ShippingReturnStatus.PENDING_RETURN_TRACKING
      : ShippingReturnStatus.REJECTED;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.shippingReturn.update({
      where: { id: target.id },
      data: {
        status: nextStatus,
        reviewerId: actor.id,
        reviewedAt,
        reviewNote: input.reviewNote ?? null,
        rejectReason:
          input.decision === "REJECTED" ? input.rejectReason ?? null : null,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action:
          input.decision === "APPROVED"
            ? "shipping_return.review_approved"
            : "shipping_return.review_rejected",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: target.tradeOrderId,
        description: `${input.decision === "APPROVED" ? "Approved" : "Rejected"} shipping return ${target.id} for trade order ${target.tradeOrder?.tradeNo ?? ""}`.trim(),
        afterData: {
          shippingReturnId: target.id,
          decision: input.decision,
          reviewNote: input.reviewNote ?? null,
          rejectReason:
            input.decision === "REJECTED" ? input.rejectReason ?? null : null,
        },
      },
    });

    return updated;
  });
}

/**
 * 3. 发货侧 (SHIPPER / OPS / ADMIN) 填退货运单.
 *    仅 PENDING_RETURN_TRACKING 状态可填.
 *    已填后再次填写视为覆盖, 留 OperationLog (before/after) 以供审计.
 *    填写后 status → IN_RETURN_TRANSIT.
 */
export async function fillShippingReturnTracking(
  actor: ShippingReturnActor,
  rawInput: z.input<typeof fillTrackingSchema>,
) {
  if (!canFillShippingReturnTracking(actor.role)) {
    throw new Error("您没有填写退货运单的权限");
  }
  const input = fillTrackingSchema.parse(rawInput);

  const target = await prisma.shippingReturn.findUnique({
    where: { id: input.shippingReturnId },
    select: {
      id: true,
      status: true,
      tradeOrderId: true,
      returnTrackingNumber: true,
      returnCarrier: true,
      tradeOrder: { select: { tradeNo: true } },
    },
  });
  if (!target) {
    throw new Error("退货申请不存在");
  }
  if (target.status !== ShippingReturnStatus.PENDING_RETURN_TRACKING) {
    throw new Error(
      `退货申请当前状态 ${target.status}, 不能填运单 (需先主管审核通过)`,
    );
  }

  const filledAt = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.shippingReturn.update({
      where: { id: target.id },
      data: {
        status: ShippingReturnStatus.IN_RETURN_TRANSIT,
        returnTrackingNumber: input.returnTrackingNumber,
        returnCarrier: input.returnCarrier,
        trackingFilledById: actor.id,
        trackingFilledAt: filledAt,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action: "shipping_return.tracking_filled",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: target.tradeOrderId,
        description: `Filled return tracking for shipping return ${target.id} (trade ${target.tradeOrder?.tradeNo ?? ""})`.trim(),
        beforeData: {
          returnTrackingNumber: target.returnTrackingNumber,
          returnCarrier: target.returnCarrier,
        },
        afterData: {
          shippingReturnId: target.id,
          returnTrackingNumber: input.returnTrackingNumber,
          returnCarrier: input.returnCarrier,
        },
      },
    });

    return updated;
  });
}

/**
 * 4. 发货侧确认入库 + 自动触发 RefundRequest.
 *    允许从 IN_RETURN_TRANSIT 或 PENDING_RETURN_TRACKING 直接进入入库
 *    (现场签收时若运单还没回填也允许补登入库).
 *
 *    联动逻辑见文件头注释 — 内联建 RefundRequest, 不调 lib/payments/refunds.ts.requestRefund.
 */
export async function confirmShippingReturnReceived(
  actor: ShippingReturnActor,
  rawInput: z.input<typeof confirmReceivedSchema>,
) {
  if (!canConfirmShippingReturnReceived(actor.role)) {
    throw new Error("您没有确认退货入库的权限");
  }
  const input = confirmReceivedSchema.parse(rawInput);

  const target = await prisma.shippingReturn.findUnique({
    where: { id: input.shippingReturnId },
    select: {
      id: true,
      status: true,
      tradeOrderId: true,
      customerId: true,
      expectedRefundAmount: true,
      refundRequestId: true,
      tradeOrder: { select: { tradeNo: true } },
    },
  });
  if (!target) {
    throw new Error("退货申请不存在");
  }
  const allowedSourceStatuses: ShippingReturnStatus[] = [
    ShippingReturnStatus.PENDING_RETURN_TRACKING,
    ShippingReturnStatus.IN_RETURN_TRANSIT,
  ];
  if (!allowedSourceStatuses.includes(target.status)) {
    throw new Error(
      `退货申请当前状态 ${target.status}, 仅 PENDING_RETURN_TRACKING/IN_RETURN_TRANSIT 可入库`,
    );
  }
  if (target.refundRequestId) {
    throw new Error("该退货单已关联退款单, 不能重复入库");
  }

  const receivedAt = new Date();

  // finalRefundAmount 优先: 入库时财务/发货人可覆盖申请阶段填写的金额
  const overrideRefund = input.finalRefundAmount
    ? toDecimal(input.finalRefundAmount)
    : null;
  const settledExpectedRefundAmount =
    overrideRefund && isPositiveAmount(overrideRefund)
      ? overrideRefund
      : toDecimal(target.expectedRefundAmount);

  return prisma.$transaction(async (tx) => {
    const updatedReturn = await tx.shippingReturn.update({
      where: { id: target.id },
      data: {
        status: ShippingReturnStatus.RETURNED_TO_WAREHOUSE,
        receivedAt,
        receivedById: actor.id,
        receivedPhotoUrl: input.receivedPhotoUrl ?? null,
        receivedRemark: input.receivedRemark ?? null,
        // 入库时覆盖最终金额, 便于 audit
        expectedRefundAmount: settledExpectedRefundAmount,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action: "shipping_return.confirmed_received",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: target.tradeOrderId,
        description: `Confirmed shipping return ${target.id} received for trade order ${target.tradeOrder?.tradeNo ?? ""}`.trim(),
        afterData: {
          shippingReturnId: target.id,
          receivedAt: receivedAt.toISOString(),
          hasPhoto: Boolean(input.receivedPhotoUrl),
          hasRemark: Boolean(input.receivedRemark),
          finalRefundAmount: settledExpectedRefundAmount.toFixed(2),
          overrideApplied: overrideRefund !== null,
        },
      },
    });

    // 自动触发 RefundRequest — 找该订单下所有 confirmed && 未冲账的 PaymentRecord
    const eligibleRecords = await tx.paymentRecord.findMany({
      where: {
        tradeOrderId: target.tradeOrderId,
        confirmedAt: { not: null },
        isReversed: false,
      },
      select: { id: true, amount: true },
    });

    let refundRequestId: string | null = null;

    if (eligibleRecords.length === 0) {
      // 没有可冲账记录: 仅记说明性 OperationLog, 不建 RefundRequest, 不阻塞入库
      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SHIPPING,
          action: "shipping_return.refund_auto_skipped",
          targetType: OperationTargetType.TRADE_ORDER,
          targetId: target.tradeOrderId,
          description: `Shipping return ${target.id} received, no confirmed payment records to reverse — finance must manually create refund`,
          afterData: {
            shippingReturnId: target.id,
            expectedRefundAmount: settledExpectedRefundAmount.toFixed(2),
            reason: "NO_CONFIRMED_PAYMENT_RECORD",
          },
        },
      });

      return {
        shippingReturn: updatedReturn,
        refundRequestId: null as string | null,
      };
    }

    // 校验申请金额不超过可冲账总额; 超出则封顶按可冲账总额 (兜底)
    const availableTotal = sumDecimal(eligibleRecords.map((r) => r.amount));
    const requestedAmount = greaterThan(settledExpectedRefundAmount, availableTotal)
      ? availableTotal
      : settledExpectedRefundAmount;

    if (!isPositiveAmount(requestedAmount)) {
      throw new Error("可冲账金额为 0, 无法自动建退款单");
    }

    // 防 race: 同 tradeOrder 不能已有 PENDING/APPROVED 退款单
    const existingActive = await tx.refundRequest.findFirst({
      where: {
        tradeOrderId: target.tradeOrderId,
        status: {
          in: [
            RefundRequestStatus.PENDING_FINANCE,
            RefundRequestStatus.APPROVED_FINANCE,
          ],
        },
      },
      select: { id: true, status: true },
    });
    if (existingActive) {
      throw new Error(
        `本订单已有进行中的退款申请 ${existingActive.id.slice(-6)} (状态 ${existingActive.status}), 请先处理后再确认退货入库`,
      );
    }

    const refund = await tx.refundRequest.create({
      data: {
        tradeOrderId: target.tradeOrderId,
        customerId: target.customerId,
        requestedAmount,
        status: RefundRequestStatus.PENDING_FINANCE,
        reason: RefundReason.CUSTOMER_REGRET,
        reasonDetail: "退货入库自动触发",
        sourcePaymentRecordIds: eligibleRecords.map(
          (r) => r.id,
        ) as Prisma.InputJsonValue,
        requesterId: actor.id,
      },
    });

    refundRequestId = refund.id;

    const linkedReturn = await tx.shippingReturn.update({
      where: { id: target.id },
      data: { refundRequestId: refund.id },
    });

    // 与 requestRefund 对齐 — COLLECTION 模块的 refund_request.created log
    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "refund_request.created",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: target.tradeOrderId,
        description: `Auto-created refund request from shipping return ${target.id}`,
        afterData: {
          refundId: refund.id,
          requestedAmount: requestedAmount.toFixed(2),
          reason: RefundReason.CUSTOMER_REGRET,
          sourcePaymentRecordCount: eligibleRecords.length,
          triggeredBy: "shipping_return",
          shippingReturnId: target.id,
        },
      },
    });

    // 同时写一条 SHIPPING 模块的联动 log, 方便发货侧追踪
    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action: "shipping_return.refund_auto_created",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: target.tradeOrderId,
        description: `Shipping return ${target.id} auto-created refund request ${refund.id}`,
        afterData: {
          shippingReturnId: target.id,
          refundRequestId: refund.id,
          requestedAmount: requestedAmount.toFixed(2),
        },
      },
    });

    return {
      shippingReturn: linkedReturn,
      refundRequestId,
    };
  });
}

/**
 * 5. 撤回退货申请.
 *    仅 PENDING_REVIEW / PENDING_RETURN_TRACKING / IN_RETURN_TRANSIT 可撤
 *    (入库后不能撤, 因为已联动 RefundRequest, 由财务侧走 RefundRequest 流程).
 *    权限: 发起人本人 / SUPERVISOR / ADMIN.
 */
export async function cancelShippingReturn(
  actor: ShippingReturnActor,
  rawInput: z.input<typeof cancelSchema>,
) {
  const input = cancelSchema.parse(rawInput);

  const target = await prisma.shippingReturn.findUnique({
    where: { id: input.shippingReturnId },
    select: {
      id: true,
      status: true,
      requesterId: true,
      tradeOrderId: true,
      tradeOrder: { select: { ownerId: true, tradeNo: true } },
    },
  });
  if (!target) {
    throw new Error("退货申请不存在");
  }

  const isOwner = target.requesterId === actor.id;
  const isPrivileged = actor.role === "ADMIN" || actor.role === "SUPERVISOR";
  if (!isOwner && !isPrivileged) {
    throw new Error("仅发起人本人或主管/管理员可撤回退货申请");
  }

  // SUPERVISOR 跨团队隔离 (本人撤回不卡跨团队, 因为 owner 即 requester 本人范围内)
  if (actor.role === "SUPERVISOR" && !isOwner) {
    await assertSupervisorTeamScope(actor, target.tradeOrder?.ownerId ?? null);
  }

  if (!ACTIVE_BEFORE_RECEIVED_STATUSES.includes(target.status)) {
    throw new Error(
      `退货单当前状态 ${target.status}, 不能撤回 (入库后请走退款流程)`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.shippingReturn.update({
      where: { id: target.id },
      data: {
        status: ShippingReturnStatus.CANCELED,
        rejectReason: null,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SHIPPING,
        action: "shipping_return.canceled",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: target.tradeOrderId,
        description: `Canceled shipping return ${target.id} (trade ${target.tradeOrder?.tradeNo ?? ""})`.trim(),
        afterData: {
          shippingReturnId: target.id,
          reason: input.reason ?? null,
          previousStatus: target.status,
        },
      },
    });

    return updated;
  });
}

/**
 * 6. UI: 取 TradeOrder 当前活跃退货 (status 非 CANCELED/REJECTED).
 *    同一 trade 同时只允许一条 active (受 PaymentRecord race 校验保护),
 *    这里按 requestedAt desc 兜底取第一条.
 */
export async function getActiveShippingReturnForTradeOrder(
  tradeOrderId: string,
) {
  return prisma.shippingReturn.findFirst({
    where: {
      tradeOrderId,
      status: { in: NON_TERMINAL_STATUSES },
    },
    include: {
      requester: { select: { id: true, name: true, username: true } },
      reviewer: { select: { id: true, name: true, username: true } },
      trackingFilledBy: { select: { id: true, name: true, username: true } },
      receivedBy: { select: { id: true, name: true, username: true } },
      shippingTask: {
        select: {
          id: true,
          trackingNumber: true,
          carrier: true,
          shippedAt: true,
        },
      },
      refundRequest: {
        select: {
          id: true,
          status: true,
          approvedAmount: true,
          paidAmount: true,
        },
      },
    },
    orderBy: { requestedAt: "desc" },
  });
}

/**
 * 7. 发货侧工作台列表 — 默认按 status 过滤, 不传则返回所有 active.
 *    SHIPPER / OPS / ADMIN 看全量 (退货物流是跨团队执行).
 *    SUPERVISOR / SALES 走自己的客户/订单详情页面取 activeShippingReturn,
 *    不通过本 helper.
 */
export async function listShippingReturnsForShipper(
  actor: ShippingReturnActor,
  filters?: {
    status?: ShippingReturnStatus | ShippingReturnStatus[];
    take?: number;
  },
) {
  if (!canFillShippingReturnTracking(actor.role)) {
    return [];
  }

  const statusFilter = filters?.status
    ? Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status
    : { in: NON_TERMINAL_STATUSES };

  return prisma.shippingReturn.findMany({
    where: { status: statusFilter },
    include: {
      requester: { select: { id: true, name: true, username: true } },
      customer: { select: { id: true, name: true, phone: true } },
      tradeOrder: { select: { id: true, tradeNo: true, finalAmount: true } },
      shippingTask: {
        select: {
          id: true,
          trackingNumber: true,
          carrier: true,
          shippedAt: true,
        },
      },
    },
    orderBy: { requestedAt: "asc" },
    take: filters?.take ?? 200,
  });
}
