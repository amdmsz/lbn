import {
  CustomerOwnershipMode,
  CustomerStatus,
  LeadCustomerMergeAction,
  LeadConversionStatus,
  LeadStatus,
  OperationModule,
  OperationTargetType,
  Prisma,
  RecycleEntryStatus,
  PublicPoolReason,
  type RecycleDomain,
  type RecycleTargetType,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { isRecycleCascadeFrom } from "@/lib/recycle-bin/paired-restore";
import { findHiddenRecycleEntry } from "@/lib/recycle-bin/repository";
import type {
  RecycleGuardBlocker,
  RecyclePurgeBlocker,
  RecyclePurgeGuard,
  RecycleRestoreBlocker,
  RecycleRestoreGuard,
  RecycleTargetSnapshot,
} from "@/lib/recycle-bin/types";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

export const leadRecycleRecordSelect = {
  id: true,
  name: true,
  phone: true,
  status: true,
  conversionStatus: true,
  ownerId: true,
  customerId: true,
  rolledBackAt: true,
  rolledBackBatchId: true,
  lastFollowUpAt: true,
  nextFollowUpAt: true,
  owner: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      status: true,
      level: true,
      ownershipMode: true,
      ownerId: true,
      lastOwnerId: true,
      publicPoolEnteredAt: true,
      publicPoolReason: true,
      publicPoolTeamId: true,
      claimLockedUntil: true,
      lastEffectiveFollowUpAt: true,
      _count: {
        select: {
          leads: true,
          followUpTasks: true,
          callRecords: true,
          wechatRecords: true,
          liveInvitations: true,
          orders: true,
          salesOrders: true,
          tradeOrders: true,
          paymentPlans: true,
          paymentRecords: true,
          collectionTasks: true,
          giftRecords: true,
          shippingTasks: true,
          logisticsFollowUpTasks: true,
          codCollectionRecords: true,
          customerTags: true,
          mergeLogs: true,
          ownershipEvents: true,
        },
      },
    },
  },
  mergeLogs: {
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      batchId: true,
      customerId: true,
      action: true,
      createdAt: true,
    },
  },
  _count: {
    select: {
      assignments: true,
      followUpTasks: true,
      callRecords: true,
      wechatRecords: true,
      liveInvitations: true,
      orders: true,
      giftRecords: true,
      leadTags: true,
      mergeLogs: true,
    },
  },
} satisfies Prisma.LeadSelect;

export type LeadRecycleRecord = Prisma.LeadGetPayload<{
  select: typeof leadRecycleRecordSelect;
}>;

async function getLeadRecord(
  db: RecycleDbClient,
  leadId: string,
): Promise<LeadRecycleRecord | null> {
  return db.lead.findUnique({
    where: { id: leadId },
    select: leadRecycleRecordSelect,
  });
}

function getLeadDisplayName(lead: Pick<LeadRecycleRecord, "name" | "phone">) {
  return lead.name?.trim() || lead.phone;
}

function hasLeadExecutionTrace(lead: LeadRecycleRecord) {
  return Boolean(
    lead.ownerId ||
      lead.status !== LeadStatus.NEW ||
      lead.conversionStatus !== LeadConversionStatus.UNCONVERTED ||
      lead.rolledBackAt ||
      lead.rolledBackBatchId ||
      lead.lastFollowUpAt ||
      lead.nextFollowUpAt ||
      lead._count.assignments > 0 ||
      lead._count.followUpTasks > 0 ||
      lead._count.callRecords > 0 ||
      lead._count.wechatRecords > 0 ||
      lead._count.liveInvitations > 0 ||
      lead._count.orders > 0 ||
      lead._count.giftRecords > 0,
  );
}

function hasOnlyImportCreatedCustomerMergeLogs(lead: LeadRecycleRecord) {
  if (!lead.customerId || lead._count.mergeLogs === 0) {
    return false;
  }

  if (lead.mergeLogs.length !== lead._count.mergeLogs) {
    return false;
  }

  return lead.mergeLogs.every(
    (mergeLog) =>
      mergeLog.action === LeadCustomerMergeAction.CREATED_CUSTOMER &&
      mergeLog.customerId === lead.customerId,
  );
}

