/**
 * 已审核 TradeOrder 的撤单 / 改单工作流 (阶段 A MVP)
 *
 * 适用窗口: 主管已审核通过, 且
 *   - 所有 ShippingTask 均未发货 (shippedAt IS NULL)
 *   - 所有 PaymentRecord 均未被财务确认 (confirmedAt IS NULL)
 *   - 所有 CodCollectionRecord 未代收落地 (status != COLLECTED)
 *
 * 状态机:
 *   APPROVED ─[销售/主管/admin 发起 RevisionRequest]─→ REVISION_PENDING
 *   REVISION_PENDING ─[主管复审 APPROVED + kind=CANCEL]─→ CANCELED
 *   REVISION_PENDING ─[主管复审 REJECTED]──────────────→ 回 APPROVED
 *   REVISION_PENDING ─[requester withdraw]─────────────→ 回 APPROVED
 *
 * MVP 仅实施 kind=CANCEL (整单撤销). REDUCE_QUANTITY / MODIFY_LINES 在 schema
 * 中已经定义但服务端会拒绝, 留待阶段 A.1 增量上线.
 */

import {
  OperationModule,
  OperationTargetType,
  Prisma,
  ShippingFulfillmentStatus,
  ShippingTaskStatus,
  SalesSubOrderStatus,
  TradeOrderRevisionKind,
  TradeOrderRevisionStatus,
  TradeOrderStatus,
} from "@prisma/client";
import { z } from "zod";

import type { RoleCode } from "@prisma/client";

import { canCreateSalesOrder, canReviewSalesOrder } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";

export type RevisionActor = {
  id: string;
  role: RoleCode;
};

const requestRevisionSchema = z.object({
  tradeOrderId: z.string().min(1, "请选择需要撤单的成交主单"),
  kind: z.nativeEnum(TradeOrderRevisionKind),
  reason: z
    .string()
    .trim()
    .min(4, "请填写至少 4 个字的撤单原因")
    .max(800, "原因过长 (上限 800 字)"),
});

const reviewRevisionSchema = z.object({
  revisionId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(800).optional(),
});

const withdrawRevisionSchema = z.object({
  revisionId: z.string().min(1),
});

export type RevisionBlocker = {
  code:
    | "ALREADY_SHIPPED"
    | "PAYMENT_CONFIRMED"
    | "COD_COLLECTED"
    | "STATUS_NOT_APPROVED"
    | "REVISION_IN_FLIGHT";
  message: string;
};

export type CheckRevisionBlockersResult =
  | { ok: true; blockers: [] }
  | { ok: false; blockers: RevisionBlocker[] };

/**
 * 在发起 / 执行撤单前重新检查不可逆临界点.
 * 必须在主管复审执行的同一个 transaction 里再调一次, 防止 race condition.
 */
