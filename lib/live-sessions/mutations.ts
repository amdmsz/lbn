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
import { prisma } from "@/lib/db/prisma";

export type LiveActor = {
  id: string;
  role: RoleCode;
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

const createLiveSessionSchema = z.object({
  title: z.string().trim().min(1, "请输入直播主题").max(120),
  hostName: z.string().trim().min(1, "请输入主播名称").max(100),
  startAt: z.string().trim().min(1, "请选择开播时间"),
  roomId: z.string().trim().max(100).default(""),
  roomLink: z.string().trim().max(500).default(""),
  targetProduct: z.string().trim().max(120).default(""),
  remark: z.string().trim().max(1000).default(""),
});

const upsertLiveInvitationSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户信息"),
  liveSessionId: z.string().trim().min(1, "请选择直播场次"),
  invited: z.enum(["true", "false"], {
    message: "请选择是否已邀约",
  }),
  invitedAt: z.string().trim().default(""),
  invitationMethod: z.enum(["CALL", "WECHAT", "MANUAL", "OTHER"], {
    message: "请选择邀约方式",
  }),
  attended: z.enum(["true", "false"], {
    message: "请选择是否到场",
  }),
  watchDurationMinutes: z.coerce
    .number()
    .int()
    .min(0, "观看时长不能小于 0")
    .max(24 * 60, "观看时长不能超过 24 小时"),
  giftQualified: z.enum(["true", "false"], {
    message: "请选择是否礼品达标",
  }),
  remark: z.string().trim().max(1000).default(""),
});

function parseDateTimeInput(value: string, label: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label}格式不正确。`);
  }

  return parsed;
}

export async function createLiveSession(
  actor: LiveActor,
  rawInput: CreateLiveSessionInput,
) {
  if (!canAccessLiveSessionModule(actor.role)) {
    throw new Error("当前角色无权访问直播场次模块。");
  }

  if (!canManageLiveSessions(actor.role)) {
    throw new Error("当前角色不能创建直播场次。");
  }

  const parsed = createLiveSessionSchema.parse(rawInput);
  const startAt = parseDateTimeInput(parsed.startAt, "开播时间");

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
        description: `创建直播场次：${parsed.title}`,
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
    throw new Error("当前角色无权访问客户模块。");
  }

  if (!canCreateLiveInvitation(actor.role)) {
    throw new Error("当前角色不能维护直播邀约记录。");
  }

  const parsed = upsertLiveInvitationSchema.parse(rawInput);
  const customerScope = getCustomerScope(actor.role, actor.id);

  if (!customerScope) {
    throw new Error("当前角色无权访问该客户。");
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
    throw new Error("客户不存在，或你无权访问该客户。");
  }

  if (customer.ownerId !== actor.id) {
    throw new Error("销售只能维护自己负责客户的直播邀约记录。");
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
    throw new Error("直播场次不存在。");
  }

  const invited = parsed.invited === "true";
  const attended = parsed.attended === "true";
  const giftQualified = parsed.giftQualified === "true";
  const invitedAt = parsed.invitedAt
    ? parseDateTimeInput(parsed.invitedAt, "邀约时间")
    : null;

  if (invited && !invitedAt) {
    throw new Error("已邀约时必须填写邀约时间。");
  }

  if (!invited && invitedAt) {
    throw new Error("未邀约时不应填写邀约时间。");
  }

  if (!invited && attended) {
    throw new Error("未邀约客户不能直接标记为已到场。");
  }

  if (!attended && parsed.watchDurationMinutes > 0) {
    throw new Error("未到场时观看时长必须为 0。");
  }

  if (!attended && giftQualified) {
    throw new Error("未到场时不能标记礼品达标。");
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
        action: existing
          ? "live_invitation.updated"
          : "live_invitation.created",
        targetType: OperationTargetType.CUSTOMER,
        targetId: customer.id,
        description: `${existing ? "更新" : "新增"}直播邀约记录：${customer.name} -> ${liveSession.title}`,
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

    return saved;
  });

  return {
    id: record.id,
    customerId: customer.id,
  };
}
