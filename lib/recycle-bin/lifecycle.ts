import { Prisma, RecycleEntryStatus, type RecycleTargetType } from "@prisma/client";
import {
  canAccessLeadModule,
  canAccessCustomerModule,
  canManageLiveSessions,
  canManageProducts,
  canManageSuppliers,
  canAccessSalesOrderModule,
} from "@/lib/auth/access";
import { assertActorCanAccessCustomerRecycleTarget } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import {
  archiveCustomerTarget,
  buildCustomerFinalizePreview,
  buildCustomerPurgeGuard,
  buildCustomerRestoreGuard,
  getCustomerRecycleTarget,
  purgeCustomerTarget,
} from "@/lib/recycle-bin/customer-adapter";
import {
  buildLeadPurgeGuard,
  buildLeadRestoreGuard,
  getLeadRecycleTarget,
  purgeLeadTarget,
} from "@/lib/recycle-bin/lead-adapter";
import {
  buildLiveSessionPurgeGuard,
  buildLiveSessionRestoreGuard,
  getLiveSessionRecycleTarget,
  purgeLiveSessionTarget,
} from "@/lib/recycle-bin/live-session-adapter";
import {
  archiveMasterDataTarget,
  buildMasterDataFinalizePreview,
  buildMasterDataPurgeGuard,
  buildMasterDataRestoreGuard,
  getMasterDataRecycleTarget,
  listProductCascadeSkuSnapshot,
  purgeMasterDataTarget,
} from "@/lib/recycle-bin/master-data-adapter";
import {
  archiveTradeOrderTarget,
  buildTradeOrderFinalizePreview,
  buildTradeOrderPurgeGuard,
  buildTradeOrderRestoreGuard,
  getTradeOrderRecycleTarget,
  purgeTradeOrderTarget,
} from "@/lib/recycle-bin/trade-order-adapter";
import {
  createActiveRecycleEntry,
  findRecycleEntryById,
  findActiveRecycleEntry,
  isRecycleEntryUniqueConflict,
  resolveRecycleEntryAsArchived,
  resolveRecycleEntryAsPurged,
  resolveRecycleEntryAsRestored,
} from "@/lib/recycle-bin/repository";
import {
  type FinalizeRecycleBinInput,
  type FinalizeRecycleBinResult,
  RECYCLE_REASON_CODE_MAP,
  type MoveToRecycleBinInput,
  type MoveToRecycleBinResult,
  type PreviewRecycleBinFinalizeInput,
  type PreviewRecycleBinFinalizeResult,
  type PurgeFromRecycleBinInput,
  type PurgeFromRecycleBinResult,
  type RecycleFinalizePreview,
  type RecyclePurgeGuard,
  type RecycleReasonInputCode,
  type RecycleRestoreGuard,
  type RecycleLifecycleActor,
  type RestoreFromRecycleBinInput,
  type RestoreFromRecycleBinResult,
  type RecycleTargetSnapshot,
} from "@/lib/recycle-bin/types";

export const RECYCLE_RETENTION_DAYS = 3;

type RecycleTx = Prisma.TransactionClient;

function ensureMoveToRecycleBinPermission(
  actor: RecycleLifecycleActor,
  targetType: RecycleTargetType,
) {
  if (targetType === "PRODUCT" || targetType === "PRODUCT_SKU") {
    if (!canManageProducts(actor.role, actor.permissionCodes)) {
      throw new Error("You do not have permission to manage product recycle-bin actions.");
    }

    return;
  }

  if (targetType === "SUPPLIER") {
    if (!canManageSuppliers(actor.role, actor.permissionCodes)) {
      throw new Error("You do not have permission to manage supplier recycle-bin actions.");
    }

    return;
  }

  if (targetType === "LIVE_SESSION") {
    if (!canManageLiveSessions(actor.role, actor.permissionCodes)) {
      throw new Error("You do not have permission to manage live-session recycle-bin actions.");
    }

    return;
  }

  if (targetType === "LEAD") {
    if (!canAccessLeadModule(actor.role)) {
      throw new Error("You do not have permission to manage lead recycle-bin actions.");
    }

    return;
  }

  if (targetType === "TRADE_ORDER") {
    if (!canAccessSalesOrderModule(actor.role)) {
      throw new Error("You do not have permission to manage trade-order recycle-bin actions.");
    }

    return;
  }

  if (targetType === "CUSTOMER") {
    if (!canAccessCustomerModule(actor.role)) {
      throw new Error("You do not have permission to manage customer recycle-bin actions.");
    }

    return;
  }

  throw new Error("Unsupported recycle-bin target type.");
}

