import {
  AttendanceStatus,
  InvitationStatus,
  LiveSessionStatus,
  OperationModule,
  OperationTargetType,
  type InvitationMethod,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessCustomerModule,
  canAccessLiveSessionModule,
  canCreateLiveInvitation,
  canManageLiveSessions,
  getCustomerScope,
} from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { touchCustomerEffectiveFollowUpFromLiveInvitationTx } from "@/lib/customers/ownership";
import { prisma } from "@/lib/db/prisma";
import { findActiveRecycleEntry } from "@/lib/recycle-bin/repository";

export type LiveActor = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
};

export type CreateLiveSessionInput = {
  title: string;
  hostName: string;
  startAt: string;
  roomId: string;
  roomLink: string;
  targetProduct: string;
  remark: string;
};

export type UpsertLiveInvitationInput = {
  customerId: string;
  liveSessionId: string;
  invited: string;
  invitedAt: string;
  invitationMethod: InvitationMethod;
  attended: string;
  watchDurationMinutes: number;
  giftQualified: string;
  remark: string;
};

export type UpdateLiveSessionLifecycleInput = {
  liveSessionId: string;
  nextStatus: "CANCELED" | "ENDED";
};

const createLiveSessionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "\u8bf7\u8f93\u5165\u76f4\u64ad\u4e3b\u9898")
    .max(120),
  hostName: z
    .string()
    .trim()
    .min(1, "\u8bf7\u8f93\u5165\u4e3b\u64ad\u540d\u79f0")
    .max(100),
  startAt: z.string().trim().min(1, "\u8bf7\u9009\u62e9\u5f00\u64ad\u65f6\u95f4"),
  roomId: z.string().trim().max(100).default(""),
  roomLink: z.string().trim().max(500).default(""),
  targetProduct: z.string().trim().max(120).default(""),
  remark: z.string().trim().max(1000).default(""),
});

const upsertLiveInvitationSchema = z.object({
  customerId: z.string().trim().min(1, "\u7f3a\u5c11\u5ba2\u6237\u4fe1\u606f"),
  liveSessionId: z.string().trim().min(1, "\u8bf7\u9009\u62e9\u76f4\u64ad\u573a\u6b21"),
  invited: z.enum(["true", "false"], {
    message: "\u8bf7\u9009\u62e9\u662f\u5426\u5df2\u9080\u7ea6",
  }),
  invitedAt: z.string().trim().default(""),
  invitationMethod: z.enum(["CALL", "WECHAT", "MANUAL", "OTHER"], {
    message: "\u8bf7\u9009\u62e9\u9080\u7ea6\u65b9\u5f0f",
  }),
  attended: z.enum(["true", "false"], {
    message: "\u8bf7\u9009\u62e9\u662f\u5426\u5230\u573a",
  }),
  watchDurationMinutes: z.coerce
    .number()
    .int()
    .min(0, "\u89c2\u770b\u65f6\u957f\u4e0d\u80fd\u5c0f\u4e8e 0")
    .max(24 * 60, "\u89c2\u770b\u65f6\u957f\u4e0d\u80fd\u8d85\u8fc7 24 \u5c0f\u65f6"),
  giftQualified: z.enum(["true", "false"], {
    message: "\u8bf7\u9009\u62e9\u662f\u5426\u793c\u54c1\u8fbe\u6807",
  }),
  remark: z.string().trim().max(1000).default(""),
});

