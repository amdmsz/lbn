import {
  AttendanceStatus,
  InvitationMethod,
  InvitationStatus,
  LiveAudienceMatchMethod,
  LiveAudienceMatchStatus,
  LiveSessionSource,
  LiveSessionStatus,
  LiveSyncStatus,
  OperationModule,
  OperationTargetType,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canManageLiveSessions, getCustomerScope } from "@/lib/auth/access";
import type { ExtraPermissionCode } from "@/lib/auth/permissions";
import { touchCustomerEffectiveFollowUpFromLiveInvitationTx } from "@/lib/customers/ownership";
import { prisma } from "@/lib/db/prisma";
import { isWecomLiveSyncEnabled } from "@/lib/wecom/client";
import {
  extractLivingIds,
  getLivingInfo,
  getWatchStat,
  listUserAllLivingIds,
} from "@/lib/wecom/live";

export type WecomLiveActor = {
  id: string;
  role: RoleCode;
  permissionCodes?: ExtraPermissionCode[];
  teamId?: string | null;
};

type TransactionClient = Prisma.TransactionClient;

type NormalizedViewer = {
  wecomUserId: string | null;
  wecomExternalUserId: string | null;
  nickname: string | null;
  phone: string | null;
  watchDurationSeconds: number | null;
  firstEnterAt: Date | null;
  lastLeaveAt: Date | null;
  raw: unknown;
};

const syncByLivingIdSchema = z.object({
  livingid: z.string().trim().min(1, "请输入企业微信 livingid。"),
});

const syncExistingSchema = z.object({
  liveSessionId: z.string().trim().min(1, "缺少直播场次。"),
});

const syncCurrentByUserSchema = z.object({
  userid: z.string().trim().min(1, "请输入企业微信直播人的 UserID。"),
});

const confirmAudienceSchema = z.object({
  audienceRecordId: z.string().trim().min(1, "缺少观众记录。"),
});

const ignoreAudienceSchema = z.object({
  audienceRecordId: z.string().trim().min(1, "缺少观众记录。"),
  reason: z.string().trim().max(300).default(""),
});

function assertWecomSyncEnabled() {
  if (!isWecomLiveSyncEnabled()) {
    throw new Error("企业微信直播同步尚未启用，请先配置 WECOM_LIVE_SYNC_ENABLED=true。");
  }
}

function assertCanManageWecomLive(actor: WecomLiveActor) {
  if (!canManageLiveSessions(actor.role, actor.permissionCodes)) {
    throw new Error("当前账号无权同步或确认企业微信直播数据。");
  }
}

function normalizePhone(raw: string | null | undefined) {
  const digits = raw?.replace(/\D/g, "") ?? "";

  if (!digits) {
    return null;
  }

  if (digits.length === 11) {
    return digits;
  }

  return null;
}

function hashPhone(phone: string | null) {
  if (!phone) {
    return null;
  }

  return createHash("sha256").update(phone).digest("hex");
}

function maskPhone(phone: string | null) {
  if (!phone) {
    return null;
  }

  if (phone.length < 7) {
    return `${phone.slice(0, 2)}****`;
  }

  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function secondsToMinutes(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return 0;
  }

  return Math.ceil(seconds / 60);
}

function mapWecomStatusToLiveSessionStatus(status: string | null) {
  switch (status) {
    case "0":
    case "SCHEDULED":
      return LiveSessionStatus.SCHEDULED;
    case "1":
    case "LIVE":
      return LiveSessionStatus.LIVE;
    case "2":
    case "ENDED":
      return LiveSessionStatus.ENDED;
    case "3":
    case "CANCELED":
      return LiveSessionStatus.CANCELED;
    default:
      return LiveSessionStatus.SCHEDULED;
  }
}

function toInputJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function buildWecomRawJson(input: { livingInfo: unknown; watchStat: unknown }) {
  return {
    livingInfo: input.livingInfo,
    watchStat: input.watchStat,
  } as Prisma.InputJsonValue;
}