function hasCustomerExecutionTrace(customer: NonNullable<LeadRecycleRecord["customer"]>) {
  return Boolean(
    customer.ownerId ||
      customer.lastOwnerId ||
      customer.claimLockedUntil ||
      customer.lastEffectiveFollowUpAt ||
      customer.status !== CustomerStatus.ACTIVE ||
      customer.ownershipMode !== CustomerOwnershipMode.PUBLIC ||
      customer.publicPoolReason !== PublicPoolReason.UNASSIGNED_IMPORT ||
      !customer.publicPoolEnteredAt ||
      customer._count.leads !== 1 ||
      customer._count.followUpTasks > 0 ||
      customer._count.callRecords > 0 ||
      customer._count.wechatRecords > 0 ||
      customer._count.liveInvitations > 0 ||
      customer._count.orders > 0 ||
      customer._count.salesOrders > 0 ||
      customer._count.tradeOrders > 0 ||
      customer._count.paymentPlans > 0 ||
      customer._count.paymentRecords > 0 ||
      customer._count.collectionTasks > 0 ||
      customer._count.giftRecords > 0 ||
      customer._count.shippingTasks > 0 ||
      customer._count.logisticsFollowUpTasks > 0 ||
      customer._count.codCollectionRecords > 0 ||
      customer._count.mergeLogs !== 1 ||
      customer._count.ownershipEvents > 1 ||
      customer._count.customerTags > 1,
  );
}

function getImportedLightLeadRecycleContext(lead: LeadRecycleRecord) {
  const customer = lead.customer;
  const canUseImportedCustomerBypass = Boolean(
    customer &&
      lead.customerId === customer.id &&
      !hasLeadExecutionTrace(lead) &&
      hasOnlyImportCreatedCustomerMergeLogs(lead) &&
      !hasCustomerExecutionTrace(customer),
  );

  return {
    canUseImportedCustomerBypass,
    customer: canUseImportedCustomerBypass ? customer : null,
  };
}

export function buildLeadMoveGuardFromRecord(lead: LeadRecycleRecord) {
  const blockers: RecycleGuardBlocker[] = [];
  const importedLightContext = getImportedLightLeadRecycleContext(lead);

  if (
    !importedLightContext.canUseImportedCustomerBypass &&
    (lead.customerId ||
      lead.conversionStatus !== LeadConversionStatus.UNCONVERTED ||
      lead.status === LeadStatus.CONVERTED)
  ) {
    blockers.push({
      code: "lead_linked_customer",
      name: "已转为客户",
      count: 1,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: "该线索已转为客户，不能移入回收站。",
    });
  }

  if (
    lead._count.mergeLogs > 0 &&
    !importedLightContext.canUseImportedCustomerBypass
  ) {
    blockers.push({
      code: "lead_merge_logs",
      name: "归并审计链",
      count: lead._count.mergeLogs,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `该线索已进入归并审计链，当前已有 ${lead._count.mergeLogs} 条相关记录。`,
    });
  }

  if (lead._count.orders > 0) {
    blockers.push({
      name: "成交订单",
      count: lead._count.orders,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `该线索已进入成交链，已有 ${lead._count.orders} 条订单记录。`,
    });
  }

  if (lead._count.giftRecords > 0) {
    blockers.push({
      name: "礼品记录",
      count: lead._count.giftRecords,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: `该线索已进入礼品履约链，已有 ${lead._count.giftRecords} 条礼品记录。`,
    });
  }

  if (lead.rolledBackAt || lead.rolledBackBatchId) {
    blockers.push({
      name: "导入回滚审计",
      count: 1,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: "该线索已进入导入回滚审计链，不能再次移入回收站。",
    });
  }

  return {
    canMoveToRecycleBin: blockers.length === 0,
    fallbackActionLabel: "改为关闭线索",
    blockerSummary:
      blockers.length === 0
        ? importedLightContext.canUseImportedCustomerBypass
          ? "该线索由导入自动创建客户，且尚未分配、跟进或成交，可连同导入轻客户移入回收站。"
          : "当前线索未进入客户、成交、礼品或导入回滚真相链，可移入回收站。"
        : blockers[0]?.description ?? "当前线索不能移入回收站。",
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
        ? "可以恢复到线索中心。"
        : blockers[0]?.description ?? "当前线索暂时不能恢复。",
    blockers,
    restoreRouteSnapshot,
  };
}