function parseDateTimeInput(value: string, label: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label}\u683c\u5f0f\u4e0d\u6b63\u786e\u3002`);
  }

  return parsed;
}

async function assertLiveSessionNotInRecycleBin(
  liveSessionId: string,
  actionLabel: string,
) {
  const activeEntry = await findActiveRecycleEntry(
    prisma,
    "LIVE_SESSION",
    liveSessionId,
  );

  if (activeEntry) {
    throw new Error(`该直播场次已移入回收站，不能继续${actionLabel}。`);
  }
}

export async function createLiveSession(
  actor: LiveActor,
  rawInput: CreateLiveSessionInput,
) {
  if (!canAccessLiveSessionModule(actor.role, actor.permissionCodes)) {
    throw new Error("\u5f53\u524d\u89d2\u8272\u65e0\u6743\u8bbf\u95ee\u76f4\u64ad\u573a\u6b21\u6a21\u5757\u3002");
  }

  if (!canManageLiveSessions(actor.role, actor.permissionCodes)) {
    throw new Error("\u5f53\u524d\u89d2\u8272\u4e0d\u80fd\u521b\u5efa\u76f4\u64ad\u573a\u6b21\u3002");
  }

  const parsed = createLiveSessionSchema.parse(rawInput);
  const startAt = parseDateTimeInput(parsed.startAt, "\u5f00\u64ad\u65f6\u95f4");

  const liveSession = await prisma.$transaction(async (tx) => {
    const created = await tx.liveSession.create({
      data: {
        title: parsed.title,
        hostName: parsed.hostName,
        startAt,
        roomId: parsed.roomId || null,
        roomLink: parsed.roomLink || null,
        targetProduct: parsed.targetProduct || null,
        remark: parsed.remark || null,
        status: LiveSessionStatus.SCHEDULED,
        createdById: actor.id,
      },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.LIVE_SESSION,
        action: "live_session.created",
        targetType: OperationTargetType.LIVE_SESSION,
        targetId: created.id,
        description: `\u521b\u5efa\u76f4\u64ad\u573a\u6b21\uff1a${parsed.title}`,
        afterData: {
          hostName: parsed.hostName,
          startAt,
          roomId: parsed.roomId || null,
          roomLink: parsed.roomLink || null,
          targetProduct: parsed.targetProduct || null,
        },
      },
    });

    return created;
  });

  return {
    id: liveSession.id,
  };
}

export async function upsertLiveInvitation(
  actor: LiveActor,
  rawInput: UpsertLiveInvitationInput,
) {
  if (!canAccessCustomerModule(actor.role)) {
    throw new Error("\u5f53\u524d\u89d2\u8272\u65e0\u6743\u8bbf\u95ee\u5ba2\u6237\u6a21\u5757\u3002");
  }

  if (!canCreateLiveInvitation(actor.role)) {
    throw new Error("\u5f53\u524d\u89d2\u8272\u4e0d\u80fd\u7ef4\u62a4\u76f4\u64ad\u9080\u7ea6\u8bb0\u5f55\u3002");
  }

  const parsed = upsertLiveInvitationSchema.parse(rawInput);
  await assertLiveSessionNotInRecycleBin(parsed.liveSessionId, "维护邀约记录");
  const customerScope = getCustomerScope(actor.role, actor.id);

  if (!customerScope) {
    throw new Error("\u5f53\u524d\u89d2\u8272\u65e0\u6743\u8bbf\u95ee\u8be5\u5ba2\u6237\u3002");
  }

  const customer = await prisma.customer.findFirst({
    where: {
      id: parsed.customerId,
      ...customerScope,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      ownerId: true,
    },
  });

  if (!customer) {
    throw new Error(
      "\u5ba2\u6237\u4e0d\u5b58\u5728\uff0c\u6216\u4f60\u65e0\u6743\u8bbf\u95ee\u8be5\u5ba2\u6237\u3002",
    );
  }

  await assertCustomerNotInActiveRecycleBin(prisma, customer.id);

  if (customer.ownerId !== actor.id) {
    throw new Error(
      "\u9500\u552e\u53ea\u80fd\u7ef4\u62a4\u81ea\u5df1\u8d1f\u8d23\u5ba2\u6237\u7684\u76f4\u64ad\u9080\u7ea6\u8bb0\u5f55\u3002",
    );
  }

  const liveSession = await prisma.liveSession.findUnique({
    where: { id: parsed.liveSessionId },
    select: {
      id: true,
      title: true,
      startAt: true,
    },
  });

  if (!liveSession) {
    throw new Error("\u76f4\u64ad\u573a\u6b21\u4e0d\u5b58\u5728\u3002");
  }

  const invited = parsed.invited === "true";
  const attended = parsed.attended === "true";
  const giftQualified = parsed.giftQualified === "true";
  const invitedAt = parsed.invitedAt
    ? parseDateTimeInput(parsed.invitedAt, "\u9080\u7ea6\u65f6\u95f4")
    : null;

  if (invited && !invitedAt) {
    throw new Error("\u5df2\u9080\u7ea6\u65f6\u5fc5\u987b\u586b\u5199\u9080\u7ea6\u65f6\u95f4\u3002");
  }

  if (!invited && invitedAt) {
    throw new Error("\u672a\u9080\u7ea6\u65f6\u4e0d\u5e94\u586b\u5199\u9080\u7ea6\u65f6\u95f4\u3002");
  }

  if (!invited && attended) {
    throw new Error("\u672a\u9080\u7ea6\u5ba2\u6237\u4e0d\u80fd\u76f4\u63a5\u6807\u8bb0\u4e3a\u5df2\u5230\u573a\u3002");
  }

  if (!attended && parsed.watchDurationMinutes > 0) {
    throw new Error("\u672a\u5230\u573a\u65f6\u89c2\u770b\u65f6\u957f\u5fc5\u987b\u4e3a 0\u3002");
  }

  if (!attended && giftQualified) {
    throw new Error("\u672a\u5230\u573a\u65f6\u4e0d\u80fd\u6807\u8bb0\u793c\u54c1\u8fbe\u6807\u3002");
  }

  const invitationStatus = invited ? InvitationStatus.INVITED : InvitationStatus.PENDING;
  const attendanceStatus = attended
    ? AttendanceStatus.ATTENDED
    : AttendanceStatus.NOT_ATTENDED;

  const existing = await prisma.liveInvitation.findFirst({
    where: {
      customerId: customer.id,
      liveSessionId: liveSession.id,
      salesId: actor.id,
    },
    select: {
      id: true,
      invitationStatus: true,
      attendanceStatus: true,
      watchDurationMinutes: true,
      giftQualified: true,
      invitedAt: true,
    },
  });

  const record = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.liveInvitation.update({
          where: { id: existing.id },
          data: {
            invitationStatus,
            invitedAt,
            invitationMethod: parsed.invitationMethod,
            attendanceStatus,
            watchDurationMinutes: parsed.watchDurationMinutes,
            giftQualified,
            remark: parsed.remark || null,
          },
          select: { id: true },
        })
      : await tx.liveInvitation.create({
          data: {
            customerId: customer.id,
            liveSessionId: liveSession.id,
            salesId: actor.id,
            invitationStatus,
            invitedAt,
            invitationMethod: parsed.invitationMethod,
            attendanceStatus,
            watchDurationMinutes: parsed.watchDurationMinutes,
            giftQualified,
            remark: parsed.remark || null,
          },
          select: { id: true },
        });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.LIVE_SESSION,
        action: existing ? "live_invitation.updated" : "live_invitation.created",
        targetType: OperationTargetType.CUSTOMER,
        targetId: customer.id,
        description: `${existing ? "\u66f4\u65b0" : "\u65b0\u589e"}\u76f4\u64ad\u9080\u7ea6\u8bb0\u5f55\uff1a${customer.name} -> ${liveSession.title}`,
        beforeData: existing
          ? {
              invitationStatus: existing.invitationStatus,
              attendanceStatus: existing.attendanceStatus,
              watchDurationMinutes: existing.watchDurationMinutes,
              giftQualified: existing.giftQualified,
              invitedAt: existing.invitedAt,
            }
          : undefined,
        afterData: {
          liveInvitationId: saved.id,
          liveSessionId: liveSession.id,
          salesId: actor.id,
          invitationStatus,
          invitedAt,
          invitationMethod: parsed.invitationMethod,
          attendanceStatus,
          watchDurationMinutes: parsed.watchDurationMinutes,
          giftQualified,
        },
      },
    });

    await touchCustomerEffectiveFollowUpFromLiveInvitationTx(tx, {
      customerId: customer.id,
      occurredAt: invitedAt ?? liveSession.startAt,
      attended,
      attendanceStatus,
      watchDurationMinutes: parsed.watchDurationMinutes,
      giftQualified,
    });

    return saved;
  });

  return {
    id: record.id,
    customerId: customer.id,
  };
}

export async function updateLiveSessionLifecycle(
  actor: LiveActor,
  input: UpdateLiveSessionLifecycleInput,
) {
  if (!canAccessLiveSessionModule(actor.role, actor.permissionCodes)) {
    throw new Error("\u5f53\u524d\u89d2\u8272\u65e0\u6743\u8bbf\u95ee\u76f4\u64ad\u573a\u6b21\u6a21\u5757\u3002");
  }

  if (!canManageLiveSessions(actor.role, actor.permissionCodes)) {
    throw new Error("\u5f53\u524d\u89d2\u8272\u4e0d\u80fd\u7ef4\u62a4\u76f4\u64ad\u573a\u6b21\u3002");
  }

  await assertLiveSessionNotInRecycleBin(input.liveSessionId, "编辑");

  const session = await prisma.liveSession.findUnique({
    where: { id: input.liveSessionId },
    select: {
      id: true,
      title: true,
      status: true,
    },
  });

  if (!session) {
    throw new Error("\u76f4\u64ad\u573a\u6b21\u4e0d\u5b58\u5728\u3002");
  }

  if (input.nextStatus === LiveSessionStatus.CANCELED) {
    if (session.status === LiveSessionStatus.CANCELED) {
      throw new Error(
        "\u5f53\u524d\u573a\u6b21\u5df2\u53d6\u6d88\uff0c\u65e0\u9700\u91cd\u590d\u64cd\u4f5c\u3002",
      );
    }

    if (session.status === LiveSessionStatus.ENDED) {
      throw new Error(
        "\u5df2\u7ed3\u675f\u573a\u6b21\u4e0d\u80fd\u518d\u53d6\u6d88\uff0c\u8bf7\u7ee7\u7eed\u4f5c\u4e3a\u5386\u53f2\u573a\u6b21\u4fdd\u7559\u3002",
      );
    }
  }

  if (input.nextStatus === LiveSessionStatus.ENDED) {
    if (session.status === LiveSessionStatus.ENDED) {
      throw new Error(
        "\u5f53\u524d\u573a\u6b21\u5df2\u4f5c\u4e3a\u5386\u53f2\u573a\u6b21\u4fdd\u7559\u3002",
      );
    }

    if (session.status === LiveSessionStatus.CANCELED) {
      throw new Error(
        "\u5df2\u53d6\u6d88\u573a\u6b21\u4e0d\u80fd\u518d\u5f52\u6863\uff0c\u8bf7\u4fdd\u7559\u5f53\u524d\u72b6\u6001\u3002",
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextSession = await tx.liveSession.update({
      where: { id: session.id },
      data: {
        status: input.nextStatus,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.LIVE_SESSION,
        action:
          input.nextStatus === LiveSessionStatus.CANCELED
            ? "live_session.canceled"
            : "live_session.archived",
        targetType: OperationTargetType.LIVE_SESSION,
        targetId: session.id,
        description:
          input.nextStatus === LiveSessionStatus.CANCELED
            ? `\u53d6\u6d88\u76f4\u64ad\u573a\u6b21\uff1a${session.title}`
            : `\u5f52\u6863\u76f4\u64ad\u573a\u6b21\uff1a${session.title}`,
        beforeData: {
          status: session.status,
        },
        afterData: {
          status: nextSession.status,
        },
      },
    });

    return nextSession;
  });

  return updated;
}