function buildAudienceDedupeKey(input: {
  livingid: string;
  wecomUserId: string | null;
  wecomExternalUserId: string | null;
  phoneHash: string | null;
  nickname: string | null;
}) {
  if (input.wecomExternalUserId) {
    return `${input.livingid}:external:${input.wecomExternalUserId}`;
  }

  if (input.wecomUserId) {
    return `${input.livingid}:user:${input.wecomUserId}`;
  }

  if (input.phoneHash) {
    return `${input.livingid}:phone:${input.phoneHash}`;
  }

  const nicknameHash = createHash("sha1")
    .update(input.nickname ?? "anonymous")
    .digest("hex")
    .slice(0, 16);

  return `${input.livingid}:anonymous:${nicknameHash}`;
}

async function findDeterministicCustomer(tx: TransactionClient, viewer: NormalizedViewer) {
  if (!viewer.wecomExternalUserId) {
    return null;
  }

  return tx.customer.findFirst({
    where: { wechatId: viewer.wecomExternalUserId },
    select: { id: true, name: true, phone: true, ownerId: true },
  });
}

async function findPhoneCandidate(tx: TransactionClient, phone: string | null) {
  if (!phone) {
    return null;
  }

  return tx.customer.findUnique({
    where: { phone },
    select: { id: true, name: true, phone: true, ownerId: true },
  });
}

