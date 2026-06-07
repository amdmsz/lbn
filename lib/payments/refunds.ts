/**
 * Phase B 退款链路 (commit 6d01372 schema 上线后的 service 层).
 *
 * 状态机:
 *   PENDING_FINANCE ──[财务批准]──→ APPROVED_FINANCE ──[财务出账]──→ PAID_OUT
 *                  ↘──[财务驳回]──→ REJECTED_FINANCE
 *                  ↘──[发起人撤回]──→ WITHDRAWN
 *
 * PAID_OUT 时同步:
 *   - 建 ReversePaymentRecord (1 条 / 每个被冲账的 PaymentRecord)
 *   - 把这些 PaymentRecord 标 isReversed=true + reversedAt + reversedByRefundRequestId
 *   - 不真删 PaymentRecord (审计真相)
 *
 * 跟 RevisionRequest 联动:
 *   - 当 TradeOrderRevision 的 blockers 含 PAYMENT_CONFIRMED 时, 主管 APPROVED
 *     revision 不再直接拒, 而是自动 createRefundRequest 走本流程
 *   - (这一步在 commit 4 集成阶段做, 本 commit 仅提供 refunds.ts service)
 */

import {
  OperationModule,
  OperationTargetType,
  Prisma,
  RefundPayoutMethod,
  RefundReason,
  RefundRequestStatus,
} from "@prisma/client";
import type { RoleCode } from "@prisma/client";
import { z } from "zod";

import {
  canApproveRefund,
  canRecordRefundPayout,
  canRequestRefund,
} from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  sumDecimal,
  greaterThan,
  greaterThanOrEqual,
  isPositiveAmount,
  toDecimal,
} from "@/lib/payments/decimal";

export type RefundActor = {
  id: string;
  role: RoleCode;
};

const requestRefundSchema = z.object({
  tradeOrderId: z.string().min(1),
  revisionRequestId: z.string().optional(),
  requestedAmount: z.string().min(1, "请填写申请退款金额"),
  reason: z.nativeEnum(RefundReason),
  reasonDetail: z
    .string()
    .trim()
    .min(4, "请至少填写 4 个字的退款详情")
    .max(800),
  sourcePaymentRecordIds: z.array(z.string()).min(1, "请至少选择 1 条要冲账的收款记录"),
});

const approveRefundSchema = z.object({
  refundRequestId: z.string().min(1),
  approvedAmount: z.string().min(1, "请填写实际批准退款金额"),
  reviewNote: z.string().trim().max(800).optional(),
});

const rejectRefundSchema = z.object({
  refundRequestId: z.string().min(1),
  rejectReason: z.string().trim().min(4, "请至少填写 4 个字的驳回原因").max(800),
});

const recordPayoutSchema = z.object({
  refundRequestId: z.string().min(1),
  payoutMethod: z.nativeEnum(RefundPayoutMethod),
  payoutReference: z.string().trim().max(200).optional(),
  occurredAt: z.string().optional(), // ISO; 不传用当前时间
});

const withdrawRefundSchema = z.object({
  refundRequestId: z.string().min(1),
});

/**
 * 销售 / 主管 / 财务 / admin 发起退款申请.
 * 关联 revisionRequest 时, 一个 revision 只能有一个 RefundRequest (DB unique).
 */