function ensureRestorePermission(
  actor: RecycleLifecycleActor,
  targetType: RecycleTargetType,
) {
  ensureMoveToRecycleBinPermission(actor, targetType);
}

function ensurePurgePermission(actor: RecycleLifecycleActor) {
  if (actor.role !== "ADMIN") {
    throw new Error("Only ADMIN can permanently delete recycle-bin targets.");
  }
}

function ensureFinalizePermission(actor: RecycleLifecycleActor) {
  if (actor.role !== "ADMIN") {
    throw new Error("Only ADMIN can finalize recycle-bin targets.");
  }
}

function isRecycleEntryExpired(entry: { recycleExpiresAt: Date }, now = new Date()) {
  return entry.recycleExpiresAt.getTime() <= now.getTime();
}

async function ensureActorCanAccessRecycleEntry(
  tx: RecycleTx,
  actor: RecycleLifecycleActor,
  entry: {
    targetType: RecycleTargetType;
    targetId: string;
    blockerSnapshotJson: unknown;
  },
) {
  if (entry.targetType === "CUSTOMER") {
    await assertActorCanAccessCustomerRecycleTarget(tx, actor, {
      customerId: entry.targetId,
      snapshotJson: entry.blockerSnapshotJson,
    });
  }

  ensureMoveToRecycleBinPermission(actor, entry.targetType);
}

function buildExpiredRestoreGuard(restoreRouteSnapshot: string): RecycleRestoreGuard {
  return {
    canRestore: false,
    blockerSummary: "3 天冷静期已结束，当前条目只能进入最终处理，不能再恢复。",
    blockers: [
      {
        code: "recycle_restore_window_closed",
        name: "恢复窗口已关闭",
        description: "3 天冷静期已结束，当前条目只能进入最终处理，不能再恢复。",
        group: "object_state",
        suggestedAction: "改走最终处理，不再从回收站恢复到主工作台。",
      },
    ],
    restoreRouteSnapshot,
  };
}

function buildFinalizePreviewFromPurgeGuard(
  guard: RecyclePurgeGuard,
): RecycleFinalizePreview {
  return {
    canFinalize: guard.canPurge,
    targetExists: true,
    finalAction: "PURGE",
    finalActionLabel: "可 purge",
    blockerSummary: guard.blockerSummary,
    blockers: guard.blockers,
    canEarlyPurge: guard.canPurge,
    earlyPurgeRequiresAdmin: true,
  };
}

function buildPurgeGuardFromFinalizePreview(
  preview: RecycleFinalizePreview,
): RecyclePurgeGuard {
  if (preview.canEarlyPurge) {
    return {
      canPurge: true,
      blockerSummary: preview.blockerSummary,
      blockers: [],
    };
  }

  return {
    canPurge: false,
    blockerSummary:
      preview.finalAction === "ARCHIVE"
        ? "当前对象 3 天后仅封存，不支持提前永久删除。"
        : preview.blockerSummary,
    blockers: preview.blockers,
  };
}

async function loadRecycleTarget(
  tx: RecycleTx,
  targetType: RecycleTargetType,
  targetId: string,
) {
  const masterDataTarget = await getMasterDataRecycleTarget(tx, targetType, targetId);

  if (masterDataTarget) {
    return masterDataTarget;
  }

  const liveSessionTarget = await getLiveSessionRecycleTarget(tx, targetType, targetId);

  if (liveSessionTarget) {
    return liveSessionTarget;
  }

  const tradeOrderTarget = await getTradeOrderRecycleTarget(tx, targetType, targetId);

  if (tradeOrderTarget) {
    return tradeOrderTarget;
  }

  const customerTarget = await getCustomerRecycleTarget(tx, targetType, targetId);

  if (customerTarget) {
    return customerTarget;
  }

  return getLeadRecycleTarget(tx, targetType, targetId);
}