async function upsertAttendanceInvitationTx(
  tx: TransactionClient,
  input: {
    actorId: string;
    liveSessionId: string;
    customer: { id: string; name: string; ownerId: string | null };
    watchDurationSeconds: number | null;
    occurredAt: Date;
    sourceAction: string;
  },
) {
  const salesId = input.customer.ownerId;

  if (!salesId) {
    return null;
  }

  const watchDurationMinutes = secondsToMinutes(input.watchDurationSeconds);
  const existing = await tx.liveInvitation.findFirst({
    where: {
      customerId: input.customer.id,
      liveSessionId: input.liveSessionId,
      salesId,
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

  const saved = existing
    ? await tx.liveInvitation.update({
        where: { id: existing.id },
        data: {
          invitationStatus: InvitationStatus.INVITED,
          invitationMethod: InvitationMethod.WECHAT,
          attendanceStatus: AttendanceStatus.ATTENDED,
          watchDurationMinutes,
        },
        select: { id: true },
      })
    : await tx.liveInvitation.create({
        data: {
          customerId: input.customer.id,
          liveSessionId: input.liveSessionId,
          salesId,
          invitationStatus: InvitationStatus.INVITED,
          invitedAt: input.occurredAt,
          invitationMethod: InvitationMethod.WECHAT,
          attendanceStatus: AttendanceStatus.ATTENDED,
          watchDurationMinutes,
          giftQualified: false,
          remark: "企业微信直播同步确认到场",
        },
        select: { id: true },
      });

  await tx.operationLog.create({
    data: {
      actorId: input.actorId,
      module: OperationModule.LIVE_SESSION,
      action: input.sourceAction,
      targetType: OperationTargetType.CUSTOMER,
      targetId: input.customer.id,
      description: `企业微信直播同步到场：${input.customer.name}`,
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
        liveSessionId: input.liveSessionId,
        attendanceStatus: AttendanceStatus.ATTENDED,
        watchDurationMinutes,
      },
    },
  });

  await touchCustomerEffectiveFollowUpFromLiveInvitationTx(tx, {
    customerId: input.customer.id,
    occurredAt: input.occurredAt,
    attended: true,
    attendanceStatus: AttendanceStatus.ATTENDED,
    watchDurationMinutes,
    giftQualified: false,
  });

  return saved;
}

async function upsertAudienceRecordTx(
  tx: TransactionClient,
  input: {
    actorId: string;
    liveSessionId: string;
    livingid: string;
    viewer: NormalizedViewer;
  },
) {
  const phone = normalizePhone(input.viewer.phone);
  const phoneHash = hashPhone(phone);
  const deterministicCustomer = await findDeterministicCustomer(tx, input.viewer);
  const phoneCandidate = deterministicCustomer ? null : await findPhoneCandidate(tx, phone);
  const dedupeKey = buildAudienceDedupeKey({
    livingid: input.livingid,
    wecomUserId: input.viewer.wecomUserId,
    wecomExternalUserId: input.viewer.wecomExternalUserId,
    phoneHash,
    nickname: input.viewer.nickname,
  });

  const matchStatus = deterministicCustomer
    ? LiveAudienceMatchStatus.AUTO_MATCHED_CUSTOMER
    : phoneCandidate
      ? LiveAudienceMatchStatus.PENDING_CONFIRMATION
      : LiveAudienceMatchStatus.UNMATCHED;
  const matchMethod = deterministicCustomer
    ? LiveAudienceMatchMethod.WECOM_EXTERNAL_USER_ID
    : phoneCandidate
      ? LiveAudienceMatchMethod.PHONE_EXACT
      : null;

  const existing = await tx.liveAudienceRecord.findUnique({
    where: { dedupeKey },
    select: {
      id: true,
      customerId: true,
      liveInvitationId: true,
      matchStatus: true,
    },
  });

  let liveInvitationId = existing?.liveInvitationId ?? null;

  if (deterministicCustomer) {
    const invitation = await upsertAttendanceInvitationTx(tx, {
      actorId: input.actorId,
      liveSessionId: input.liveSessionId,
      customer: deterministicCustomer,
      watchDurationSeconds: input.viewer.watchDurationSeconds,
      occurredAt: input.viewer.firstEnterAt ?? new Date(),
      sourceAction: "live_audience.auto_matched",
    });
    liveInvitationId = invitation?.id ?? liveInvitationId;
  }

  return tx.liveAudienceRecord.upsert({
    where: { dedupeKey },
    create: {
      liveSessionId: input.liveSessionId,
      wecomLivingId: input.livingid,
      wecomUserId: input.viewer.wecomUserId,
      wecomExternalUserId: input.viewer.wecomExternalUserId,
      viewerPhoneMasked: maskPhone(phone),
      phoneHash,
      nickname: input.viewer.nickname,
      watchDurationSeconds: input.viewer.watchDurationSeconds,
      firstEnterAt: input.viewer.firstEnterAt,
      lastLeaveAt: input.viewer.lastLeaveAt,
      raw: toInputJson(input.viewer.raw),
      matchStatus,
      matchMethod,
      candidateCustomerId: phoneCandidate?.id ?? null,
      candidateConfidence: phoneCandidate ? 80 : null,
      customerId: deterministicCustomer?.id ?? null,
      liveInvitationId,
      dedupeKey,
    },
    update: {
      wecomUserId: input.viewer.wecomUserId,
      wecomExternalUserId: input.viewer.wecomExternalUserId,
      viewerPhoneMasked: maskPhone(phone),
      phoneHash,
      nickname: input.viewer.nickname,
      watchDurationSeconds: input.viewer.watchDurationSeconds,
      firstEnterAt: input.viewer.firstEnterAt,
      lastLeaveAt: input.viewer.lastLeaveAt,
      raw: toInputJson(input.viewer.raw),
      matchStatus:
        existing?.matchStatus === LiveAudienceMatchStatus.CONFIRMED_CUSTOMER ||
        existing?.matchStatus === LiveAudienceMatchStatus.IGNORED
          ? existing.matchStatus
          : matchStatus,
      matchMethod,
      candidateCustomerId: phoneCandidate?.id ?? null,
      candidateConfidence: phoneCandidate ? 80 : null,
      customerId: deterministicCustomer?.id ?? existing?.customerId ?? null,
      liveInvitationId,
    },
    select: { id: true, matchStatus: true },
  });
}

export async function syncWecomLiveSessionByLivingId(
  actor: WecomLiveActor,
  rawInput: { livingid: string },
) {
  assertWecomSyncEnabled();
  assertCanManageWecomLive(actor);
  const parsed = syncByLivingIdSchema.parse(rawInput);
  const livingInfo = await getLivingInfo(parsed.livingid);
  const watchStat = await getWatchStat(parsed.livingid);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const liveSession = await tx.liveSession.upsert({
      where: { wecomLivingId: livingInfo.livingid },
      create: {
        title: livingInfo.title,
        hostName: livingInfo.hostName,
        startAt: livingInfo.startAt,
        roomId: livingInfo.livingid,
        status: mapWecomStatusToLiveSessionStatus(livingInfo.status),
        source: LiveSessionSource.WECOM,
        wecomLivingId: livingInfo.livingid,
        wecomAnchorUserId: livingInfo.anchorUserId,
        wecomLiveStatus: livingInfo.status,
        actualStartAt: livingInfo.actualStartAt,
        actualEndAt: livingInfo.actualEndAt,
        viewerCount: watchStat.viewerCount ?? livingInfo.viewerCount,
        totalWatchDurationSeconds: watchStat.totalWatchDurationSeconds,
        peakOnlineCount: watchStat.peakOnlineCount ?? livingInfo.peakOnlineCount,
        lastSyncedAt: now,
        syncStatus: LiveSyncStatus.SYNCED,
        syncError: null,
        wecomRaw: buildWecomRawJson({
          livingInfo: livingInfo.raw,
          watchStat: watchStat.raw,
        }),
        createdById: actor.id,
      },
      update: {
        title: livingInfo.title,
        hostName: livingInfo.hostName,
        startAt: livingInfo.startAt,
        roomId: livingInfo.livingid,
        status: mapWecomStatusToLiveSessionStatus(livingInfo.status),
        source: LiveSessionSource.WECOM,
        wecomAnchorUserId: livingInfo.anchorUserId,
        wecomLiveStatus: livingInfo.status,
        actualStartAt: livingInfo.actualStartAt,
        actualEndAt: livingInfo.actualEndAt,
        viewerCount: watchStat.viewerCount ?? livingInfo.viewerCount,
        totalWatchDurationSeconds: watchStat.totalWatchDurationSeconds,
        peakOnlineCount: watchStat.peakOnlineCount ?? livingInfo.peakOnlineCount,
        lastSyncedAt: now,
        syncStatus: LiveSyncStatus.SYNCED,
        syncError: null,
        wecomRaw: buildWecomRawJson({
          livingInfo: livingInfo.raw,
          watchStat: watchStat.raw,
        }),
      },
      select: { id: true, title: true },
    });

    let autoMatched = 0;
    let pending = 0;
    let unmatched = 0;

    for (const viewer of watchStat.viewers) {
      const saved = await upsertAudienceRecordTx(tx, {
        actorId: actor.id,
        liveSessionId: liveSession.id,
        livingid: livingInfo.livingid,
        viewer,
      });

      if (saved.matchStatus === LiveAudienceMatchStatus.AUTO_MATCHED_CUSTOMER) {
        autoMatched += 1;
      } else if (saved.matchStatus === LiveAudienceMatchStatus.PENDING_CONFIRMATION) {
        pending += 1;
      } else {
        unmatched += 1;
      }
    }

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.LIVE_SESSION,
        action: "live_session.wecom_synced",
        targetType: OperationTargetType.LIVE_SESSION,
        targetId: liveSession.id,
        description: `同步企业微信直播：${liveSession.title}`,
        afterData: {
          wecomLivingId: livingInfo.livingid,
          viewerCount: watchStat.viewers.length,
          autoMatched,
          pending,
          unmatched,
        },
      },
    });

    return { liveSession, autoMatched, pending, unmatched, viewerCount: watchStat.viewers.length };
  });

  return result;
}