export async function checkRevisionBlockers(
  db: Prisma.TransactionClient | typeof prisma,
  tradeOrderId: string,
): Promise<CheckRevisionBlockersResult> {
  const blockers: RevisionBlocker[] = [];

  const tradeOrder = await db.tradeOrder.findUnique({
    where: { id: tradeOrderId },
    select: { tradeStatus: true },
  });

  if (!tradeOrder) {
    return {
      ok: false,
      blockers: [
        { code: "STATUS_NOT_APPROVED", message: "成交主单不存在或已被回收" },
      ],
    };
  }

  // 已经在撤单审批中 — 不能再叠一个新申请
  if (tradeOrder.tradeStatus === TradeOrderStatus.REVISION_PENDING) {
    blockers.push({
      code: "REVISION_IN_FLIGHT",
      message: "本订单已有一个撤单申请正在审批中,请先处理完再发起新申请",
    });
  } else if (tradeOrder.tradeStatus !== TradeOrderStatus.APPROVED) {
    blockers.push({
      code: "STATUS_NOT_APPROVED",
      message: "仅审核通过 (APPROVED) 的成交主单可以发起撤单 / 改单",
    });
  }

  // T1: 已发货
  const shippedCount = await db.shippingTask.count({
    where: {
      tradeOrderId,
      OR: [
        { shippedAt: { not: null } },
        { status: ShippingTaskStatus.COMPLETED },
        { shippingStatus: ShippingFulfillmentStatus.SHIPPED },
        { shippingStatus: ShippingFulfillmentStatus.DELIVERED },
        { shippingStatus: ShippingFulfillmentStatus.COMPLETED },
      ],
    },
  });
  if (shippedCount > 0) {
    blockers.push({
      code: "ALREADY_SHIPPED",
      message: `本订单已有 ${shippedCount} 张发货任务进入物流环节, 需走退货流程 (阶段 C, 待开发)`,
    });
  }

  // T3: 财务已确认收款
  const confirmedPaymentCount = await db.paymentRecord.count({
    where: {
      tradeOrderId,
      confirmedAt: { not: null },
    },
  });
  if (confirmedPaymentCount > 0) {
    blockers.push({
      code: "PAYMENT_CONFIRMED",
      message: `本订单已有 ${confirmedPaymentCount} 条财务已确认的收款, 需走退款流程 (阶段 B, 待开发)`,
    });
  }

  // T4: COD 已代收落地
  const collectedCodCount = await db.codCollectionRecord.count({
    where: {
      tradeOrderId,
      status: "COLLECTED",
    },
  });
  if (collectedCodCount > 0) {
    blockers.push({
      code: "COD_COLLECTED",
      message: `本订单已有 ${collectedCodCount} 条 COD 代收落地, 需走退款流程 (阶段 B, 待开发)`,
    });
  }

  return blockers.length === 0
    ? { ok: true, blockers: [] }
    : { ok: false, blockers };
}

/**
 * 销售 / 主管 / admin 发起撤单申请.
 * 本订单的 tradeStatus 会从 APPROVED 改为 REVISION_PENDING (锁定, 防 UI 改),
 * 但不真正逆向任何下游 — 等主管 reviewTradeOrderRevision 通过才真逆向.
 */
export async function requestTradeOrderRevision(
  actor: RevisionActor,
  rawInput: z.input<typeof requestRevisionSchema>,
) {
  if (!canCreateSalesOrder(actor.role)) {
    throw new Error("您没有发起成交主单撤单 / 改单的权限");
  }

  const input = requestRevisionSchema.parse(rawInput);

  if (input.kind !== TradeOrderRevisionKind.CANCEL) {
    throw new Error(
      "阶段 A MVP 仅支持整单撤销 (CANCEL); 减量 / 改 SKU 将在阶段 A.1 上线",
    );
  }

  const tradeOrder = await prisma.tradeOrder.findUnique({
    where: { id: input.tradeOrderId },
    select: {
      id: true,
      tradeNo: true,
      ownerId: true,
      customerId: true,
      tradeStatus: true,
      reviewStatus: true,
      finalAmount: true,
      depositAmount: true,
      codAmount: true,
      salesOrders: {
        select: {
          id: true,
          subOrderNo: true,
          supplierId: true,
          subOrderStatus: true,
          finalAmount: true,
        },
      },
    },
  });

  if (!tradeOrder) {
    throw new Error("成交主单不存在或已被回收");
  }

  // 销售只能撤自己的单 (admin / supervisor 可以撤任何单)
  if (
    actor.role === "SALES" &&
    tradeOrder.ownerId &&
    tradeOrder.ownerId !== actor.id
  ) {
    throw new Error("您只能对自己负责的成交主单发起撤单申请");
  }

  const blockerCheck = await checkRevisionBlockers(prisma, tradeOrder.id);
  if (!blockerCheck.ok) {
    const err = new Error(blockerCheck.blockers.map((b) => b.message).join("; "));
    (err as Error & { blockers?: RevisionBlocker[] }).blockers = blockerCheck.blockers;
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    const revision = await tx.tradeOrderRevisionRequest.create({
      data: {
        tradeOrderId: tradeOrder.id,
        kind: input.kind,
        status: TradeOrderRevisionStatus.PENDING,
        reason: input.reason,
        requesterId: actor.id,
        originalSnapshot: {
          tradeNo: tradeOrder.tradeNo,
          tradeStatus: tradeOrder.tradeStatus,
          reviewStatus: tradeOrder.reviewStatus,
          finalAmount: tradeOrder.finalAmount.toString(),
          depositAmount: tradeOrder.depositAmount.toString(),
          codAmount: tradeOrder.codAmount.toString(),
          salesOrders: tradeOrder.salesOrders.map((so) => ({
            id: so.id,
            subOrderNo: so.subOrderNo,
            supplierId: so.supplierId,
            subOrderStatus: so.subOrderStatus,
            finalAmount: so.finalAmount.toString(),
          })),
        } satisfies Prisma.InputJsonValue,
      },
    });

    await tx.tradeOrder.update({
      where: { id: tradeOrder.id },
      data: {
        tradeStatus: TradeOrderStatus.REVISION_PENDING,
        updatedById: actor.id,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action: "trade_order.revision_requested",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: tradeOrder.id,
        description: `Requested revision (${input.kind}) for trade order ${tradeOrder.tradeNo}: ${input.reason}`,
        beforeData: { tradeStatus: tradeOrder.tradeStatus },
        afterData: {
          revisionId: revision.id,
          kind: input.kind,
          reason: input.reason,
        },
      },
    });

    return revision;
  });
}