function buildPurgeGuard(blockers: RecyclePurgeBlocker[]): RecyclePurgeGuard {
  return {
    canPurge: blockers.length === 0,
    blockerSummary:
      blockers.length === 0
        ? "当前线索可从回收站中永久删除。"
        : blockers[0]?.description ?? "当前线索暂时不能永久删除。",
    blockers,
  };
}

export async function getLeadRecycleTarget(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
): Promise<RecycleTargetSnapshot | null> {
  if (targetType !== "LEAD") {
    return null;
  }

  const lead = await getLeadRecord(db, targetId);

  if (!lead) {
    return null;
  }

  const guard = buildLeadMoveGuardFromRecord(lead);

  return {
    targetType: "LEAD",
    targetId: lead.id,
    domain: "LEAD",
    titleSnapshot: getLeadDisplayName(lead),
    secondarySnapshot: lead.phone,
    originalStatusSnapshot: lead.status,
    restoreRouteSnapshot: "/leads",
    operationModule: OperationModule.LEAD,
    operationTargetType: OperationTargetType.LEAD,
    operationAction: "lead.moved_to_recycle_bin",
    operationDescription: `Moved lead to recycle bin: ${getLeadDisplayName(lead)}`,
    guard,
    blockerSnapshotJson: {
      ownerId: lead.ownerId,
      ownerName: lead.owner?.name ?? null,
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
    },
  };
}

function buildImportedLightCustomerCascadeTarget(
  lead: LeadRecycleRecord,
  customer: NonNullable<LeadRecycleRecord["customer"]>,
): RecycleTargetSnapshot {
  const leadDisplayName = getLeadDisplayName(lead);
  const guard: RecycleTargetSnapshot["guard"] = {
    canMoveToRecycleBin: true,
    fallbackActionLabel: "保留客户",
    blockerSummary:
      "该客户由导入线索自动创建，且尚未分配、跟进或成交，可跟随线索进入回收站。",
    blockers: [],
    futureRestoreBlockers: [],
  };

  return {
    targetType: "CUSTOMER",
    targetId: customer.id,
    domain: "CUSTOMER",
    titleSnapshot: customer.name,
    secondarySnapshot: customer.phone,
    originalStatusSnapshot: customer.status,
    restoreRouteSnapshot: `/customers/${customer.id}`,
    operationModule: OperationModule.CUSTOMER,
    operationTargetType: OperationTargetType.CUSTOMER,
    operationAction: "customer.moved_to_recycle_bin_from_imported_lead",
    operationDescription: `Moved imported lightweight customer to recycle bin from lead: ${customer.name}`,
    guard,
    blockerSnapshotJson: {
      phone: customer.phone,
      status: customer.status,
      level: customer.level,
      ownershipMode: customer.ownershipMode,
      ownerId: customer.ownerId,
      ownerLabel: "未分配",
      ownerTeamId: customer.publicPoolTeamId,
      publicPoolTeamId: customer.publicPoolTeamId,
      lastEffectiveFollowUpAt: customer.lastEffectiveFollowUpAt?.toISOString() ?? null,
      approvedTradeOrderCount: 0,
      linkedLeadCount: customer._count.leads,
      cascadeSourceTargetType: "LEAD",
      cascadeSourceTargetId: lead.id,
      cascadeSourceTitle: leadDisplayName,
      importMergeLogCount: lead._count.mergeLogs,
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
    },
  };
}