export async function syncExistingWecomLiveSession(
  actor: WecomLiveActor,
  rawInput: { liveSessionId: string },
) {
  assertCanManageWecomLive(actor);
  const parsed = syncExistingSchema.parse(rawInput);
  const session = await prisma.liveSession.findUnique({
    where: { id: parsed.liveSessionId },
    select: { wecomLivingId: true },
  });

  if (!session?.wecomLivingId) {
    throw new Error("该直播场次尚未绑定企业微信 livingid。请先通过 livingid 导入。 ");
  }

  return syncWecomLiveSessionByLivingId(actor, { livingid: session.wecomLivingId });
}

export async function syncCurrentWecomLiveSessionByUser(
  actor: WecomLiveActor,
  rawInput: { userid: string },
) {
  assertWecomSyncEnabled();
  assertCanManageWecomLive(actor);
  const parsed = syncCurrentByUserSchema.parse(rawInput);
  const response = await listUserAllLivingIds({ userid: parsed.userid, limit: 20 });
  const livingIds = extractLivingIds(response);

  if (livingIds.length === 0) {
    throw new Error("企业微信没有返回该直播人的直播场次，请确认 UserID 和直播接口授权。 ");
  }

  const candidates = await Promise.all(
    livingIds.map(async (livingid) => {
      const info = await getLivingInfo(livingid);
      return { livingid, info };
    }),
  );
  const current = candidates.find(
    (candidate) => mapWecomStatusToLiveSessionStatus(candidate.info.status) === LiveSessionStatus.LIVE,
  );

  if (!current) {
    const latest = candidates.sort(
      (first, second) => second.info.startAt.getTime() - first.info.startAt.getTime(),
    )[0];

    throw new Error(
      latest
        ? `当前没有检测到正在直播的场次。最近场次：${latest.info.title}。`
        : "当前没有检测到正在直播的场次。",
    );
  }

  return syncWecomLiveSessionByLivingId(actor, { livingid: current.livingid });
}