async function loadCascadeRecycleTargets(
  tx: RecycleTx,
  target: RecycleTargetSnapshot,
) {
  if (target.targetType !== "PRODUCT") {
    return [] as RecycleTargetSnapshot[];
  }

  const cascadeSkuSnapshot = await listProductCascadeSkuSnapshot(tx, target.targetId);
  const cascadeTargets = await Promise.all(
    cascadeSkuSnapshot.map((sku) => loadRecycleTarget(tx, "PRODUCT_SKU", sku.id)),
  );

  return cascadeTargets.filter(
    (cascadeTarget): cascadeTarget is RecycleTargetSnapshot => Boolean(cascadeTarget),
  );
}

function buildRecycleEntryAfterData(input: {
  entryId: string;
  recycleExpiresAt: Date;
  reasonCode: RecycleReasonInputCode;
  reasonText: string | null;
  extra?: Record<string, unknown>;
}) {
  return {
    recycleEntryId: input.entryId,
    recycleStatus: RecycleEntryStatus.ACTIVE,
    recycleExpiresAt: input.recycleExpiresAt,
    deleteReasonCode: input.reasonCode,
    deleteReasonText: input.reasonText,
    ...(input.extra ?? {}),
  };
}

async function createRecycleEntryWithAudit(
  tx: RecycleTx,
  input: {
    actor: RecycleLifecycleActor;
    target: RecycleTargetSnapshot;
    reasonCode: RecycleReasonInputCode;
    reasonText: string | null;
    recycleExpiresAt: Date;
    extraAfterData?: Record<string, unknown>;
  },
) {
  const entry = await createActiveRecycleEntry(tx, {
    targetType: input.target.targetType,
    targetId: input.target.targetId,
    domain: input.target.domain,
    titleSnapshot: input.target.titleSnapshot,
    secondarySnapshot: input.target.secondarySnapshot,
    originalStatusSnapshot: input.target.originalStatusSnapshot,
    restoreRouteSnapshot: input.target.restoreRouteSnapshot,
    deleteReasonCode: RECYCLE_REASON_CODE_MAP[input.reasonCode],
    deleteReasonText: input.reasonText,
    deletedById: input.actor.id,
    recycleExpiresAt: input.recycleExpiresAt,
    blockerSnapshotJson: input.target.blockerSnapshotJson,
  });

  await tx.operationLog.create({
    data: {
      actorId: input.actor.id,
      module: input.target.operationModule,
      action: input.target.operationAction,
      targetType: input.target.operationTargetType,
      targetId: input.target.targetId,
      description: input.target.operationDescription,
      afterData: buildRecycleEntryAfterData({
        entryId: entry.id,
        recycleExpiresAt: input.recycleExpiresAt,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText,
        extra: input.extraAfterData,
      }),
    },
  });

  return entry;
}

async function buildRestoreGuard(
  tx: RecycleTx,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: "PRODUCT_MASTER_DATA" | "LIVE_SESSION" | "LEAD" | "TRADE_ORDER" | "CUSTOMER";
    restoreRouteSnapshot: string;
  },
): Promise<RecycleRestoreGuard> {
  const masterDataGuard = await buildMasterDataRestoreGuard(tx, input);

  if (masterDataGuard) {
    return masterDataGuard;
  }

  const liveSessionGuard = await buildLiveSessionRestoreGuard(tx, input);

  if (liveSessionGuard) {
    return liveSessionGuard;
  }

  const tradeOrderGuard = await buildTradeOrderRestoreGuard(tx, input);

  if (tradeOrderGuard) {
    return tradeOrderGuard;
  }

  const customerGuard = await buildCustomerRestoreGuard(tx, input);

  if (customerGuard) {
    return customerGuard;
  }

  const leadGuard = await buildLeadRestoreGuard(tx, input);

  if (leadGuard) {
    return leadGuard;
  }

  return {
    canRestore: false,
    blockerSummary: "当前对象类型暂不支持恢复。",
    blockers: [
      {
        name: "暂不支持",
        description: "当前对象类型暂不支持恢复。",
      },
    ],
    restoreRouteSnapshot: input.restoreRouteSnapshot,
  };
}