/**
 * 主管 / admin 复审撤单申请.
 * APPROVED + kind=CANCEL  → 逆向所有下游 (在事务内), TradeOrder -> CANCELED
 * REJECTED                → 仅状态回 APPROVED, 下游不动
 */
export async function reviewTradeOrderRevision(
  actor: RevisionActor,
  rawInput: z.input<typeof reviewRevisionSchema>,
) {
  if (!canReviewSalesOrder(actor.role)) {
    throw new Error("您没有复审撤单 / 改单申请的权限");
  }

  const input = reviewRevisionSchema.parse(rawInput);

  const revision = await prisma.tradeOrderRevisionRequest.findUnique({
    where: { id: input.revisionId },
    select: {
      id: true,
      tradeOrderId: true,
      kind: true,
      status: true,
      requesterId: true,
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
          tradeStatus: true,
          reviewStatus: true,
        },
      },
    },
  });

  if (!revision) {
    throw new Error("撤单申请不存在");
  }

  if (revision.status !== TradeOrderRevisionStatus.PENDING) {
    throw new Error(`本撤单申请当前状态为 ${revision.status}, 不能再次复审`);
  }

  // 4 眼原则: 不允许 requester 自审 (admin 例外, 因 admin 是兜底)
  if (revision.requesterId === actor.id && actor.role !== "ADMIN") {
    throw new Error("不能复审自己发起的撤单申请, 请由其他主管处理");
  }

  const reviewedAt = new Date();

  if (input.decision === "REJECTED") {
    return prisma.$transaction(async (tx) => {
      await tx.tradeOrderRevisionRequest.update({
        where: { id: revision.id },
        data: {
          status: TradeOrderRevisionStatus.REJECTED,
          reviewerId: actor.id,
          reviewedAt,
          reviewNote: input.reviewNote ?? null,
        },
      });

      await tx.tradeOrder.update({
        where: { id: revision.tradeOrderId },
        data: {
          tradeStatus: TradeOrderStatus.APPROVED,
          updatedById: actor.id,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SALES_ORDER,
          action: "trade_order.revision_rejected",
          targetType: OperationTargetType.TRADE_ORDER,
          targetId: revision.tradeOrderId,
          description: `Rejected revision request for trade order ${revision.tradeOrder.tradeNo}`,
          beforeData: { revisionStatus: revision.status },
          afterData: {
            revisionId: revision.id,
            reviewNote: input.reviewNote ?? null,
          },
        },
      });

      return { status: "REJECTED" as const, revisionId: revision.id };
    });
  }

  // === APPROVED 分支: 真逆向 ===
  return prisma.$transaction(async (tx) => {
    // 再次防御性检查 blockers (防止 PENDING 期间发货 / 收款落地)
    const recheck = await checkRevisionBlockers(tx, revision.tradeOrderId);
    if (!recheck.ok) {
      // 自动标 blocked, 不真逆向 — 改单失败但留痕
      await tx.tradeOrderRevisionRequest.update({
        where: { id: revision.id },
        data: {
          status: TradeOrderRevisionStatus.REJECTED,
          reviewerId: actor.id,
          reviewedAt,
          blockedReason: recheck.blockers.map((b) => b.message).join("; "),
          reviewNote: input.reviewNote ?? null,
        },
      });
      // 状态回 APPROVED, 下游已经在变 (发货 / 收款) 所以保留 APPROVED
      await tx.tradeOrder.update({
        where: { id: revision.tradeOrderId },
        data: {
          tradeStatus: TradeOrderStatus.APPROVED,
          updatedById: actor.id,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SALES_ORDER,
          action: "trade_order.revision_blocked",
          targetType: OperationTargetType.TRADE_ORDER,
          targetId: revision.tradeOrderId,
          description: `Revision auto-blocked during review for trade order ${revision.tradeOrder.tradeNo}`,
          afterData: {
            revisionId: revision.id,
            blockers: recheck.blockers,
          },
        },
      });

      const err = new Error(
        `复审期间下游状态已变更, 撤单已自动改为驳回: ${recheck.blockers.map((b) => b.message).join("; ")}`,
      );
      (err as Error & { blockers?: RevisionBlocker[] }).blockers = recheck.blockers;
      throw err;
    }

    // === 真逆向所有子表 ===
    const shippingTasks = await tx.shippingTask.findMany({
      where: { tradeOrderId: revision.tradeOrderId },
      select: { id: true, status: true, shippingStatus: true },
    });

    const cancelledShippingTaskIds: string[] = [];
    for (const st of shippingTasks) {
      // recheck 已经过, 此处的 shippingTask 都应该是未发货状态
      await tx.shippingTask.update({
        where: { id: st.id },
        data: {
          status: ShippingTaskStatus.CANCELED,
          shippingStatus: ShippingFulfillmentStatus.CANCELED,
        },
      });
      cancelledShippingTaskIds.push(st.id);
    }

    const paymentRecords = await tx.paymentRecord.findMany({
      where: {
        tradeOrderId: revision.tradeOrderId,
        confirmedAt: null,
      },
      select: { id: true },
    });
    const cancelledPaymentRecordIds = paymentRecords.map((p) => p.id);
    if (cancelledPaymentRecordIds.length > 0) {
      await tx.paymentRecord.deleteMany({
        where: { id: { in: cancelledPaymentRecordIds } },
      });
    }

    const collectionTasks = await tx.collectionTask.findMany({
      where: { tradeOrderId: revision.tradeOrderId },
      select: { id: true },
    });
    const cancelledCollectionTaskIds = collectionTasks.map((c) => c.id);
    if (cancelledCollectionTaskIds.length > 0) {
      await tx.collectionTask.deleteMany({
        where: { id: { in: cancelledCollectionTaskIds } },
      });
    }

    const paymentPlans = await tx.paymentPlan.findMany({
      where: { tradeOrderId: revision.tradeOrderId },
      select: { id: true },
    });
    const cancelledPaymentPlanIds = paymentPlans.map((p) => p.id);
    if (cancelledPaymentPlanIds.length > 0) {
      await tx.paymentPlan.deleteMany({
        where: { id: { in: cancelledPaymentPlanIds } },
      });
    }

    const cancelledCodIds = await tx.codCollectionRecord.findMany({
      where: { tradeOrderId: revision.tradeOrderId },
      select: { id: true },
    });
    if (cancelledCodIds.length > 0) {
      await tx.codCollectionRecord.deleteMany({
        where: { id: { in: cancelledCodIds.map((c) => c.id) } },
      });
    }

    const salesOrders = await tx.salesOrder.findMany({
      where: { tradeOrderId: revision.tradeOrderId },
      select: { id: true },
    });
    const cancelledSalesOrderIds: string[] = [];
    for (const so of salesOrders) {
      await tx.salesOrder.update({
        where: { id: so.id },
        data: {
          subOrderStatus: SalesSubOrderStatus.CANCELED,
          updatedById: actor.id,
        },
      });
      cancelledSalesOrderIds.push(so.id);
    }

    // 主单收尾
    await tx.tradeOrder.update({
      where: { id: revision.tradeOrderId },
      data: {
        tradeStatus: TradeOrderStatus.CANCELED,
        updatedById: actor.id,
      },
    });

    await tx.tradeOrderRevisionRequest.update({
      where: { id: revision.id },
      data: {
        status: TradeOrderRevisionStatus.APPROVED,
        reviewerId: actor.id,
        reviewedAt,
        reviewNote: input.reviewNote ?? null,
        cancelledShippingTaskIds: cancelledShippingTaskIds as Prisma.InputJsonValue,
        cancelledPaymentPlanIds: cancelledPaymentPlanIds as Prisma.InputJsonValue,
        cancelledPaymentRecordIds:
          cancelledPaymentRecordIds as Prisma.InputJsonValue,
        cancelledCollectionTaskIds:
          cancelledCollectionTaskIds as Prisma.InputJsonValue,
        cancelledSalesOrderIds: cancelledSalesOrderIds as Prisma.InputJsonValue,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action: "trade_order.revision_approved_cancel",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: revision.tradeOrderId,
        description: `Cancelled trade order ${revision.tradeOrder.tradeNo} via approved revision request`,
        beforeData: { tradeStatus: TradeOrderStatus.REVISION_PENDING },
        afterData: {
          revisionId: revision.id,
          cancelledShippingTaskIds,
          cancelledPaymentPlanIds,
          cancelledPaymentRecordIds,
          cancelledCollectionTaskIds,
          cancelledSalesOrderIds,
        },
      },
    });

    return {
      status: "APPROVED" as const,
      revisionId: revision.id,
      tradeOrderId: revision.tradeOrderId,
      cancelledShippingTaskIds,
      cancelledPaymentPlanIds,
      cancelledPaymentRecordIds,
      cancelledCollectionTaskIds,
      cancelledSalesOrderIds,
    };
  });
}