export async function confirmLiveAudienceRecord(
  actor: WecomLiveActor,
  rawInput: { audienceRecordId: string },
) {
  assertCanManageWecomLive(actor);
  const parsed = confirmAudienceSchema.parse(rawInput);

  const record = await prisma.liveAudienceRecord.findUnique({
    where: { id: parsed.audienceRecordId },
    select: {
      id: true,
      liveSessionId: true,
      watchDurationSeconds: true,
      firstEnterAt: true,
      matchStatus: true,
      candidateCustomerId: true,
      candidateCustomer: {
        select: { id: true, name: true, phone: true, ownerId: true },
      },
    },
  });

  if (!record) {
    throw new Error("观众记录不存在。");
  }

  if (!record.candidateCustomer) {
    throw new Error("该观众记录没有可确认的候选客户。");
  }

  const candidateCustomer = record.candidateCustomer;

  const scope = getCustomerScope(actor.role, actor.id, actor.teamId);

  if (scope === null) {
    throw new Error("当前角色无权确认客户匹配。");
  }

  const visibleCustomer = await prisma.customer.findFirst({
    where: { AND: [{ id: candidateCustomer.id }, scope] },
    select: { id: true },
  });

  if (!visibleCustomer) {
    throw new Error("当前账号无权确认该客户匹配。");
  }

  return prisma.$transaction(async (tx) => {
    const invitation = await upsertAttendanceInvitationTx(tx, {
      actorId: actor.id,
      liveSessionId: record.liveSessionId,
      customer: candidateCustomer,
      watchDurationSeconds: record.watchDurationSeconds,
      occurredAt: record.firstEnterAt ?? new Date(),
      sourceAction: "live_audience.confirmed",
    });

    const updated = await tx.liveAudienceRecord.update({
      where: { id: record.id },
      data: {
        matchStatus: LiveAudienceMatchStatus.CONFIRMED_CUSTOMER,
        matchMethod: LiveAudienceMatchMethod.PHONE_MANUAL,
        customerId: candidateCustomer.id,
        liveInvitationId: invitation?.id ?? null,
        confirmedById: actor.id,
        confirmedAt: new Date(),
      },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.LIVE_SESSION,
        action: "live_audience.confirmed_customer",
        targetType: OperationTargetType.CUSTOMER,
        targetId: candidateCustomer.id,
        description: `确认企业微信直播观众匹配：${candidateCustomer.name}`,
        beforeData: {
          audienceRecordId: record.id,
          matchStatus: record.matchStatus,
          candidateCustomerId: record.candidateCustomerId,
        },
        afterData: {
          audienceRecordId: record.id,
          customerId: candidateCustomer.id,
          liveInvitationId: invitation?.id ?? null,
        },
      },
    });

    return updated;
  });
}

export async function ignoreLiveAudienceRecord(
  actor: WecomLiveActor,
  rawInput: { audienceRecordId: string; reason: string },
) {
  assertCanManageWecomLive(actor);
  const parsed = ignoreAudienceSchema.parse(rawInput);

  const record = await prisma.liveAudienceRecord.findUnique({
    where: { id: parsed.audienceRecordId },
    select: { id: true, matchStatus: true, candidateCustomerId: true },
  });

  if (!record) {
    throw new Error("观众记录不存在。");
  }

  const updated = await prisma.liveAudienceRecord.update({
    where: { id: record.id },
    data: {
      matchStatus: LiveAudienceMatchStatus.IGNORED,
      matchNote: parsed.reason || "员工忽略候选匹配",
      confirmedById: actor.id,
      confirmedAt: new Date(),
    },
    select: { id: true },
  });

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.LIVE_SESSION,
      action: "live_audience.ignored",
      targetType: OperationTargetType.LIVE_INVITATION,
      targetId: record.id,
      description: "忽略企业微信直播观众候选匹配",
      beforeData: {
        matchStatus: record.matchStatus,
        candidateCustomerId: record.candidateCustomerId,
      },
      afterData: {
        matchStatus: LiveAudienceMatchStatus.IGNORED,
        reason: parsed.reason || null,
      },
    },
  });

  return updated;
}