async function buildPurgeGuard(
  tx: RecycleTx,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: "PRODUCT_MASTER_DATA" | "LIVE_SESSION" | "LEAD" | "TRADE_ORDER" | "CUSTOMER";
  },
): Promise<RecyclePurgeGuard> {
  const masterDataGuard = await buildMasterDataPurgeGuard(tx, input);

  if (masterDataGuard) {
    return masterDataGuard;
  }

  const liveSessionGuard = await buildLiveSessionPurgeGuard(tx, input);

  if (liveSessionGuard) {
    return liveSessionGuard;
  }

  const tradeOrderGuard = await buildTradeOrderPurgeGuard(tx, input);

  if (tradeOrderGuard) {
    return tradeOrderGuard;
  }

  const customerGuard = await buildCustomerPurgeGuard(tx, input);

  if (customerGuard) {
    return customerGuard;
  }

  const leadGuard = await buildLeadPurgeGuard(tx, input);

  if (leadGuard) {
    return leadGuard;
  }

  return {
    canPurge: false,
    blockerSummary: "当前对象类型暂不支持永久删除。",
    blockers: [
      {
        name: "暂不支持",
        description: "当前对象类型暂不支持永久删除。",
      },
    ],
  };
}

async function buildFinalizePreview(
  tx: RecycleTx,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: "PRODUCT_MASTER_DATA" | "LIVE_SESSION" | "LEAD" | "TRADE_ORDER" | "CUSTOMER";
  },
): Promise<RecycleFinalizePreview> {
  const masterDataPreview = await buildMasterDataFinalizePreview(tx, input);

  if (masterDataPreview) {
    return masterDataPreview;
  }

  const customerPreview = await buildCustomerFinalizePreview(tx, input);

  if (customerPreview) {
    return customerPreview;
  }

  const tradeOrderPreview = await buildTradeOrderFinalizePreview(tx, input);

  if (tradeOrderPreview) {
    return tradeOrderPreview;
  }

  const purgeGuard = await buildPurgeGuard(tx, input);
  return buildFinalizePreviewFromPurgeGuard(purgeGuard);
}

async function purgeRecycleTarget(
  tx: RecycleTx,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
  },
) {
  const purgedMasterData = await purgeMasterDataTarget(tx, input);

  if (purgedMasterData) {
    return;
  }

  const purgedLiveSession = await purgeLiveSessionTarget(tx, input);

  if (purgedLiveSession) {
    return;
  }

  const purgedLead = await purgeLeadTarget(tx, input);

  if (purgedLead) {
    return;
  }

  const purgedTradeOrder = await purgeTradeOrderTarget(tx, input);

  if (purgedTradeOrder) {
    return;
  }

  const purgedCustomer = await purgeCustomerTarget(tx, input);

  if (purgedCustomer) {
    return;
  }

  throw new Error("Unsupported recycle-bin purge target type.");
}

async function archiveRecycleTarget(
  tx: RecycleTx,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    preview: RecycleFinalizePreview;
  },
) {
  const archivedMasterData = await archiveMasterDataTarget(tx, input);

  if (archivedMasterData) {
    return archivedMasterData;
  }

  const archivedTradeOrder = await archiveTradeOrderTarget(tx, input);

  if (archivedTradeOrder) {
    return archivedTradeOrder;
  }

  const archivedCustomer = await archiveCustomerTarget(tx, input);

  if (archivedCustomer) {
    return archivedCustomer;
  }

  throw new Error("Unsupported recycle-bin archive target type.");
}