/**
 * 销售本人撤回自己发起的 PENDING 申请.
 */
export async function withdrawTradeOrderRevision(
  actor: RevisionActor,
  rawInput: z.input<typeof withdrawRevisionSchema>,
) {
  const input = withdrawRevisionSchema.parse(rawInput);

  const revision = await prisma.tradeOrderRevisionRequest.findUnique({
    where: { id: input.revisionId },
    select: {
      id: true,
      tradeOrderId: true,
      status: true,
      requesterId: true,
      tradeOrder: { select: { tradeNo: true } },
    },
  });

  if (!revision) {
    throw new Error("撤单申请不存在");
  }

  if (revision.status !== TradeOrderRevisionStatus.PENDING) {
    throw new Error("仅 PENDING 状态的撤单申请可以撤回");
  }

  if (revision.requesterId !== actor.id && actor.role !== "ADMIN") {
    throw new Error("仅发起人或 admin 可以撤回此申请");
  }

  return prisma.$transaction(async (tx) => {
    await tx.tradeOrderRevisionRequest.update({
      where: { id: revision.id },
      data: {
        status: TradeOrderRevisionStatus.WITHDRAWN,
        reviewedAt: new Date(),
      },
    });

    await tx.tradeOrder.update({
      where: { id: revision.tradeOrderId },
      data: {
        tradeStatus: TradeOrderStatus.APPROVED,
        updatedById: actor.id,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action: "trade_order.revision_withdrawn",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: revision.tradeOrderId,
        description: `Withdrew revision request for trade order ${revision.tradeOrder.tradeNo}`,
      },
    });

    return { status: "WITHDRAWN" as const, revisionId: revision.id };
  });
}

/**
 * 读取当前 TradeOrder 是否有 PENDING 的撤单申请. UI 用.
 */
export async function getActiveRevisionForTradeOrder(tradeOrderId: string) {
  return prisma.tradeOrderRevisionRequest.findFirst({
    where: {
      tradeOrderId,
      status: TradeOrderRevisionStatus.PENDING,
    },
    include: {
      requester: { select: { id: true, name: true, username: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
}

/**
 * 读取一张 TradeOrder 的所有历史撤单申请. UI 时间线用.
 */
export async function listTradeOrderRevisionHistory(tradeOrderId: string) {
  return prisma.tradeOrderRevisionRequest.findMany({
    where: { tradeOrderId },
    include: {
      requester: { select: { id: true, name: true, username: true } },
      reviewer: { select: { id: true, name: true, username: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
}