export async function listLeadCascadeRecycleTargets(
  db: RecycleDbClient,
  target: RecycleTargetSnapshot,
) {
  if (target.targetType !== "LEAD") {
    return [] as RecycleTargetSnapshot[];
  }

  const lead = await getLeadRecord(db, target.targetId);

  if (!lead) {
    return [] as RecycleTargetSnapshot[];
  }

  const importedLightContext = getImportedLightLeadRecycleContext(lead);

  if (!importedLightContext.customer) {
    return [] as RecycleTargetSnapshot[];
  }

  const existingCustomerEntry = await findHiddenRecycleEntry(
    db,
    "CUSTOMER",
    importedLightContext.customer.id,
  );

  if (existingCustomerEntry) {
    return [] as RecycleTargetSnapshot[];
  }

  return [
    buildImportedLightCustomerCascadeTarget(lead, importedLightContext.customer),
  ];
}

export async function buildLeadRestoreGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    restoreRouteSnapshot: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "LEAD" || input.targetType !== "LEAD") {
    return null;
  }

  const lead = await getLeadRecord(db, input.targetId);

  if (!lead) {
    return buildRestoreGuard(input.restoreRouteSnapshot, [
      {
        name: "对象缺失",
        description: "原始线索已不存在，当前不能恢复。",
      },
    ]);
  }

  const blockers: RecycleRestoreBlocker[] = [];
  const importedLightContext = getImportedLightLeadRecycleContext(lead);

  if (
    !importedLightContext.canUseImportedCustomerBypass &&
    (lead.customerId ||
      lead.conversionStatus !== LeadConversionStatus.UNCONVERTED ||
      lead.status === LeadStatus.CONVERTED)
  ) {
    blockers.push({
      code: "lead_linked_customer",
      name: "已转为客户",
      description: "该线索已转为客户，当前不能恢复到线索中心。",
    });
  }

  if (
    lead._count.mergeLogs > 0 &&
    !importedLightContext.canUseImportedCustomerBypass
  ) {
    blockers.push({
      code: "lead_merge_logs",
      name: "归并审计链",
      description: `该线索已进入归并审计链，当前已有 ${lead._count.mergeLogs} 条相关记录。`,
    });
  }

  if (importedLightContext.customer) {
    const hiddenCustomerEntry = await findHiddenRecycleEntry(
      db,
      "CUSTOMER",
      importedLightContext.customer.id,
    );

    if (hiddenCustomerEntry) {
      const isCascadeCustomerEntry = isRecycleCascadeFrom(
        hiddenCustomerEntry.blockerSnapshotJson,
        {
          targetType: "LEAD",
          targetId: lead.id,
        },
      );

      if (
        hiddenCustomerEntry.status !== RecycleEntryStatus.ACTIVE ||
        !isCascadeCustomerEntry
      ) {
        blockers.push({
          code:
            hiddenCustomerEntry.status === RecycleEntryStatus.ARCHIVED
              ? "lead_customer_recycle_finalized"
              : "lead_customer_still_recycled",
          name: "关联客户仍在回收站",
          description:
            hiddenCustomerEntry.status === RecycleEntryStatus.ARCHIVED
              ? "该导入线索关联的轻客户已完成回收站最终处理，不能再恢复线索。"
              : "该线索关联的客户仍在回收站中，且不是本次导入级联轻客户，请先处理关联客户后再恢复线索。",
        });
      }
    }
  }

  if (lead._count.orders > 0) {
    blockers.push({
      name: "成交订单",
      description: `该线索已进入成交链，已有 ${lead._count.orders} 条订单记录。`,
    });
  }

  if (lead._count.giftRecords > 0) {
    blockers.push({
      name: "礼品记录",
      description: `该线索已进入礼品履约链，已有 ${lead._count.giftRecords} 条礼品记录。`,
    });
  }

  if (lead.rolledBackAt || lead.rolledBackBatchId) {
    blockers.push({
      name: "导入回滚审计",
      description: "该线索已进入导入回滚审计链，当前不能恢复。",
    });
  }

  return buildRestoreGuard(input.restoreRouteSnapshot, blockers);
}

