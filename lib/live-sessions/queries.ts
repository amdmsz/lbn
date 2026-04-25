import { LiveAudienceMatchStatus, type RoleCode } from "@prisma/client";
import { canAccessLiveSessionModule } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { buildLiveSessionRecycleGuard } from "@/lib/live-sessions/recycle-guards";
import { findActiveTargetIds } from "@/lib/recycle-bin/repository";

export type LiveSessionViewer = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

export async function getLiveSessionsData(viewer: LiveSessionViewer) {
  if (!canAccessLiveSessionModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("You do not have access to the live-session module.");
  }

  const activeLiveSessionIds = await findActiveTargetIds(prisma, "LIVE_SESSION");

  const items = await prisma.liveSession.findMany({
    // Phase 1 KISS approach: exclude active recycle targets via notIn(activeIds).
    // If the active-id set grows large later, replace this with anti-join / exists.
    where:
      activeLiveSessionIds.length > 0
        ? {
            id: {
              notIn: activeLiveSessionIds,
            },
          }
        : undefined,
    orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      hostName: true,
      startAt: true,
      roomId: true,
      roomLink: true,
      targetProduct: true,
      remark: true,
      status: true,
      source: true,
      wecomLivingId: true,
      wecomLiveStatus: true,
      viewerCount: true,
      totalWatchDurationSeconds: true,
      peakOnlineCount: true,
      lastSyncedAt: true,
      syncStatus: true,
      syncError: true,
      createdAt: true,
      updatedAt: true,
      createdBy: {
        select: {
          name: true,
          username: true,
        },
      },
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

  const itemIds = items.map((item) => item.id);
  const audienceStatusCounts =
    itemIds.length > 0
      ? await prisma.liveAudienceRecord.groupBy({
          by: ["liveSessionId", "matchStatus"],
          where: { liveSessionId: { in: itemIds } },
          _count: { _all: true },
        })
      : [];
  const audienceCountMap = new Map<
    string,
    {
      autoMatched: number;
      confirmed: number;
      pending: number;
      unmatched: number;
      ignored: number;
      conflict: number;
    }
  >();

  for (const item of items) {
    audienceCountMap.set(item.id, {
      autoMatched: 0,
      confirmed: 0,
      pending: 0,
      unmatched: 0,
      ignored: 0,
      conflict: 0,
    });
  }

  for (const row of audienceStatusCounts) {
    const counts = audienceCountMap.get(row.liveSessionId);

    if (!counts) {
      continue;
    }

    const value = row._count._all;

    switch (row.matchStatus) {
      case LiveAudienceMatchStatus.AUTO_MATCHED_CUSTOMER:
        counts.autoMatched += value;
        break;
      case LiveAudienceMatchStatus.CONFIRMED_CUSTOMER:
        counts.confirmed += value;
        break;
      case LiveAudienceMatchStatus.PENDING_CONFIRMATION:
        counts.pending += value;
        break;
      case LiveAudienceMatchStatus.IGNORED:
        counts.ignored += value;
        break;
      case LiveAudienceMatchStatus.CONFLICT:
        counts.conflict += value;
        break;
      case LiveAudienceMatchStatus.UNMATCHED:
      default:
        counts.unmatched += value;
        break;
    }
  }

  const pendingAudienceConfirmations = await prisma.liveAudienceRecord.findMany({
    where: { matchStatus: LiveAudienceMatchStatus.PENDING_CONFIRMATION },
    orderBy: [{ updatedAt: "desc" }],
    take: 50,
    select: {
      id: true,
      nickname: true,
      viewerPhoneMasked: true,
      watchDurationSeconds: true,
      candidateConfidence: true,
      updatedAt: true,
      liveSession: {
        select: {
          id: true,
          title: true,
          startAt: true,
        },
      },
      candidateCustomer: {
        select: {
          id: true,
          name: true,
          phone: true,
          owner: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      },
    },
  });

  return {
    items: items.map((item) => {
      const engagementResultCount = item.invitations.filter(
        (invitation) =>
          invitation.attendanceStatus !== "NOT_ATTENDED" ||
          (invitation.watchDurationMinutes ?? 0) > 0 ||
          invitation.giftQualified,
      ).length;

      return {
        ...item,
        audienceCounts: audienceCountMap.get(item.id) ?? {
          autoMatched: 0,
          confirmed: 0,
          pending: 0,
          unmatched: 0,
          ignored: 0,
          conflict: 0,
        },
        engagementResultCount,
        recycleGuard: buildLiveSessionRecycleGuard({
          status: item.status,
          invitationCount: item._count.invitations,
          giftRecordCount: item._count.giftRecords,
          engagementResultCount,
        }),
      };
    }),
    pendingAudienceConfirmations,
  };
}