export async function requestRefund(
  actor: RefundActor,
  rawInput: z.input<typeof requestRefundSchema>,
) {
  if (!canRequestRefund(actor.role)) {
    throw new Error("您没有发起退款申请的权限");
  }
  const input = requestRefundSchema.parse(rawInput);

  // 验证 tradeOrder + customer + sourcePaymentRecords 存在且属于本订单
  const tradeOrder = await prisma.tradeOrder.findUnique({
    where: { id: input.tradeOrderId },
    select: {
      id: true,
      customerId: true,
      tradeNo: true,
      ownerId: true,
    },
  });
  if (!tradeOrder) {
    throw new Error("成交主单不存在");
  }

  // SALES 只能给自己负责的订单发起退款
  if (actor.role === "SALES" && tradeOrder.ownerId !== actor.id) {
    throw new Error("您只能给自己负责的订单发起退款申请");
  }

  const sourceRecords = await prisma.paymentRecord.findMany({
    where: {
      id: { in: input.sourcePaymentRecordIds },
      tradeOrderId: input.tradeOrderId,
    },
    select: { id: true, amount: true, status: true, isReversed: true },
  });

  if (sourceRecords.length !== input.sourcePaymentRecordIds.length) {
    throw new Error("部分 PaymentRecord 不存在或不属于本订单");
  }

  for (const record of sourceRecords) {
    if (record.isReversed) {
      throw new Error(`PaymentRecord ${record.id} 已被先前的退款冲账, 不能重复`);
    }
  }

  // 验证 requestedAmount > 0 且 <= sum(可冲账金额)
  const requestedAmount = toDecimal(input.requestedAmount);
  if (!isPositiveAmount(requestedAmount)) {
    throw new Error("申请退款金额必须大于 0");
  }
  const availableTotal = sumDecimal(sourceRecords.map((r) => r.amount));
  if (greaterThan(requestedAmount, availableTotal)) {
    throw new Error(
      `申请退款金额 ${requestedAmount.toFixed(2)} 超过可冲账总额 ${availableTotal.toFixed(2)}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    // 防 race: 同 tradeOrder + revisionRequest 不能有多个 PENDING/APPROVED 的 RefundRequest
    if (input.revisionRequestId) {
      const existing = await tx.refundRequest.findUnique({
        where: { revisionRequestId: input.revisionRequestId },
        select: { id: true, status: true },
      });
      if (existing) {
        throw new Error(
          `本 revision 已关联退款申请 ${existing.id.slice(-6)} (状态 ${existing.status})`,
        );
      }
    } else {
      const existingActive = await tx.refundRequest.findFirst({
        where: {
          tradeOrderId: input.tradeOrderId,
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
          `本订单已有进行中的退款申请 ${existingActive.id.slice(-6)} (状态 ${existingActive.status})`,
        );
      }
    }

    const refund = await tx.refundRequest.create({
      data: {
        revisionRequestId: input.revisionRequestId,
        tradeOrderId: input.tradeOrderId,
        customerId: tradeOrder.customerId,
        requestedAmount,
        status: RefundRequestStatus.PENDING_FINANCE,
        reason: input.reason,
        reasonDetail: input.reasonDetail,
        sourcePaymentRecordIds:
          input.sourcePaymentRecordIds as Prisma.InputJsonValue,
        requesterId: actor.id,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "refund_request.created",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: input.tradeOrderId,
        description: `Created refund request for trade order ${tradeOrder.tradeNo}`,
        afterData: {
          refundId: refund.id,
          requestedAmount: requestedAmount.toFixed(2),
          reason: input.reason,
          sourcePaymentRecordCount: input.sourcePaymentRecordIds.length,
        },
      },
    });

    return refund;
  });
}

/**
 * 财务批准 — 设 approvedAmount (允许 < requested 表示部分退款), 进入 APPROVED_FINANCE.
 */
export async function approveRefund(
  actor: RefundActor,
  rawInput: z.input<typeof approveRefundSchema>,
) {
  if (!canApproveRefund(actor.role)) {
    throw new Error("仅财务或 ADMIN 可批准退款申请");
  }
  const input = approveRefundSchema.parse(rawInput);

  const refund = await prisma.refundRequest.findUnique({
    where: { id: input.refundRequestId },
    select: {
      id: true,
      status: true,
      requesterId: true,
      tradeOrderId: true,
      requestedAmount: true,
      sourcePaymentRecordIds: true,
    },
  });
  if (!refund) throw new Error("退款申请不存在");
  if (refund.status !== RefundRequestStatus.PENDING_FINANCE) {
    throw new Error(`退款申请当前状态 ${refund.status}, 不能批准`);
  }
  if (refund.requesterId === actor.id && actor.role !== "ADMIN") {
    throw new Error("不能批准自己发起的退款申请, 请由其他财务处理");
  }

  const approvedAmount = toDecimal(input.approvedAmount);
  if (!isPositiveAmount(approvedAmount)) {
    throw new Error("批准退款金额必须大于 0");
  }
  if (greaterThan(approvedAmount, refund.requestedAmount)) {
    throw new Error("批准金额不能大于申请金额");
  }
  // 同时验证不超可冲账总额 (防 race: 申请期间源 PaymentRecord 被改了)
  const sourceIds = refund.sourcePaymentRecordIds as string[];
  const sourceRecords = await prisma.paymentRecord.findMany({
    where: { id: { in: sourceIds } },
    select: { amount: true, isReversed: true },
  });
  if (sourceRecords.some((r) => r.isReversed)) {
    throw new Error("源 PaymentRecord 已被其他退款冲账, 本申请已失效");
  }
  const availableTotal = sumDecimal(sourceRecords.map((r) => r.amount));
  if (greaterThan(approvedAmount, availableTotal)) {
    throw new Error(
      `批准金额 ${approvedAmount.toFixed(2)} 超过可冲账总额 ${availableTotal.toFixed(2)}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: RefundRequestStatus.APPROVED_FINANCE,
        approvedAmount,
        financeReviewerId: actor.id,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote ?? null,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "refund_request.approved",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: refund.tradeOrderId,
        description: `Approved refund request ${refund.id}`,
        afterData: {
          refundId: refund.id,
          approvedAmount: approvedAmount.toFixed(2),
          reviewNote: input.reviewNote ?? null,
        },
      },
    });

    return updated;
  });
}

