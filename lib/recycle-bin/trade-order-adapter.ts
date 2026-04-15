import {
  OperationModule,
  OperationTargetType,
  TradeOrderStatus,
  Prisma,
  type RecycleDomain,
  type RecycleTargetType,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type {
  RecycleGuardBlocker,
  RecyclePurgeBlocker,
  RecyclePurgeGuard,
  RecycleRestoreBlocker,
  RecycleRestoreGuard,
  RecycleTargetSnapshot,
} from "@/lib/recycle-bin/types";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

type TradeOrderRecycleRecord = {
  id: string;
  tradeNo: string;
  customerId: string;
  ownerId: string | null;
  reviewStatus: string;
  tradeStatus: TradeOrderStatus;
  paymentScheme: string;
  finalAmount: Prisma.Decimal;
  receiverNameSnapshot: string;
  receiverPhoneSnapshot: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    owner: {
      id: string;
      name: string;
      username: string;
    } | null;
  };
  salesOrders: Array<{
    id: string;
    shippingTask: {
      id: string;
    } | null;
    _count: {
      paymentPlans: number;
      paymentRecords: number;
      collectionTasks: number;
      logisticsFollowUpTasks: number;
      codCollectionRecords: number;
      exportLines: number;
    };
  }>;
  _count: {
    items: number;
    components: number;
    salesOrders: number;
    shippingTasks: number;
    exportLines: number;
    paymentPlans: number;
    paymentRecords: number;
    collectionTasks: number;
    logisticsFollowUpTasks: number;
    codCollectionRecords: number;
  };
};

type TradeOrderLifecycleCounts = {
  salesOrderCount: number;
  shippingTaskCount: number;
  exportLineCount: number;
  paymentPlanCount: number;
  paymentRecordCount: number;
  collectionTaskCount: number;
  logisticsFollowUpCount: number;
  codCollectionCount: number;
};

async function getTradeOrderRecord(
  db: RecycleDbClient,
  tradeOrderId: string,
): Promise<TradeOrderRecycleRecord | null> {
  return db.tradeOrder.findUnique({
    where: { id: tradeOrderId },
    select: {
      id: true,
      tradeNo: true,
      customerId: true,
      ownerId: true,
      reviewStatus: true,
      tradeStatus: true,
      paymentScheme: true,
      finalAmount: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          owner: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      },
      salesOrders: {
        select: {
          id: true,
          shippingTask: {
            select: {
              id: true,
            },
          },
          _count: {
            select: {
              paymentPlans: true,
              paymentRecords: true,
              collectionTasks: true,
              logisticsFollowUpTasks: true,
              codCollectionRecords: true,
              exportLines: true,
            },
          },
        },
      },
      _count: {
        select: {
          items: true,
          components: true,
          salesOrders: true,
          shippingTasks: true,
          exportLines: true,
          paymentPlans: true,
          paymentRecords: true,
          collectionTasks: true,
          logisticsFollowUpTasks: true,
          codCollectionRecords: true,
        },
      },
    },
  });
}

async function getTradeOrderOwnerLabel(
  db: RecycleDbClient,
  tradeOrder: TradeOrderRecycleRecord,
) {
  const fallbackOwner = tradeOrder.customer.owner
    ? `${tradeOrder.customer.owner.name} (@${tradeOrder.customer.owner.username})`
    : "未分配";

  if (!tradeOrder.ownerId) {
    return fallbackOwner;
  }

  if (tradeOrder.customer.owner?.id === tradeOrder.ownerId) {
    return fallbackOwner;
  }

  const owner = await db.user.findUnique({
    where: { id: tradeOrder.ownerId },
    select: {
      name: true,
      username: true,
    },
  });

  if (!owner) {
    return fallbackOwner;
  }

  return `${owner.name} (@${owner.username})`;
}

