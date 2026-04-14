import { type RoleCode } from "@prisma/client";
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
        engagementResultCount,
        recycleGuard: buildLiveSessionRecycleGuard({
          status: item.status,
          invitationCount: item._count.invitations,
          giftRecordCount: item._count.giftRecords,
          engagementResultCount,
        }),
      };
    }),
  };
}
