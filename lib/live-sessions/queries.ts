import { type RoleCode } from "@prisma/client";
import { canAccessLiveSessionModule } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

export type LiveSessionViewer = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

export async function getLiveSessionsData(viewer: LiveSessionViewer) {
  if (!canAccessLiveSessionModule(viewer.role, viewer.permissionCodes)) {
    throw new Error("当前角色无权访问直播场次模块。");
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
      createdBy: {
        select: {
          name: true,
          username: true,
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

  return { items };
}