function summarizeLifecycleCounts(
  tradeOrder: TradeOrderRecycleRecord,
): TradeOrderLifecycleCounts {
  const descendantCounts = tradeOrder.salesOrders.reduce(
    (summary, salesOrder) => {
      summary.paymentPlanCount += salesOrder._count.paymentPlans;
      summary.paymentRecordCount += salesOrder._count.paymentRecords;
      summary.collectionTaskCount += salesOrder._count.collectionTasks;
      summary.logisticsFollowUpCount += salesOrder._count.logisticsFollowUpTasks;
      summary.codCollectionCount += salesOrder._count.codCollectionRecords;
      summary.exportLineCount += salesOrder._count.exportLines;

      if (salesOrder.shippingTask) {
        summary.shippingTaskCount += 1;
      }

      return summary;
    },
    {
      paymentPlanCount: 0,
      paymentRecordCount: 0,
      collectionTaskCount: 0,
      logisticsFollowUpCount: 0,
      codCollectionCount: 0,
      exportLineCount: 0,
      shippingTaskCount: 0,
    },
  );

  return {
    salesOrderCount: tradeOrder._count.salesOrders,
    shippingTaskCount: Math.max(
      tradeOrder._count.shippingTasks,
      descendantCounts.shippingTaskCount,
    ),
    exportLineCount: Math.max(
      tradeOrder._count.exportLines,
      descendantCounts.exportLineCount,
    ),
    paymentPlanCount: Math.max(
      tradeOrder._count.paymentPlans,
      descendantCounts.paymentPlanCount,
    ),
    paymentRecordCount: Math.max(
      tradeOrder._count.paymentRecords,
      descendantCounts.paymentRecordCount,
    ),
    collectionTaskCount: Math.max(
      tradeOrder._count.collectionTasks,
      descendantCounts.collectionTaskCount,
    ),
    logisticsFollowUpCount: Math.max(
      tradeOrder._count.logisticsFollowUpTasks,
      descendantCounts.logisticsFollowUpCount,
    ),
    codCollectionCount: Math.max(
      tradeOrder._count.codCollectionRecords,
      descendantCounts.codCollectionCount,
    ),
  };
}

