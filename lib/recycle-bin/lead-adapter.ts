import {
  LeadConversionStatus,
  LeadStatus,
  OperationModule,
  OperationTargetType,
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

export type LeadRecycleRecord = {
  id: string;
  name: string | null;
  phone: string;
  status: LeadStatus;
  conversionStatus: LeadConversionStatus;
  ownerId: string | null;
  customerId: string | null;
  rolledBackAt: Date | null;
  rolledBackBatchId: string | null;
  lastFollowUpAt: Date | null;
  nextFollowUpAt: Date | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
  _count: {
    assignments: number;
    followUpTasks: number;
    callRecords: number;
    wechatRecords: number;
    liveInvitations: number;
    orders: number;
    giftRecords: number;
    leadTags: number;
    mergeLogs: number;
  };
};

async function getLeadRecord(
  db: RecycleDbClient,
  leadId: string,
): Promise<LeadRecycleRecord | null> {
  return db.lead.findUnique({
    where: { id: leadId },
    select: {
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
    },
  });
}

function getLeadDisplayName(lead: Pick<LeadRecycleRecord, "name" | "phone">) {
  return lead.name?.trim() || lead.phone;
}

export function buildLeadMoveGuardFromRecord(lead: LeadRecycleRecord) {
  const blockers: RecycleGuardBlocker[] = [];

  if (
    lead.customerId ||
    lead.conversionStatus !== LeadConversionStatus.UNCONVERTED ||
    lead.status === LeadStatus.CONVERTED
  ) {
    blockers.push({
      name: "已转为客户",
      count: 1,
      blocksMoveToRecycleBin: true,
      blocksPermanentDelete: true,
      description: "该线索已转为客户，不能移入回收站。",
    });
  }

  if (lead._count.mergeLogs > 0) {
    blockers.push({
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
        ? "当前线索未进入客户、成交、礼品或导入回滚真相链，可移入回收站。"
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

  if (
    lead.customerId ||
    lead.conversionStatus !== LeadConversionStatus.UNCONVERTED ||
    lead.status === LeadStatus.CONVERTED
  ) {
    blockers.push({
      name: "已转为客户",
      description: "该线索已转为客户，当前不能恢复到线索中心。",
    });
  }

  if (lead._count.mergeLogs > 0) {
    blockers.push({
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

  if (
    lead.customerId ||
    lead.conversionStatus !== LeadConversionStatus.UNCONVERTED ||
    lead.status === LeadStatus.CONVERTED
  ) {
    blockers.push({
      name: "已转为客户",
      description: "该线索已转为客户，不能再从回收站中永久删除。",
    });
  }

  if (lead._count.mergeLogs > 0) {
    blockers.push({
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