export async function buildLeadPurgeGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "LEAD" || input.targetType !== "LEAD") {
    return null;
  }

  const lead = await getLeadRecord(db, input.targetId);

  if (!lead) {
    return buildPurgeGuard([
      {
        name: "对象缺失",
        description: "原始线索已不存在，当前不能执行永久删除。",
      },
    ]);
  }

  const blockers: RecyclePurgeBlocker[] = [];
  const importedLightContext = getImportedLightLeadRecycleContext(lead);

  if (
    !importedLightContext.canUseImportedCustomerBypass &&
    (lead.customerId ||
      lead.conversionStatus !== LeadConversionStatus.UNCONVERTED ||
      lead.status === LeadStatus.CONVERTED)
  ) {
    blockers.push({
      code: "lead_linked_customer",
      name: "已转为客户",
      description: "该线索已转为客户，不能再从回收站中永久删除。",
    });
  }

  if (
    lead._count.mergeLogs > 0 &&
    !importedLightContext.canUseImportedCustomerBypass
  ) {
    blockers.push({
      code: "lead_merge_logs",
      name: "归并审计链",
      description: `该线索已进入归并审计链，当前已有 ${lead._count.mergeLogs} 条相关记录。`,
    });
  }

  if (lead._count.orders > 0) {
    blockers.push({
      name: "成交订单",
      description: `该线索已进入成交链，已有 ${lead._count.orders} 条订单记录。`,
    });
  }

  if (lead._count.giftRecords > 0) {
    blockers.push({
      name: "礼品记录",
      description: `该线索已进入礼品履约链，已有 ${lead._count.giftRecords} 条礼品记录。`,
    });
  }

  if (lead.ownerId) {
    blockers.push({
      name: "删除前负责人",
      description: "该线索删除前仍保留负责人，已分配记录会阻断永久删除。",
    });
  }

  if (lead._count.assignments > 0) {
    blockers.push({
      name: "已分配记录",
      description: `该线索已产生 ${lead._count.assignments} 条分配记录，不能再永久删除。`,
    });
  }

  if (lead._count.followUpTasks > 0) {
    blockers.push({
      name: "跟进任务",
      description: `该线索已产生 ${lead._count.followUpTasks} 条跟进任务。`,
    });
  }

  if (lead._count.callRecords > 0) {
    blockers.push({
      name: "通话记录",
      description: `该线索已产生 ${lead._count.callRecords} 条通话记录。`,
    });
  }

  if (lead._count.wechatRecords > 0) {
    blockers.push({
      name: "微信记录",
      description: `该线索已产生 ${lead._count.wechatRecords} 条微信记录。`,
    });
  }

  if (lead._count.liveInvitations > 0) {
    blockers.push({
      name: "直播邀请",
      description: `该线索已产生 ${lead._count.liveInvitations} 条直播邀请记录。`,
    });
  }

  if (lead.lastFollowUpAt) {
    blockers.push({
      name: "最近跟进时间",
      description: "该线索已记录最近跟进时间，说明已经进入销售执行痕迹。",
    });
  }

  if (lead.nextFollowUpAt) {
    blockers.push({
      name: "下次跟进时间",
      description: "该线索已设置下次跟进时间，说明仍在销售执行链中。",
    });
  }

  if (lead.rolledBackAt || lead.rolledBackBatchId) {
    blockers.push({
      name: "导入回滚审计",
      description: "该线索已进入导入回滚审计链，不能再永久删除。",
    });
  }

  if (lead._count.leadTags > 0) {
    blockers.push({
      name: "标签记录",
      description: `该线索仍保留 ${lead._count.leadTags} 条标签记录。`,
    });
  }

  return buildPurgeGuard(blockers);
}

export async function purgeLeadTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
  },
) {
  if (input.targetType !== "LEAD") {
    return false;
  }

  await db.lead.delete({
    where: { id: input.targetId },
  });

  return true;
}