function buildMoveGuard(
  tradeOrder: TradeOrderRecycleRecord,
  counts: TradeOrderLifecycleCounts,
) {
  const blockers: RecycleGuardBlocker[] = [];

  if (tradeOrder.tradeStatus === TradeOrderStatus.CANCELED) {
    blockers.push({
      name: "已取消订单",
      count: 1,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: "当前订单已进入取消 / 作废语义，不能再按误建草稿移入回收站。",
    });
  } else if (tradeOrder.tradeStatus !== TradeOrderStatus.DRAFT) {
    blockers.push({
      name: "非草稿订单",
      count: 1,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: "当前订单已离开纯草稿态，只能取消 / 作废，不能移入回收站。",
    });
  }

  if (counts.salesOrderCount > 0) {
    blockers.push({
      name: "已生成供应商子单",
      count: counts.salesOrderCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已生成 ${counts.salesOrderCount} 个供应商子单，不能按误建草稿删除。`,
    });
  }

  if (counts.paymentPlanCount > 0) {
    blockers.push({
      name: "已存在支付计划",
      count: counts.paymentPlanCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已进入支付链，存在 ${counts.paymentPlanCount} 条支付计划。`,
    });
  }

  if (counts.paymentRecordCount > 0) {
    blockers.push({
      name: "已存在支付记录",
      count: counts.paymentRecordCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已进入收款链，存在 ${counts.paymentRecordCount} 条支付记录。`,
    });
  }

  if (counts.collectionTaskCount > 0) {
    blockers.push({
      name: "已存在催收任务",
      count: counts.collectionTaskCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已进入催收链，存在 ${counts.collectionTaskCount} 条催收任务。`,
    });
  }

  if (counts.shippingTaskCount > 0) {
    blockers.push({
      name: "已存在发货任务",
      count: counts.shippingTaskCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已进入履约链，存在 ${counts.shippingTaskCount} 条发货任务。`,
    });
  }

  if (counts.exportLineCount > 0) {
    blockers.push({
      name: "已存在导出批次行",
      count: counts.exportLineCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已进入导出审计链，存在 ${counts.exportLineCount} 条导出批次行。`,
    });
  }

  if (counts.logisticsFollowUpCount > 0) {
    blockers.push({
      name: "已存在物流跟进",
      count: counts.logisticsFollowUpCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已进入物流跟进链，存在 ${counts.logisticsFollowUpCount} 条记录。`,
    });
  }

  if (counts.codCollectionCount > 0) {
    blockers.push({
      name: "已存在 COD 回款记录",
      count: counts.codCollectionCount,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `当前订单已进入 COD 回款链，存在 ${counts.codCollectionCount} 条记录。`,
    });
  }

  return {
    canMoveToRecycleBin: blockers.length === 0,
    fallbackActionLabel: "改为取消 / 作废订单",
    blockerSummary:
      blockers.length === 0
        ? "当前订单仍是纯草稿且没有任何下游链路，可移入回收站。"
        : (blockers[0]?.description ?? "当前订单不能移入回收站。"),
    blockers,
    futureRestoreBlockers: [],
  } satisfies RecycleTargetSnapshot["guard"];
}

function buildRestoreGuard(
  restoreRouteSnapshot: string,
  blockers: RecycleRestoreBlocker[],
): RecycleRestoreGuard {
  return {
    canRestore: blockers.length === 0,
    blockerSummary:
      blockers.length === 0
        ? "可以恢复到交易订单视图。"
        : (blockers[0]?.description ?? "当前订单暂时不能恢复。"),
    blockers,
    restoreRouteSnapshot,
  };
}

function buildPurgeGuard(blockers: RecyclePurgeBlocker[]): RecyclePurgeGuard {
  return {
    canPurge: blockers.length === 0,
    blockerSummary:
      blockers.length === 0
        ? "当前订单可从回收站中永久删除。"
        : (blockers[0]?.description ?? "当前订单暂时不能永久删除。"),
    blockers,
  };
}

function buildLifecycleBlockers(
  tradeOrder: TradeOrderRecycleRecord,
  counts: TradeOrderLifecycleCounts,
) {
  const blockers: RecycleRestoreBlocker[] = [];

  if (tradeOrder.tradeStatus === TradeOrderStatus.CANCELED) {
    blockers.push({
      name: "已取消订单",
      description: "当前订单已进入取消 / 作废语义，不再回到误建删除语义。",
    });
  } else if (tradeOrder.tradeStatus !== TradeOrderStatus.DRAFT) {
    blockers.push({
      name: "订单已离开草稿态",
      description: "当前订单已离开纯草稿态，不能再按误建草稿恢复或删除。",
    });
  }

  if (counts.salesOrderCount > 0) {
    blockers.push({
      name: "已生成供应商子单",
      description: `当前订单已生成 ${counts.salesOrderCount} 个供应商子单，不能再恢复或永久删除。`,
    });
  }

  if (counts.paymentPlanCount > 0) {
    blockers.push({
      name: "已存在支付计划",
      description: `当前订单已存在 ${counts.paymentPlanCount} 条支付计划，说明已经进入支付链。`,
    });
  }

  if (counts.paymentRecordCount > 0) {
    blockers.push({
      name: "已存在支付记录",
      description: `当前订单已存在 ${counts.paymentRecordCount} 条支付记录，说明已经进入收款链。`,
    });
  }

  if (counts.collectionTaskCount > 0) {
    blockers.push({
      name: "已存在催收任务",
      description: `当前订单已存在 ${counts.collectionTaskCount} 条催收任务，说明已经进入催收链。`,
    });
  }

  if (counts.shippingTaskCount > 0) {
    blockers.push({
      name: "已存在发货任务",
      description: `当前订单已存在 ${counts.shippingTaskCount} 条发货任务，说明已经进入履约链。`,
    });
  }

  if (counts.exportLineCount > 0) {
    blockers.push({
      name: "已存在导出批次行",
      description: `当前订单已存在 ${counts.exportLineCount} 条导出批次行，说明已经进入导出审计链。`,
    });
  }

  if (counts.logisticsFollowUpCount > 0) {
    blockers.push({
      name: "已存在物流跟进",
      description: `当前订单已存在 ${counts.logisticsFollowUpCount} 条物流跟进记录。`,
    });
  }

  if (counts.codCollectionCount > 0) {
    blockers.push({
      name: "已存在 COD 回款记录",
      description: `当前订单已存在 ${counts.codCollectionCount} 条 COD 回款记录。`,
    });
  }

  return blockers;
}

export async function getTradeOrderRecycleTarget(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
): Promise<RecycleTargetSnapshot | null> {
  if (targetType !== "TRADE_ORDER") {
    return null;
  }

  const tradeOrder = await getTradeOrderRecord(db, targetId);

  if (!tradeOrder) {
    return null;
  }

  const counts = summarizeLifecycleCounts(tradeOrder);
  const guard = buildMoveGuard(tradeOrder, counts);
  const ownerLabel = await getTradeOrderOwnerLabel(db, tradeOrder);

  return {
    targetType: "TRADE_ORDER",
    targetId: tradeOrder.id,
    domain: "TRADE_ORDER",
    titleSnapshot: tradeOrder.tradeNo,
    secondarySnapshot: `${tradeOrder.customer.name} / ${tradeOrder.receiverNameSnapshot} / ${tradeOrder.receiverPhoneSnapshot}`,
    originalStatusSnapshot: tradeOrder.tradeStatus,
    restoreRouteSnapshot: `/orders/${tradeOrder.id}`,
    operationModule: OperationModule.SALES_ORDER,
    operationTargetType: OperationTargetType.TRADE_ORDER,
    operationAction: "trade_order.moved_to_recycle_bin",
    operationDescription: `Moved trade order to recycle bin: ${tradeOrder.tradeNo}`,
    guard,
    blockerSnapshotJson: {
      customerId: tradeOrder.customer.id,
      customerName: tradeOrder.customer.name,
      customerPhone: tradeOrder.customer.phone,
      ownerId: tradeOrder.ownerId ?? tradeOrder.customer.owner?.id ?? null,
      ownerName: ownerLabel,
      receiverName: tradeOrder.receiverNameSnapshot,
      receiverPhone: tradeOrder.receiverPhoneSnapshot,
      tradeStatus: tradeOrder.tradeStatus,
      reviewStatus: tradeOrder.reviewStatus,
      paymentScheme: tradeOrder.paymentScheme,
      finalAmount: tradeOrder.finalAmount.toString(),
      itemCount: tradeOrder._count.items,
      componentCount: tradeOrder._count.components,
      salesOrderCount: counts.salesOrderCount,
      paymentPlanCount: counts.paymentPlanCount,
      paymentRecordCount: counts.paymentRecordCount,
      collectionTaskCount: counts.collectionTaskCount,
      shippingTaskCount: counts.shippingTaskCount,
      exportLineCount: counts.exportLineCount,
      logisticsFollowUpCount: counts.logisticsFollowUpCount,
      codCollectionCount: counts.codCollectionCount,
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
      fallbackActionLabel: guard.fallbackActionLabel,
    },
  };
}

export async function buildTradeOrderRestoreGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    restoreRouteSnapshot: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "TRADE_ORDER" || input.targetType !== "TRADE_ORDER") {
    return null;
  }

  const tradeOrder = await getTradeOrderRecord(db, input.targetId);

  if (!tradeOrder) {
    return buildRestoreGuard(input.restoreRouteSnapshot, [
      {
        name: "对象缺失",
        description: "原始成交主单已不存在，当前不能恢复。",
      },
    ]);
  }

  return buildRestoreGuard(
    input.restoreRouteSnapshot,
    buildLifecycleBlockers(tradeOrder, summarizeLifecycleCounts(tradeOrder)),
  );
}

export async function buildTradeOrderPurgeGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "TRADE_ORDER" || input.targetType !== "TRADE_ORDER") {
    return null;
  }

  const tradeOrder = await getTradeOrderRecord(db, input.targetId);

  if (!tradeOrder) {
    return buildPurgeGuard([
      {
        name: "对象缺失",
        description: "原始成交主单已不存在，当前不能执行永久删除。",
      },
    ]);
  }

  return buildPurgeGuard(
    buildLifecycleBlockers(tradeOrder, summarizeLifecycleCounts(tradeOrder)),
  );
}

export async function purgeTradeOrderTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
  },
) {
  if (input.targetType !== "TRADE_ORDER") {
    return false;
  }

  await db.tradeOrderItemComponent.deleteMany({
    where: { tradeOrderId: input.targetId },
  });

  await db.tradeOrderItem.deleteMany({
    where: { tradeOrderId: input.targetId },
  });

  await db.tradeOrder.delete({
    where: { id: input.targetId },
  });

  return true;
}
