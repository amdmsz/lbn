import { type RoleCode } from "@prisma/client";
import { canAccessLiveSessionModule } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { buildLiveSessionRecycleGuard } from "@/lib/live-sessions/recycle-guards";

export type LiveSessionViewer = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

export async function getLiveSessionsData(viewer: LiveSessionViewer) {
  if (!canAccessLiveSessionModule(viewer.role, viewer.permissionCodes)) {
    throw new Error(
      "\u5f53\u524d\u89d2\u8272\u65e0\u6743\u8bbf\u95ee\u76f4\u64ad\u573a\u6b21\u6a21\u5757\u3002",
    );
  }

  const items = await prisma.liveSession.findMany({
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
