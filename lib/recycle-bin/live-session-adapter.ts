import {
  OperationModule,
  OperationTargetType,
  Prisma,
  type RecycleDomain,
  type RecycleTargetType,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildLiveSessionRecycleGuard } from "@/lib/live-sessions/recycle-guards";
import type {
  RecyclePurgeBlocker,
  RecyclePurgeGuard,
  RecycleRestoreBlocker,
  RecycleRestoreGuard,
  RecycleTargetSnapshot,
} from "@/lib/recycle-bin/types";

type RecycleDbClient = typeof prisma | Prisma.TransactionClient;

export async function getLiveSessionRecycleTarget(
  db: RecycleDbClient,
  targetType: RecycleTargetType,
  targetId: string,
): Promise<RecycleTargetSnapshot | null> {
  if (targetType !== "LIVE_SESSION") {
    return null;
  }

  const liveSession = await db.liveSession.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      title: true,
      hostName: true,
      status: true,
      invitations: {
        select: {
          attendanceStatus: true,
          watchDurationMinutes: true,
          giftQualified: true,
        },
      },
      _count: {
        select: {
          invitations: true,
          giftRecords: true,
        },
      },
    },
  });

  if (!liveSession) {
    return null;
  }

  const engagementResultCount = liveSession.invitations.filter(
    (invitation) =>
      invitation.attendanceStatus !== "NOT_ATTENDED" ||
      (invitation.watchDurationMinutes ?? 0) > 0 ||
      invitation.giftQualified,
  ).length;

  const guard = buildLiveSessionRecycleGuard({
    status: liveSession.status,
    invitationCount: liveSession._count.invitations,
    giftRecordCount: liveSession._count.giftRecords,
    engagementResultCount,
  });

  return {
    targetType: "LIVE_SESSION",
    targetId: liveSession.id,
    domain: "LIVE_SESSION",
    titleSnapshot: liveSession.title,
    secondarySnapshot: liveSession.hostName,
    originalStatusSnapshot: liveSession.status,
    restoreRouteSnapshot: "/live-sessions",
    operationModule: OperationModule.LIVE_SESSION,
    operationTargetType: OperationTargetType.LIVE_SESSION,
    operationAction: "live_session.moved_to_recycle_bin",
    operationDescription: `Moved live session to recycle bin: ${liveSession.title}`,
    guard,
    blockerSnapshotJson: {
      blockers: guard.blockers,
      blockerSummary: guard.blockerSummary,
      fallbackAction: guard.fallbackAction,
    },
  };
}

function buildRestoreGuard(
  restoreRouteSnapshot: string,
  blockers: RecycleRestoreBlocker[],
): RecycleRestoreGuard {
  return {
    canRestore: blockers.length === 0,
    blockerSummary:
      blockers.length === 0
        ? "可以恢复到直播场次列表。"
        : blockers[0]?.description ?? "当前场次暂时不能恢复。",
    blockers,
    restoreRouteSnapshot,
  };
}

function buildPurgeGuard(blockers: RecyclePurgeBlocker[]): RecyclePurgeGuard {
  return {
    canPurge: blockers.length === 0,
    blockerSummary:
      blockers.length === 0
        ? "当前场次可从回收站中永久删除。"
        : blockers[0]?.description ?? "当前场次暂时不能永久删除。",
    blockers,
  };
}

export async function buildLiveSessionRestoreGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    restoreRouteSnapshot: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "LIVE_SESSION" || input.targetType !== "LIVE_SESSION") {
    return null;
  }

  const liveSession = await db.liveSession.findUnique({
    where: { id: input.targetId },
    select: {
      id: true,
    },
  });

  if (!liveSession) {
    return buildRestoreGuard(input.restoreRouteSnapshot, [
      {
        name: "场次缺失",
        description: "原始直播场次已不存在，当前不能恢复。",
      },
    ]);
  }

  return buildRestoreGuard(input.restoreRouteSnapshot, []);
}

export async function buildLiveSessionPurgeGuard(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
    domain: RecycleDomain;
  },
) {
  if (input.domain !== "LIVE_SESSION" || input.targetType !== "LIVE_SESSION") {
    return null;
  }

  const liveSession = await db.liveSession.findUnique({
    where: { id: input.targetId },
    select: {
      id: true,
      invitations: {
        select: {
          attendanceStatus: true,
          watchDurationMinutes: true,
          giftQualified: true,
        },
      },
      _count: {
        select: {
          invitations: true,
          giftRecords: true,
        },
      },
    },
  });

  if (!liveSession) {
    return buildPurgeGuard([
      {
        name: "对象缺失",
        description: "原始直播场次已不存在，当前不能执行永久删除。",
      },
    ]);
  }

  const engagementResultCount = liveSession.invitations.filter(
    (invitation) =>
      invitation.attendanceStatus !== "NOT_ATTENDED" ||
      (invitation.watchDurationMinutes ?? 0) > 0 ||
      invitation.giftQualified,
  ).length;

  const blockers: RecyclePurgeBlocker[] = [];

  if (liveSession._count.invitations > 0) {
    blockers.push({
      name: "邀约记录",
      description: `已有 ${liveSession._count.invitations} 条邀约记录，当前不能永久删除。`,
    });
  }

  if (liveSession._count.giftRecords > 0) {
    blockers.push({
      name: "礼品记录",
      description: `已有 ${liveSession._count.giftRecords} 条礼品记录，当前不能永久删除。`,
    });
  }

  if (engagementResultCount > 0) {
    blockers.push({
      name: "观看或到场结果",
      description: `已产生 ${engagementResultCount} 条到场、观看或达标结果，当前不能永久删除。`,
    });
  }

  return buildPurgeGuard(blockers);
}

export async function purgeLiveSessionTarget(
  db: RecycleDbClient,
  input: {
    targetType: RecycleTargetType;
    targetId: string;
  },
) {
  if (input.targetType !== "LIVE_SESSION") {
    return false;
  }

  await db.liveSession.delete({
    where: { id: input.targetId },
  });

  return true;
}