function buildAlreadyInRecycleBinResult(
  entryId: string,
  target: RecycleTargetSnapshot,
): MoveToRecycleBinResult {
  return {
    status: "already_in_recycle_bin",
    message: "The target is already in the recycle bin.",
    entryId,
    guard: target.guard,
  };
}

function buildBlockedResult(target: RecycleTargetSnapshot): MoveToRecycleBinResult {
  return {
    status: "blocked",
    message: target.guard.blockerSummary,
    guard: target.guard,
  };
}

function getRestoreOperationMeta(input: {
  targetType: RecycleTargetType;
  titleSnapshot: string;
}) {
  if (input.targetType === "PRODUCT") {
    return {
      module: "PRODUCT" as const,
      targetType: "PRODUCT" as const,
      action: "product.restored_from_recycle_bin",
      description: `Restored product from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "PRODUCT_SKU") {
    return {
      module: "PRODUCT" as const,
      targetType: "PRODUCT_SKU" as const,
      action: "product_sku.restored_from_recycle_bin",
      description: `Restored product SKU from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "SUPPLIER") {
    return {
      module: "SUPPLIER" as const,
      targetType: "SUPPLIER" as const,
      action: "supplier.restored_from_recycle_bin",
      description: `Restored supplier from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "LIVE_SESSION") {
    return {
      module: "LIVE_SESSION" as const,
      targetType: "LIVE_SESSION" as const,
      action: "live_session.restored_from_recycle_bin",
      description: `Restored live session from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "LEAD") {
    return {
      module: "LEAD" as const,
      targetType: "LEAD" as const,
      action: "lead.restored_from_recycle_bin",
      description: `Restored lead from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "TRADE_ORDER") {
    return {
      module: "SALES_ORDER" as const,
      targetType: "TRADE_ORDER" as const,
      action: "trade_order.restored_from_recycle_bin",
      description: `Restored trade order from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "CUSTOMER") {
    return {
      module: "CUSTOMER" as const,
      targetType: "CUSTOMER" as const,
      action: "customer.restored_from_recycle_bin",
      description: `Restored customer from recycle bin: ${input.titleSnapshot}`,
    };
  }

  throw new Error("Unsupported recycle-bin restore target type.");
}

function getPurgeOperationMeta(input: {
  targetType: RecycleTargetType;
  titleSnapshot: string;
}) {
  if (input.targetType === "PRODUCT") {
    return {
      module: "PRODUCT" as const,
      targetType: "PRODUCT" as const,
      action: "product.purged_from_recycle_bin",
      description: `Permanently deleted product from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "PRODUCT_SKU") {
    return {
      module: "PRODUCT" as const,
      targetType: "PRODUCT_SKU" as const,
      action: "product_sku.purged_from_recycle_bin",
      description: `Permanently deleted product SKU from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "SUPPLIER") {
    return {
      module: "SUPPLIER" as const,
      targetType: "SUPPLIER" as const,
      action: "supplier.purged_from_recycle_bin",
      description: `Permanently deleted supplier from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "LIVE_SESSION") {
    return {
      module: "LIVE_SESSION" as const,
      targetType: "LIVE_SESSION" as const,
      action: "live_session.purged_from_recycle_bin",
      description: `Permanently deleted live session from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "LEAD") {
    return {
      module: "LEAD" as const,
      targetType: "LEAD" as const,
      action: "lead.purged_from_recycle_bin",
      description: `Permanently deleted lead from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "TRADE_ORDER") {
    return {
      module: "SALES_ORDER" as const,
      targetType: "TRADE_ORDER" as const,
      action: "trade_order.purged_from_recycle_bin",
      description: `Permanently deleted trade order from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "CUSTOMER") {
    return {
      module: "CUSTOMER" as const,
      targetType: "CUSTOMER" as const,
      action: "customer.purged_from_recycle_bin",
      description: `Permanently deleted customer from recycle bin: ${input.titleSnapshot}`,
    };
  }

  throw new Error("Unsupported recycle-bin purge target type.");
}

function getArchiveOperationMeta(input: {
  targetType: RecycleTargetType;
  titleSnapshot: string;
}) {
  if (input.targetType === "PRODUCT") {
    return {
      module: "PRODUCT" as const,
      targetType: "PRODUCT" as const,
      action: "product.archived_from_recycle_bin",
      description: `Archived product from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "PRODUCT_SKU") {
    return {
      module: "PRODUCT" as const,
      targetType: "PRODUCT_SKU" as const,
      action: "product_sku.archived_from_recycle_bin",
      description: `Archived product SKU from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "TRADE_ORDER") {
    return {
      module: "SALES_ORDER" as const,
      targetType: "TRADE_ORDER" as const,
      action: "trade_order.archived_from_recycle_bin",
      description: `Archived trade order from recycle bin: ${input.titleSnapshot}`,
    };
  }

  if (input.targetType === "CUSTOMER") {
    return {
      module: "CUSTOMER" as const,
      targetType: "CUSTOMER" as const,
      action: "customer.archived_from_recycle_bin",
      description: `Archived customer from recycle bin: ${input.titleSnapshot}`,
    };
  }

  throw new Error("Unsupported recycle-bin archive target type.");
}

export async function previewRecycleBinFinalize(
  actor: RecycleLifecycleActor,
  input: PreviewRecycleBinFinalizeInput,
): Promise<PreviewRecycleBinFinalizeResult> {
  return prisma.$transaction(async (tx) => {
    const entry = await findRecycleEntryById(tx, input.entryId);

    if (!entry) {
      throw new Error("The recycle-bin entry does not exist.");
    }

    if (entry.status !== RecycleEntryStatus.ACTIVE) {
      throw new Error("Only active recycle-bin entries can preview finalization.");
    }

    await ensureActorCanAccessRecycleEntry(tx, actor, entry);

    return {
      entryId: entry.id,
      targetType: entry.targetType,
      targetId: entry.targetId,
      isExpired: isRecycleEntryExpired(entry),
      expiresAt: entry.recycleExpiresAt.toISOString(),
      preview: await buildFinalizePreview(tx, {
        targetType: entry.targetType,
        targetId: entry.targetId,
        domain: entry.domain,
      }),
    };
  });
}

export async function moveToRecycleBin(
  actor: RecycleLifecycleActor,
  input: MoveToRecycleBinInput,
): Promise<MoveToRecycleBinResult> {
  if (input.targetType !== "CUSTOMER") {
    ensureMoveToRecycleBinPermission(actor, input.targetType);
  }

  return prisma.$transaction(async (tx) => {
    if (input.targetType === "CUSTOMER") {
      await assertActorCanAccessCustomerRecycleTarget(tx, actor, {
        customerId: input.targetId,
      });
      ensureMoveToRecycleBinPermission(actor, input.targetType);
    }

    const existingEntry = await findActiveRecycleEntry(tx, input.targetType, input.targetId);
    const target = await loadRecycleTarget(tx, input.targetType, input.targetId);

    if (!target) {
      throw new Error("The target does not exist or is no longer accessible.");
    }

    if (existingEntry) {
      return buildAlreadyInRecycleBinResult(existingEntry.id, target);
    }

    if (!target.guard.canMoveToRecycleBin) {
      return buildBlockedResult(target);
    }

    const recycleExpiresAt = new Date();
    recycleExpiresAt.setDate(recycleExpiresAt.getDate() + RECYCLE_RETENTION_DAYS);
    const reasonText = input.reasonText?.trim() || null;

    try {
      const entry = await createRecycleEntryWithAudit(tx, {
        actor,
        target,
        reasonCode: input.reasonCode,
        reasonText,
        recycleExpiresAt,
      });

      const cascadeTargets = await loadCascadeRecycleTargets(tx, target);

      for (const cascadeTarget of cascadeTargets) {
        if (!cascadeTarget.guard.canMoveToRecycleBin) {
          continue;
        }

        try {
          await createRecycleEntryWithAudit(tx, {
            actor,
            target: cascadeTarget,
            reasonCode: input.reasonCode,
            reasonText,
            recycleExpiresAt,
            extraAfterData: {
              cascadeSourceTargetType: target.targetType,
              cascadeSourceTargetId: target.targetId,
            },
          });
        } catch (error) {
          if (!isRecycleEntryUniqueConflict(error)) {
            throw error;
          }
        }
      }

      return {
        status: "created",
        message: "The target was moved to the recycle bin.",
        entryId: entry.id,
        guard: target.guard,
      };
    } catch (error) {
      if (!isRecycleEntryUniqueConflict(error)) {
        throw error;
      }

      const concurrentEntry = await findActiveRecycleEntry(
        tx,
        input.targetType,
        input.targetId,
      );

      if (!concurrentEntry) {
        throw error;
      }

      return buildAlreadyInRecycleBinResult(concurrentEntry.id, target);
    }
  });
}

export async function restoreFromRecycleBin(
  actor: RecycleLifecycleActor,
  input: RestoreFromRecycleBinInput,
): Promise<RestoreFromRecycleBinResult> {
  return prisma.$transaction(async (tx) => {
    const entry = await findRecycleEntryById(tx, input.entryId);

    if (!entry) {
      throw new Error("The recycle-bin entry does not exist.");
    }

    if (entry.status !== RecycleEntryStatus.ACTIVE) {
      throw new Error("Only active recycle-bin entries can be restored.");
    }

    await ensureActorCanAccessRecycleEntry(tx, actor, entry);
    ensureRestorePermission(actor, entry.targetType);

    if (isRecycleEntryExpired(entry)) {
      const guard = buildExpiredRestoreGuard(entry.restoreRouteSnapshot);

      return {
        status: "blocked",
        message: guard.blockerSummary,
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        restoreRouteSnapshot: entry.restoreRouteSnapshot,
        guard,
      };
    }

    const guard = await buildRestoreGuard(tx, {
      targetType: entry.targetType,
      targetId: entry.targetId,
      domain: entry.domain,
      restoreRouteSnapshot: entry.restoreRouteSnapshot,
    });

    if (!guard.canRestore) {
      return {
        status: "blocked",
        message: guard.blockerSummary,
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        restoreRouteSnapshot: entry.restoreRouteSnapshot,
        guard,
      };
    }

    await resolveRecycleEntryAsRestored(tx, {
      entryId: entry.id,
      resolvedById: actor.id,
    });

    const operationMeta = getRestoreOperationMeta({
      targetType: entry.targetType,
      titleSnapshot: entry.titleSnapshot,
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: operationMeta.module,
        action: operationMeta.action,
        targetType: operationMeta.targetType,
        targetId: entry.targetId,
        description: operationMeta.description,
        afterData: {
          recycleEntryId: entry.id,
          recycleStatus: RecycleEntryStatus.RESTORED,
          restoreRouteSnapshot: entry.restoreRouteSnapshot,
        },
      },
    });

    return {
      status: "restored",
      message: "The target was restored from the recycle bin.",
      entryId: entry.id,
      targetType: entry.targetType,
      targetId: entry.targetId,
      restoreRouteSnapshot: entry.restoreRouteSnapshot,
      guard,
    };
  });
}

export async function purgeFromRecycleBin(
  actor: RecycleLifecycleActor,
  input: PurgeFromRecycleBinInput,
): Promise<PurgeFromRecycleBinResult> {
  return prisma.$transaction(async (tx) => {
    const entry = await findRecycleEntryById(tx, input.entryId);

    if (!entry) {
      throw new Error("The recycle-bin entry does not exist.");
    }

    if (entry.status !== RecycleEntryStatus.ACTIVE) {
      throw new Error("Only active recycle-bin entries can be permanently deleted.");
    }

    ensurePurgePermission(actor);
    await ensureActorCanAccessRecycleEntry(tx, actor, entry);

    const preview = await buildFinalizePreview(tx, {
      targetType: entry.targetType,
      targetId: entry.targetId,
      domain: entry.domain,
    });
    const guard = buildPurgeGuardFromFinalizePreview(preview);

    if (!guard.canPurge) {
      return {
        status: "blocked",
        message: guard.blockerSummary,
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        guard,
      };
    }

    if (preview.targetExists) {
      await purgeRecycleTarget(tx, {
        targetType: entry.targetType,
        targetId: entry.targetId,
      });
    }

    await resolveRecycleEntryAsPurged(tx, {
      entryId: entry.id,
      resolvedById: actor.id,
    });

    const operationMeta = getPurgeOperationMeta({
      targetType: entry.targetType,
      titleSnapshot: entry.titleSnapshot,
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: operationMeta.module,
        action: operationMeta.action,
        targetType: operationMeta.targetType,
        targetId: entry.targetId,
        description: operationMeta.description,
        afterData: {
          recycleEntryId: entry.id,
          recycleStatus: RecycleEntryStatus.PURGED,
        },
      },
    });

    return {
      status: "purged",
      message: "The target was permanently deleted from the recycle bin.",
      entryId: entry.id,
      targetType: entry.targetType,
      targetId: entry.targetId,
      guard,
    };
  });
}

export async function finalizeRecycleBinEntry(
  actor: RecycleLifecycleActor,
  input: FinalizeRecycleBinInput,
): Promise<FinalizeRecycleBinResult> {
  return prisma.$transaction(async (tx) => {
    const entry = await findRecycleEntryById(tx, input.entryId);

    if (!entry) {
      throw new Error("The recycle-bin entry does not exist.");
    }

    if (entry.status !== RecycleEntryStatus.ACTIVE) {
      throw new Error("Only active recycle-bin entries can be finalized.");
    }

    ensureFinalizePermission(actor);
    await ensureActorCanAccessRecycleEntry(tx, actor, entry);

    const preview = await buildFinalizePreview(tx, {
      targetType: entry.targetType,
      targetId: entry.targetId,
      domain: entry.domain,
    });

    if (!isRecycleEntryExpired(entry)) {
      return {
        status: "blocked",
        message: "3 天冷静期未结束，当前条目还不能执行最终处理。",
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        preview,
      };
    }

    if (!preview.canFinalize) {
      return {
        status: "blocked",
        message: preview.blockerSummary,
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        preview,
      };
    }

    if (preview.finalAction === "PURGE") {
      if (preview.targetExists) {
        await purgeRecycleTarget(tx, {
          targetType: entry.targetType,
          targetId: entry.targetId,
        });
      }

      await resolveRecycleEntryAsPurged(tx, {
        entryId: entry.id,
        resolvedById: actor.id,
      });

      const operationMeta = getPurgeOperationMeta({
        targetType: entry.targetType,
        titleSnapshot: entry.titleSnapshot,
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: operationMeta.module,
          action: operationMeta.action,
          targetType: operationMeta.targetType,
          targetId: entry.targetId,
          description: operationMeta.description,
          afterData: {
            recycleEntryId: entry.id,
            recycleStatus: RecycleEntryStatus.PURGED,
            recycleFinalAction: "PURGE",
          },
        },
      });

      return {
        status: "purged",
        message: "The target was finalized as PURGE.",
        entryId: entry.id,
        targetType: entry.targetType,
        targetId: entry.targetId,
        preview,
      };
    }

    const archivePayload = await archiveRecycleTarget(tx, {
      targetType: entry.targetType,
      targetId: entry.targetId,
      preview,
    });

    await resolveRecycleEntryAsArchived(tx, {
      entryId: entry.id,
      resolvedById: actor.id,
      archivePayloadJson: archivePayload,
    });

    const operationMeta = getArchiveOperationMeta({
      targetType: entry.targetType,
      titleSnapshot: entry.titleSnapshot,
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: operationMeta.module,
        action: operationMeta.action,
        targetType: operationMeta.targetType,
        targetId: entry.targetId,
        description: operationMeta.description,
        afterData: {
          recycleEntryId: entry.id,
          recycleStatus: RecycleEntryStatus.ARCHIVED,
          recycleFinalAction: "ARCHIVE",
          archivePayload: archivePayload as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      status: "archived",
      message: "The target was finalized as ARCHIVE.",
      entryId: entry.id,
      targetType: entry.targetType,
      targetId: entry.targetId,
      preview,
    };
  });
}
