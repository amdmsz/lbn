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
  // 当状态为 PENDING_RETURN_TRACKING (尚未填回单) 时跳过运单, 直接现场签收入库,
  // 必须显式 receivedWithoutTracking=true + 至少 4 字理由, 服务端会单独写 OperationLog
  // (action=shipping_return.received_without_tracking) 留给财务事后核对.
  // IN_RETURN_TRANSIT 状态忽略本对.
  receivedWithoutTracking: z.boolean().optional(),
  receivedWithoutTrackingReason: z.string().trim().max(800).optional(),
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

  // 跳过运单的现场签收入库守卫 — 防止 PENDING_RETURN_TRACKING 直接入库丢失退货物流回执.
  // 必须显式 receivedWithoutTracking=true + 至少 4 字理由 (例如 "客户上门自取, 无运单"),
  // 否则视为数据丢失风险, 应该先走 fillShippingReturnTracking 回填运单再入库.
  const skipsTracking =
    target.status === ShippingReturnStatus.PENDING_RETURN_TRACKING;
  let skipTrackingReason: string | null = null;
  if (skipsTracking) {
    if (!input.receivedWithoutTracking) {
      throw new Error(
        "该退货单尚未登记退货运单 — 请先填写运单后再入库; 若确为现场签收 (无运单), 请显式勾选『确认无运单入库』并填写理由",
      );
    }
    const reason = input.receivedWithoutTrackingReason?.trim() ?? "";
    if (reason.length < 4) {
      throw new Error(
        "无运单入库必须填写至少 4 个字的理由 (例如: 客户上门自提 / 司机现场卸货无回执)",
      );
    }
    skipTrackingReason = reason;
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
          receivedWithoutTracking: skipsTracking,
        },
      },
    });

    // 无运单现场签收单独留 audit log — 财务侧后续核对 "为什么这笔退款没有运单回执" 时
    // 必须能在 OperationLog 里检索到这条 reason. 没这条就视为退货物理回执缺失.
    if (skipsTracking && skipTrackingReason) {
      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SHIPPING,
          action: "shipping_return.received_without_tracking",
          targetType: OperationTargetType.TRADE_ORDER,
          targetId: target.tradeOrderId,
          description: `Shipping return ${target.id} received WITHOUT tracking (on-site pickup / no carrier receipt) for trade order ${target.tradeOrder?.tradeNo ?? ""}`.trim(),
          afterData: {
            shippingReturnId: target.id,
            reason: skipTrackingReason,
            previousStatus: ShippingReturnStatus.PENDING_RETURN_TRACKING,
            finalRefundAmount: settledExpectedRefundAmount.toFixed(2),
          },
        },
      });
    }

    // 自动触发 RefundRequest — 找该订单下所有 confirmed && 未冲账的 PaymentRecord.
    //
    // race 修复 (wt-16): 用 SELECT ... FOR UPDATE 在事务内对候选 PaymentRecord 加行级写锁,
    // 防止并发 recordRefundPayout (lib/payments/refunds.ts) 在我们 findMany 与
    // refundRequest.create 之间把同样的记录 flip 到 isReversed=true. 不加锁会
    // 造出 sourcePaymentRecordIds 指向 reversed 记录的"死单", 后续 approveRefund /
    // recordRefundPayout 必然抛 "PaymentRecord 已被其他退款冲账, 本申请已失效",
    // 而 ShippingReturn 已经写入 refundRequestId, 进入永久卡死状态.
    //
    // 注: MySQL InnoDB 下 FOR UPDATE 持有的 next-key lock 也能阻塞并发 updateMany.
    // tx.paymentRecord.findMany 在 isReversed=false 过滤下已经天然排除"早就冲过账"
    // 的记录, 但只挡得住 tx 之前完成的, 挡不住 tx 之后并发完成的. FOR UPDATE 把
    // 候选行锁住, 直到本 tx commit, 任何并发 paid_out 必须排队等待.
    type EligibleRow = { id: string; amount: Prisma.Decimal };
    const eligibleRecords = await tx.$queryRaw<EligibleRow[]>`
      SELECT \`id\`, \`amount\`
      FROM \`paymentrecord\`
      WHERE \`tradeOrderId\` = ${target.tradeOrderId}
        AND \`confirmedAt\` IS NOT NULL
        AND \`isReversed\` = false
      FOR UPDATE
    `;

    let refundRequestId: string | null = null;

    // skip 路径: 把"无可冲账记录"和"被并发 race 毒化"两种情况合并到同一个 fallback,
    // 让发货侧入库继续成功 + 写一条带 reason 的说明性 log 给财务追线索, 而不是
    // 静默写一张永远付不出去的死退款单.
    const writeSkipAndReturn = async (
      reason: "NO_CONFIRMED_PAYMENT_RECORD" | "RACE_WITH_CONCURRENT_REFUND",
    ) => {
      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SHIPPING,
          action: "shipping_return.refund_auto_skipped",
          targetType: OperationTargetType.TRADE_ORDER,
          targetId: target.tradeOrderId,
          description:
            reason === "RACE_WITH_CONCURRENT_REFUND"
              ? `Shipping return ${target.id} received, source payment records were just reversed by a concurrent refund — finance must manually create refund`
              : `Shipping return ${target.id} received, no confirmed payment records to reverse — finance must manually create refund`,
          afterData: {
            shippingReturnId: target.id,
            expectedRefundAmount: settledExpectedRefundAmount.toFixed(2),
            reason,
          },
        },
      });
      return {
        shippingReturn: updatedReturn,
        refundRequestId: null as string | null,
      };
    };

    if (eligibleRecords.length === 0) {
      return writeSkipAndReturn("NO_CONFIRMED_PAYMENT_RECORD");
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

    // 进一步防 race: 排除已被 PAID_OUT 退款冲账的 sourcePaymentRecordIds.
    // 上面的 active-refund guard 只挡 PENDING / APPROVED, 不挡刚 PAID_OUT 的;
    // FOR UPDATE 已锁住 isReversed=false 的行 — 但若另一个 tx 提交后我们 findMany
    // 才发起, 那条 record 已经被排除 (isReversed=true 不在候选集); 极端 case 是
    // 候选 ids 与某条 PAID_OUT refund 的 sourcePaymentRecordIds 部分重合 (例如
    // 该订单有多笔 PaymentRecord, 一半被先前 PAID_OUT 吃掉, 还有一半未冲账). 这里
    // 用 JSON array_contains 直接查命中, 命中即降级到 skip 路径而不是写死单.
    const eligibleIds = eligibleRecords.map((r) => r.id);
    const paidOutOverlap = await tx.refundRequest.findFirst({
      where: {
        tradeOrderId: target.tradeOrderId,
        status: RefundRequestStatus.PAID_OUT,
        OR: eligibleIds.map((id) => ({
          sourcePaymentRecordIds: { array_contains: id },
        })),
      },
      select: { id: true },
    });
    if (paidOutOverlap) {
      return writeSkipAndReturn("RACE_WITH_CONCURRENT_REFUND");
    }

    // 校验申请金额不超过可冲账总额; 超出则封顶按可冲账总额 (兜底)
    const availableTotal = sumDecimal(eligibleRecords.map((r) => r.amount));
    const requestedAmount = greaterThan(settledExpectedRefundAmount, availableTotal)
      ? availableTotal
      : settledExpectedRefundAmount;

    if (!isPositiveAmount(requestedAmount)) {
      throw new Error("可冲账金额为 0, 无法自动建退款单");
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