/**
 * 财务驳回.
 */
export async function rejectRefund(
  actor: RefundActor,
  rawInput: z.input<typeof rejectRefundSchema>,
) {
  if (!canApproveRefund(actor.role)) {
    throw new Error("仅财务或 ADMIN 可驳回退款申请");
  }
  const input = rejectRefundSchema.parse(rawInput);

  const refund = await prisma.refundRequest.findUnique({
    where: { id: input.refundRequestId },
    select: { id: true, status: true, requesterId: true, tradeOrderId: true },
  });
  if (!refund) throw new Error("退款申请不存在");
  if (refund.status !== RefundRequestStatus.PENDING_FINANCE) {
    throw new Error(`退款申请当前状态 ${refund.status}, 不能驳回`);
  }
  if (refund.requesterId === actor.id && actor.role !== "ADMIN") {
    throw new Error("不能驳回自己发起的退款申请, 请由其他财务处理");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: RefundRequestStatus.REJECTED_FINANCE,
        financeReviewerId: actor.id,
        reviewedAt: new Date(),
        rejectReason: input.rejectReason,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "refund_request.rejected",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: refund.tradeOrderId,
        description: `Rejected refund request ${refund.id}`,
        afterData: { refundId: refund.id, rejectReason: input.rejectReason },
      },
    });

    return updated;
  });
}

/**
 * 财务记录实际出账 — APPROVED_FINANCE → PAID_OUT.
 * 同时建 ReversePaymentRecord + 标 PaymentRecord.isReversed.
 */
export async function recordRefundPayout(
  actor: RefundActor,
  rawInput: z.input<typeof recordPayoutSchema>,
) {
  if (!canRecordRefundPayout(actor.role)) {
    throw new Error("仅财务或 ADMIN 可记录退款出账");
  }
  const input = recordPayoutSchema.parse(rawInput);

  const refund = await prisma.refundRequest.findUnique({
    where: { id: input.refundRequestId },
    select: {
      id: true,
      status: true,
      tradeOrderId: true,
      approvedAmount: true,
      sourcePaymentRecordIds: true,
    },
  });
  if (!refund) throw new Error("退款申请不存在");
  if (refund.status !== RefundRequestStatus.APPROVED_FINANCE) {
    throw new Error(`退款申请当前状态 ${refund.status}, 不能记录出账`);
  }
  if (!refund.approvedAmount) {
    throw new Error("退款申请没有批准金额, 不能出账");
  }

  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();

  return prisma.$transaction(async (tx) => {
    // 出账金额按比例分配到每个 source PaymentRecord
    const sourceIds = refund.sourcePaymentRecordIds as string[];
    const sources = await tx.paymentRecord.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, amount: true, isReversed: true },
    });
    if (sources.some((s) => s.isReversed)) {
      throw new Error("源 PaymentRecord 已被其他退款冲账, 本申请已失效");
    }

    const sourceTotal = sumDecimal(sources.map((s) => s.amount));
    if (!greaterThanOrEqual(sourceTotal, refund.approvedAmount)) {
      throw new Error("源 PaymentRecord 总额已不足以覆盖批准金额");
    }

    // 简化策略: 按比例分配 (approvedAmount * sourceAmount / sourceTotal)
    const approvedAmount = toDecimal(refund.approvedAmount);
    const reverseRecords: Array<{
      id: string;
      sourcePaymentRecordId: string;
      amount: Prisma.Decimal;
    }> = [];

    for (const src of sources) {
      const portion = toDecimal(src.amount)
        .div(sourceTotal)
        .mul(approvedAmount)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      if (!isPositiveAmount(portion)) continue;

      const created = await tx.reversePaymentRecord.create({
        data: {
          refundRequestId: refund.id,
          sourcePaymentRecordId: src.id,
          amount: portion,
          occurredAt,
          payoutMethod: input.payoutMethod,
          payoutReference: input.payoutReference ?? null,
          createdById: actor.id,
        },
      });
      reverseRecords.push({
        id: created.id,
        sourcePaymentRecordId: src.id,
        amount: portion,
      });
    }

    // 把所有 source PaymentRecord 标 isReversed
    await tx.paymentRecord.updateMany({
      where: { id: { in: sourceIds } },
      data: {
        isReversed: true,
        reversedAt: occurredAt,
        reversedByRefundRequestId: refund.id,
      },
    });

    const updated = await tx.refundRequest.update({
      where: { id: refund.id },
      data: {
        status: RefundRequestStatus.PAID_OUT,
        paidAmount: approvedAmount,
        payoutMethod: input.payoutMethod,
        payoutReference: input.payoutReference ?? null,
        paidOutAt: occurredAt,
        paidOutById: actor.id,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "refund_request.paid_out",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: refund.tradeOrderId,
        description: `Paid out refund request ${refund.id} with ${reverseRecords.length} reverse records`,
        afterData: {
          refundId: refund.id,
          paidAmount: approvedAmount.toFixed(2),
          payoutMethod: input.payoutMethod,
          payoutReference: input.payoutReference ?? null,
          reverseRecordIds: reverseRecords.map((r) => r.id),
        },
      },
    });

    return { refund: updated, reverseRecords };
  });
}

/**
 * 发起人撤回 (仅 PENDING_FINANCE 阶段可撤).
 */
export async function withdrawRefund(
  actor: RefundActor,
  rawInput: z.input<typeof withdrawRefundSchema>,
) {
  const input = withdrawRefundSchema.parse(rawInput);

  const refund = await prisma.refundRequest.findUnique({
    where: { id: input.refundRequestId },
    select: { id: true, status: true, requesterId: true, tradeOrderId: true },
  });
  if (!refund) throw new Error("退款申请不存在");
  if (refund.status !== RefundRequestStatus.PENDING_FINANCE) {
    throw new Error("仅 PENDING_FINANCE 状态的退款申请可撤回");
  }
  if (refund.requesterId !== actor.id && actor.role !== "ADMIN") {
    throw new Error("仅发起人或 ADMIN 可撤回此申请");
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.refundRequest.update({
      where: { id: refund.id },
      data: { status: RefundRequestStatus.WITHDRAWN, reviewedAt: new Date() },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.COLLECTION,
        action: "refund_request.withdrawn",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: refund.tradeOrderId,
        description: `Withdrew refund request ${refund.id}`,
      },
    });

    return updated;
  });
}

/**
 * 查 TradeOrder 当前活跃的退款申请 (UI 用).
 */
export async function getActiveRefundForTradeOrder(tradeOrderId: string) {
  return prisma.refundRequest.findFirst({
    where: {
      tradeOrderId,
      status: {
        in: [
          RefundRequestStatus.PENDING_FINANCE,
          RefundRequestStatus.APPROVED_FINANCE,
        ],
      },
    },
    include: {
      requester: { select: { id: true, name: true, username: true } },
      financeReviewer: { select: { id: true, name: true, username: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
}

/**
 * 列表 — 财务工作台用.
 */
export async function listPendingRefundsForFinance(actor: RefundActor) {
  if (!canApproveRefund(actor.role)) {
    return [];
  }
  return prisma.refundRequest.findMany({
    where: {
      status: {
        in: [
          RefundRequestStatus.PENDING_FINANCE,
          RefundRequestStatus.APPROVED_FINANCE,
        ],
      },
    },
    include: {
      requester: { select: { id: true, name: true, username: true } },
      customer: { select: { id: true, name: true, phone: true } },
      tradeOrder: { select: { id: true, tradeNo: true } },
    },
    orderBy: { requestedAt: "asc" },
    take: 200,
  });
}
