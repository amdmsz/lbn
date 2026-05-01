import {
  CallRecordingStatus,
  CallRecordingUploadStatus,
  OperationModule,
  OperationTargetType,
  WechatAddStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canPlaybackCallRecording,
  canRegisterMobileDevice,
  canReviewCallRecording,
  canUploadCallRecording,
  getCallRecordingScope,
  getCustomerScope,
} from "@/lib/auth/access";
import { mapCallResultCodeToLegacyEnum } from "@/lib/calls/metadata";
import {
  CALL_QUALITY_REVIEW_STATUSES,
  MOBILE_RECORDING_CAPABILITIES,
} from "@/lib/calls/recording-metadata";
import {
  buildRecordingDownloadFilename,
  isBrowserPlayableRecordingMimeType,
  shouldTranscodeRecordingForBrowser,
} from "@/lib/calls/recording-audio";
import { transcodeRecordingForBrowser } from "@/lib/calls/recording-playback-transcode";
import {
  assembleUploadChunks,
  buildRecordingObjectKey,
  buildRetentionUntil,
  ensureRecordingStorageReady,
  openRecordingReadStream,
  removeUploadChunks,
  resolveRecordingStorageConfig,
  writeUploadChunk,
  type RecordingByteRangeRequest,
} from "@/lib/calls/recording-storage";
import { resolveCallAiWorkerRuntimeConfig } from "@/lib/calls/call-runtime-config";
import { getEnabledCallResultDefinitionByCode } from "@/lib/calls/settings";
import {
  createCallActionEvent,
  createServerCallCorrelationId,
  findStartedMobileCallByCorrelationId,
  isCallActionEventUniqueConflict,
  normalizeCallCorrelationId,
  parseCallClientEventAt,
  recordCallActionEventBestEffort,
  type CallActionName,
} from "@/lib/calls/call-action-audit";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";

export type CallRecordingActor = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

const mobileDeviceSchema = z.object({
  deviceFingerprint: z.string().trim().min(8, "设备指纹不能为空"),
  deviceModel: z.string().trim().max(120).optional().default(""),
  androidVersion: z.string().trim().max(60).optional().default(""),
  appVersion: z.string().trim().max(60).optional().default(""),
  recordingCapability: z.enum(MOBILE_RECORDING_CAPABILITIES).default("UNKNOWN"),
});

const mobileCallStartSchema = z.object({
  customerId: z.string().trim().min(1, "缺少客户信息"),
  callTime: z.string().trim().optional(),
  correlationId: z.string().trim().max(191).optional(),
  clientEventAt: z.string().trim().optional(),
  triggerSource: z.string().trim().max(80).optional(),
  deviceId: z.string().trim().max(191).optional(),
  deviceModel: z.string().trim().max(120).optional(),
  androidVersion: z.string().trim().max(60).optional(),
  appVersion: z.string().trim().max(60).optional(),
});

const mobileCallClientActionNames = [
  "call.native_dispatched",
  "call.native_permission_denied",
  "call.offhook_detected",
  "call.idle_detected",
  "call.recording_started",
  "call.recording_file_ready",
  "call.recording_unsupported",
  "call.recording_failed",
  "call.upload_failed",
] as const satisfies readonly CallActionName[];

const mobileCallEventSchema = z.object({
  action: z.enum(mobileCallClientActionNames),
  eventId: z.string().trim().max(191).optional(),
  clientEventAt: z.string().trim().optional(),
  deviceId: z.string().trim().max(191).optional(),
  deviceModel: z.string().trim().max(120).optional(),
  androidVersion: z.string().trim().max(60).optional(),
  appVersion: z.string().trim().max(60).optional(),
  recordingCapability: z.enum(MOBILE_RECORDING_CAPABILITIES).optional(),
  durationSeconds: z.coerce.number().int().min(0).max(24 * 60 * 60).optional(),
  failureCode: z.string().trim().max(120).optional(),
  failureMessage: z.string().trim().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const mobileCallEndSchema = z.object({
  durationSeconds: z.coerce
    .number()
    .int()
    .min(0, "通话时长不能小于 0")
    .max(24 * 60 * 60, "通话时长不能超过 24 小时"),
  result: z.string().trim().optional().default(""),
  remark: z.string().trim().max(1000, "备注不能超过 1000 个字符").optional().default(""),
  nextFollowUpAt: z.string().trim().optional().default(""),
});

const uploadSessionSchema = z.object({
  callRecordId: z.string().trim().min(1, "缺少通话记录"),
  deviceId: z.string().trim().optional().default(""),
  mimeType: z.string().trim().min(1, "缺少录音格式").max(120),
  codec: z.string().trim().max(80).optional().default(""),
  fileSizeBytes: z.coerce.number().int().positive("录音文件大小不正确"),
  durationSeconds: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60)
    .optional(),
  sha256: z.string().trim().max(128).optional().default(""),
  chunkSizeBytes: z.coerce.number().int().positive().optional(),
  totalChunks: z.coerce.number().int().positive("分片数量不正确"),
});

const chunkIndexSchema = z.coerce.number().int().min(0);

const qualityReviewSchema = z.object({
  reviewStatus: z.enum(CALL_QUALITY_REVIEW_STATUSES).default("REVIEWED"),
  manualScore: z.coerce.number().int().min(0).max(100).optional(),
  comment: z.string().trim().max(1000).optional().default(""),
});

const completedRecordingStatuses: CallRecordingStatus[] = [
  CallRecordingStatus.READY,
  CallRecordingStatus.PROCESSING,
  CallRecordingStatus.UPLOADED,
];

const playableRecordingStatuses: CallRecordingStatus[] = [
  CallRecordingStatus.UPLOADED,
  CallRecordingStatus.PROCESSING,
  CallRecordingStatus.READY,
];

function parseDateTimeInput(value: string, label: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label}格式不正确。`);
  }

  return parsed;
}

function mapWechatSyncActionToStatus(action: "NONE" | "PENDING" | "ADDED" | "REFUSED") {
  switch (action) {
    case "PENDING":
      return WechatAddStatus.PENDING;
    case "ADDED":
      return WechatAddStatus.ADDED;
    case "REFUSED":
      return WechatAddStatus.REJECTED;
    default:
      return null;
  }
}

function parseUploadedChunkIndexes(value: unknown) {
  if (!Array.isArray(value)) {
    return new Set<number>();
  }

  return new Set(
    value.filter(
      (item): item is number => Number.isInteger(item) && item >= 0,
    ),
  );
}

async function getActorTeamId(actor: CallRecordingActor) {
  if (actor.teamId !== undefined) {
    return actor.teamId ?? null;
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function assertUploadAccess(actor: CallRecordingActor, salesId: string) {
  if (!canUploadCallRecording(actor.role)) {
    throw new Error("当前角色不能上传通话录音。");
  }

  if (actor.role === "SALES" && salesId !== actor.id) {
    throw new Error("销售只能上传自己的通话录音。");
  }
}

export async function registerMobileDevice(
  actor: CallRecordingActor,
  rawInput: z.input<typeof mobileDeviceSchema>,
) {
  if (!canRegisterMobileDevice(actor.role)) {
    throw new Error("当前角色不能绑定移动设备。");
  }

  const parsed = mobileDeviceSchema.parse(rawInput);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const device = await tx.mobileDevice.upsert({
      where: {
        userId_deviceFingerprint: {
          userId: actor.id,
          deviceFingerprint: parsed.deviceFingerprint,
        },
      },
      create: {
        userId: actor.id,
        deviceFingerprint: parsed.deviceFingerprint,
        deviceModel: parsed.deviceModel || null,
        androidVersion: parsed.androidVersion || null,
        appVersion: parsed.appVersion || null,
        recordingCapability: parsed.recordingCapability,
        recordingEnabled: true,
        lastSeenAt: now,
      },
      update: {
        deviceModel: parsed.deviceModel || null,
        androidVersion: parsed.androidVersion || null,
        appVersion: parsed.appVersion || null,
        recordingCapability: parsed.recordingCapability,
        lastSeenAt: now,
      },
      select: {
        id: true,
        recordingEnabled: true,
        recordingCapability: true,
        disabledAt: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "mobile_device.registered",
        targetType: OperationTargetType.MOBILE_DEVICE,
        targetId: device.id,
        description: "移动端设备完成录音能力登记。",
        afterData: {
          deviceId: device.id,
          deviceModel: parsed.deviceModel || null,
          androidVersion: parsed.androidVersion || null,
          appVersion: parsed.appVersion || null,
          recordingCapability: parsed.recordingCapability,
          disabledAt: device.disabledAt,
        },
      },
    });

    return device;
  });
}

export async function startMobileCallSession(
  actor: CallRecordingActor,
  rawInput: z.input<typeof mobileCallStartSchema>,
) {
  if (!canUploadCallRecording(actor.role)) {
    throw new Error("当前角色不能发起移动端电话。");
  }

  const parsed = mobileCallStartSchema.parse(rawInput);
  const correlationId =
    normalizeCallCorrelationId(parsed.correlationId) ??
    createServerCallCorrelationId("local-phone");
  const clientEventAt = parseCallClientEventAt(parsed.clientEventAt);
  const triggerSource = parsed.triggerSource?.trim() || null;
  const deviceId = parsed.deviceId?.trim() || null;
  const deviceModel = parsed.deviceModel?.trim() || null;
  const androidVersion = parsed.androidVersion?.trim() || null;
  const appVersion = parsed.appVersion?.trim() || null;
  const actorTeamId = await getActorTeamId(actor);
  const customerScope = getCustomerScope(actor.role, actor.id, actorTeamId);

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
      owner: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!customer) {
    throw new Error("客户不存在，或你无权访问该客户。");
  }

  await assertCustomerNotInActiveRecycleBin(prisma, customer.id);

  if (actor.role === "SALES" && customer.ownerId !== actor.id) {
    await recordCallActionEventBestEffort({
      action: "call.intent_rejected",
      actorId: actor.id,
      correlationId,
      callMode: "local-phone",
      customerId: customer.id,
      salesId: actor.id,
      deviceId,
      appVersion,
      deviceModel,
      androidVersion,
      clientEventAt,
      failureCode: "OWNER_FORBIDDEN",
      failureMessage: "销售只能拨打自己负责的客户。",
      description: `本机通话请求被拒绝：${customer.name}`,
      metadata: { triggerSource },
    });

    throw new Error("销售只能拨打自己负责的客户。");
  }

  const salesId = actor.role === "SALES" ? actor.id : customer.ownerId ?? actor.id;
  const callTime = parsed.callTime
    ? parseDateTimeInput(parsed.callTime, "通话时间")
    : new Date();

  await recordCallActionEventBestEffort({
    action: "call.intent_requested",
    actorId: actor.id,
    correlationId,
    callMode: "local-phone",
    customerId: customer.id,
    salesId,
    deviceId,
    appVersion,
    deviceModel,
    androidVersion,
    clientEventAt,
    description: `本机通话请求：${customer.name}`,
    metadata: { triggerSource },
  });

  const existingStartedCall = await findStartedMobileCallByCorrelationId({
    correlationId,
    customerId: customer.id,
    salesId,
  });

  if (existingStartedCall) {
    return {
      callRecordId: existingStartedCall.id,
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      deviceId,
      correlationId,
      idempotent: true,
    };
  }

  let callRecord: { id: string };

  try {
    callRecord = await prisma.$transaction(async (tx) => {
    const created = await tx.callRecord.create({
      data: {
        customerId: customer.id,
        salesId,
        callTime,
        durationSeconds: 0,
      },
      select: {
        id: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "mobile_call.started",
        targetType: OperationTargetType.CALL_RECORD,
        targetId: created.id,
        description: `移动端发起电话：${customer.name} (${customer.phone})`,
        afterData: {
          callRecordId: created.id,
          customerId: customer.id,
          salesId,
          callTime,
          teamId: customer.owner?.teamId ?? actorTeamId,
        },
      },
    });

    await createCallActionEvent(tx, {
      action: "call.intent_authorized",
      dedupeKey: `start:local-phone:${correlationId}`,
      actorId: actor.id,
      correlationId,
      callMode: "local-phone",
      customerId: customer.id,
      salesId,
      callRecordId: created.id,
      deviceId,
      appVersion,
      deviceModel,
      androidVersion,
      clientEventAt,
      description: `本机通话请求已授权：${customer.name}`,
      metadata: {
        triggerSource,
        teamId: customer.owner?.teamId ?? actorTeamId,
        callTime: callTime.toISOString(),
      },
    });

    return created;
    });
  } catch (error) {
    if (isCallActionEventUniqueConflict(error)) {
      const existing = await findStartedMobileCallByCorrelationId({
        correlationId,
        customerId: customer.id,
        salesId,
      });

      if (existing) {
        return {
          callRecordId: existing.id,
          customerId: customer.id,
          customerName: customer.name,
          phone: customer.phone,
          deviceId,
          correlationId,
          idempotent: true,
        };
      }
    }

    throw error;
  }

  return {
    callRecordId: callRecord.id,
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    deviceId,
    correlationId,
    idempotent: false,
  };
}

function getEventFailureCode(input: z.infer<typeof mobileCallEventSchema>) {
  const explicit = input.failureCode?.trim();

  if (explicit) {
    return explicit;
  }

  switch (input.action) {
    case "call.native_permission_denied":
      return "NATIVE_PERMISSION_DENIED";
    case "call.recording_unsupported":
      return "RECORDING_UNSUPPORTED";
    case "call.recording_failed":
      return "RECORDING_FAILED";
    case "call.upload_failed":
      return "UPLOAD_FAILED";
    default:
      return null;
  }
}

function shouldMaterializeRecordingFailure(action: CallActionName) {
  return action === "call.recording_failed" || action === "call.recording_unsupported";
}

export async function recordMobileCallSessionEvent(
  actor: CallRecordingActor,
  callRecordId: string,
  rawInput: z.input<typeof mobileCallEventSchema>,
) {
  if (!canUploadCallRecording(actor.role)) {
    throw new Error("当前角色不能记录移动端通话事件。");
  }

  const parsed = mobileCallEventSchema.parse(rawInput);
  const callRecord = await prisma.callRecord.findUnique({
    where: { id: callRecordId },
    select: {
      id: true,
      customerId: true,
      salesId: true,
      durationSeconds: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      sales: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!callRecord?.customerId || !callRecord.customer) {
    throw new Error("通话记录不存在，或未关联客户。");
  }

  const customerId = callRecord.customerId;
  const customer = callRecord.customer;
  assertUploadAccess(actor, callRecord.salesId);

  const deviceId = parsed.deviceId?.trim() || null;
  const deviceModel = parsed.deviceModel?.trim() || null;
  const androidVersion = parsed.androidVersion?.trim() || null;
  const appVersion = parsed.appVersion?.trim() || null;
  const clientEventAt = parseCallClientEventAt(parsed.clientEventAt);
  const startEvent = await prisma.callActionEvent.findFirst({
    where: { callRecordId: callRecord.id },
    orderBy: [{ serverReceivedAt: "desc" }, { id: "desc" }],
    select: {
      correlationId: true,
      deviceId: true,
      appVersion: true,
      deviceModel: true,
      androidVersion: true,
    },
  });
  const resolvedDeviceId = deviceId ?? startEvent?.deviceId ?? null;
  const resolvedAppVersion = appVersion ?? startEvent?.appVersion ?? null;
  const resolvedDeviceModel = deviceModel ?? startEvent?.deviceModel ?? null;
  const resolvedAndroidVersion = androidVersion ?? startEvent?.androidVersion ?? null;
  const failureCode = getEventFailureCode(parsed);
  const failureMessage = parsed.failureMessage?.trim() || null;
  const teamId = callRecord.sales.teamId ?? (await getActorTeamId(actor));

  if (resolvedDeviceId) {
    const updated = await prisma.mobileDevice.updateMany({
      where: {
        id: resolvedDeviceId,
        userId: callRecord.salesId,
        disabledAt: null,
      },
      data: {
        lastSeenAt: new Date(),
        ...(parsed.recordingCapability
          ? { recordingCapability: parsed.recordingCapability }
          : {}),
        ...(resolvedDeviceModel ? { deviceModel: resolvedDeviceModel } : {}),
        ...(resolvedAndroidVersion ? { androidVersion: resolvedAndroidVersion } : {}),
        ...(resolvedAppVersion ? { appVersion: resolvedAppVersion } : {}),
      },
    });

    if (updated.count === 0) {
      throw new Error("移动设备不存在，或不属于该销售。");
    }
  }

  const event = await prisma.$transaction(async (tx) => {
    if (parsed.durationSeconds !== undefined) {
      await tx.callRecord.update({
        where: { id: callRecord.id },
        data: {
          durationSeconds: Math.max(callRecord.durationSeconds, parsed.durationSeconds),
        },
        select: { id: true },
      });
    }

    if (shouldMaterializeRecordingFailure(parsed.action)) {
      await tx.callRecording.upsert({
        where: { callRecordId: callRecord.id },
        create: {
          callRecordId: callRecord.id,
          customerId,
          salesId: callRecord.salesId,
          teamId,
          deviceId: resolvedDeviceId,
          status: CallRecordingStatus.FAILED,
          mimeType: "audio/unknown",
          durationSeconds: parsed.durationSeconds ?? callRecord.durationSeconds,
          failureCode,
          failureMessage,
        },
        update: {
          deviceId: resolvedDeviceId ?? undefined,
          status: CallRecordingStatus.FAILED,
          durationSeconds: parsed.durationSeconds ?? undefined,
          failureCode,
          failureMessage,
        },
        select: { id: true },
      });
    }

    return createCallActionEvent(tx, {
      action: parsed.action,
      dedupeKey: parsed.eventId
        ? `client-event:local-phone:${callRecord.id}:${parsed.eventId}`
        : null,
      actorId: actor.id,
      correlationId: startEvent?.correlationId ?? null,
      callMode: "local-phone",
      customerId,
      salesId: callRecord.salesId,
      callRecordId: callRecord.id,
      deviceId: resolvedDeviceId,
      appVersion: resolvedAppVersion,
      deviceModel: resolvedDeviceModel,
      androidVersion: resolvedAndroidVersion,
      clientEventAt,
      failureCode,
      failureMessage,
      description: `移动端通话事件：${customer.name}`,
      metadata: {
        ...(parsed.metadata ?? {}),
        action: parsed.action,
        eventId: parsed.eventId ?? null,
        durationSeconds: parsed.durationSeconds ?? null,
        recordingCapability: parsed.recordingCapability ?? null,
      },
    });
  });

  return {
    eventId: event.id,
    callRecordId: callRecord.id,
  };
}

export async function finishMobileCallSession(
  actor: CallRecordingActor,
  callRecordId: string,
  rawInput: z.input<typeof mobileCallEndSchema>,
) {
  if (!canUploadCallRecording(actor.role)) {
    throw new Error("当前角色不能结束移动端电话。");
  }

  const parsed = mobileCallEndSchema.parse(rawInput);
  const callRecord = await prisma.callRecord.findUnique({
    where: { id: callRecordId },
    select: {
      id: true,
      customerId: true,
      salesId: true,
      callTime: true,
      durationSeconds: true,
      result: true,
      resultCode: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!callRecord?.customer) {
    throw new Error("通话记录不存在，或未关联客户。");
  }

  const customer = callRecord.customer;

  assertUploadAccess(actor, callRecord.salesId);

  const resultDefinition = parsed.result
    ? await getEnabledCallResultDefinitionByCode(parsed.result)
    : null;

  if (parsed.result && !resultDefinition) {
    throw new Error("当前通话结果不存在或已停用。");
  }

  if (parsed.result && (callRecord.resultCode || callRecord.result)) {
    throw new Error("该通话已保存结果，不能重复写入。");
  }

  const nextFollowUpAt = parsed.nextFollowUpAt
    ? parseDateTimeInput(parsed.nextFollowUpAt, "下次跟进时间")
    : null;

  if (nextFollowUpAt && nextFollowUpAt < callRecord.callTime) {
    throw new Error("下次跟进时间不能早于通话时间。");
  }

  const legacyResult = resultDefinition
    ? mapCallResultCodeToLegacyEnum(resultDefinition.code)
    : undefined;
  const linkedWechatStatus = resultDefinition
    ? mapWechatSyncActionToStatus(resultDefinition.wechatSyncAction)
    : null;
  const durationSeconds = Math.max(callRecord.durationSeconds, parsed.durationSeconds);
  const startEvent = await prisma.callActionEvent.findFirst({
    where: { callRecordId: callRecord.id },
    orderBy: [{ serverReceivedAt: "desc" }, { id: "desc" }],
    select: {
      correlationId: true,
      deviceId: true,
      appVersion: true,
      deviceModel: true,
      androidVersion: true,
    },
  });

  await prisma.$transaction(async (tx) => {
    await tx.callRecord.update({
      where: { id: callRecord.id },
      data: {
        durationSeconds,
        ...(resultDefinition
          ? {
              result: legacyResult,
              resultCode: resultDefinition.code,
              remark: parsed.remark || null,
              nextFollowUpAt,
            }
          : {}),
      },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "mobile_call.ended",
        targetType: OperationTargetType.CALL_RECORD,
        targetId: callRecord.id,
        description: `移动端结束电话：${customer.name} (${customer.phone})`,
        afterData: {
          callRecordId: callRecord.id,
          customerId: customer.id,
          salesId: callRecord.salesId,
          durationSeconds,
          reportedDurationSeconds: parsed.durationSeconds,
          resultCode: resultDefinition?.code ?? null,
          resultLabel: resultDefinition?.label ?? null,
          nextFollowUpAt,
        },
      },
    });

    await createCallActionEvent(tx, {
      action: "call.followup_saved",
      actorId: actor.id,
      correlationId: startEvent?.correlationId ?? null,
      callMode: "local-phone",
      customerId: customer.id,
      salesId: callRecord.salesId,
      callRecordId: callRecord.id,
      deviceId: startEvent?.deviceId ?? null,
      appVersion: startEvent?.appVersion ?? null,
      deviceModel: startEvent?.deviceModel ?? null,
      androidVersion: startEvent?.androidVersion ?? null,
      description: `移动端通话跟进已保存：${customer.name} (${customer.phone})`,
      metadata: {
        durationSeconds,
        reportedDurationSeconds: parsed.durationSeconds,
        resultCode: resultDefinition?.code ?? null,
        resultLabel: resultDefinition?.label ?? null,
        nextFollowUpAt,
      },
    });

    if (linkedWechatStatus && resultDefinition) {
      const linkedWechatRecord = await tx.wechatRecord.create({
        data: {
          customerId: customer.id,
          salesId: callRecord.salesId,
          addedStatus: linkedWechatStatus,
          addedAt: linkedWechatStatus === WechatAddStatus.ADDED ? callRecord.callTime : null,
          summary: parsed.remark || "由移动端通话结果自动同步的微信跟进记录",
          nextFollowUpAt,
        },
        select: { id: true },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.WECHAT,
          action: "wechat_record.created_from_mobile_call_result",
          targetType: OperationTargetType.CUSTOMER,
          targetId: customer.id,
          description: `根据移动端通话结果同步微信记录：${customer.name} (${customer.phone})`,
          afterData: {
            wechatRecordId: linkedWechatRecord.id,
            customerId: customer.id,
            salesId: callRecord.salesId,
            fromCallRecordId: callRecord.id,
            fromResultCode: resultDefinition.code,
            fromResultLabel: resultDefinition.label,
            addedStatus: linkedWechatStatus,
            addedAt:
              linkedWechatStatus === WechatAddStatus.ADDED ? callRecord.callTime : null,
            nextFollowUpAt,
          },
        },
      });
    }
  });

  return {
    callRecordId: callRecord.id,
  };
}

export async function createRecordingUploadSession(
  actor: CallRecordingActor,
  rawInput: z.input<typeof uploadSessionSchema>,
) {
  const parsed = uploadSessionSchema.parse(rawInput);
  const config = await resolveRecordingStorageConfig();

  if (parsed.fileSizeBytes > config.maxFileBytes) {
    throw new Error("录音文件超过系统允许大小。");
  }

  const chunkSizeBytes = parsed.chunkSizeBytes ?? config.defaultChunkSizeBytes;
  const expectedChunks = Math.ceil(parsed.fileSizeBytes / chunkSizeBytes);

  if (expectedChunks !== parsed.totalChunks) {
    throw new Error("录音分片数量与文件大小不匹配。");
  }

  const callRecord = await prisma.callRecord.findUnique({
    where: { id: parsed.callRecordId },
    select: {
      id: true,
      customerId: true,
      salesId: true,
      durationSeconds: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          ownerId: true,
        },
      },
      sales: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!callRecord?.customerId || !callRecord.customer) {
    throw new Error("通话记录不存在，或未关联客户。");
  }

  const customerId = callRecord.customerId;
  const customer = callRecord.customer;

  assertUploadAccess(actor, callRecord.salesId);
  await assertCustomerNotInActiveRecycleBin(prisma, customerId);

  const deviceId = parsed.deviceId || null;

  if (deviceId) {
    const device = await prisma.mobileDevice.findFirst({
      where: {
        id: deviceId,
        userId: callRecord.salesId,
        disabledAt: null,
        recordingEnabled: true,
      },
      select: {
        id: true,
      },
    });

    if (!device) {
      throw new Error("移动设备不存在、已禁用或未开启录音。");
    }
  }

  await ensureRecordingStorageReady(config);

  const now = new Date();
  const teamId = callRecord.sales.teamId ?? (await getActorTeamId(actor));
  const startEvent = await prisma.callActionEvent.findFirst({
    where: { callRecordId: callRecord.id },
    orderBy: [{ serverReceivedAt: "desc" }, { id: "desc" }],
    select: {
      correlationId: true,
      appVersion: true,
      deviceModel: true,
      androidVersion: true,
    },
  });
  const storageKey = buildRecordingObjectKey({
    callRecordId: callRecord.id,
    salesId: callRecord.salesId,
    teamId,
    mimeType: parsed.mimeType,
    now,
  });
  const expiresAt = new Date(
    now.getTime() + config.uploadExpiresMinutes * 60 * 1000,
  );

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.callRecording.findUnique({
      where: { callRecordId: callRecord.id },
      select: {
        id: true,
        status: true,
      },
    });

    const recording =
      existing && !completedRecordingStatuses.includes(existing.status)
        ? await tx.callRecording.update({
            where: { id: existing.id },
            data: {
              customerId,
              salesId: callRecord.salesId,
              teamId,
              deviceId,
              status: CallRecordingStatus.UPLOADING,
              storageProvider: config.provider,
              storageBucket: config.bucket,
              storageKey,
              mimeType: parsed.mimeType,
              codec: parsed.codec || null,
              fileSizeBytes: parsed.fileSizeBytes,
              durationSeconds: parsed.durationSeconds ?? callRecord.durationSeconds,
              sha256: parsed.sha256 || null,
              retentionUntil: buildRetentionUntil(config, now),
              failureCode: null,
              failureMessage: null,
            },
            select: { id: true },
          })
        : existing
          ? null
          : await tx.callRecording.create({
              data: {
                callRecordId: callRecord.id,
                customerId,
                salesId: callRecord.salesId,
                teamId,
                deviceId,
                status: CallRecordingStatus.UPLOADING,
                storageProvider: config.provider,
                storageBucket: config.bucket,
                storageKey,
                mimeType: parsed.mimeType,
                codec: parsed.codec || null,
                fileSizeBytes: parsed.fileSizeBytes,
                durationSeconds: parsed.durationSeconds ?? callRecord.durationSeconds,
                sha256: parsed.sha256 || null,
                retentionUntil: buildRetentionUntil(config, now),
              },
              select: { id: true },
            });

    if (!recording) {
      throw new Error("该通话录音已经上传，不能重复覆盖。");
    }

    await tx.callRecordingUpload.updateMany({
      where: {
        recordingId: recording.id,
        status: {
          in: [
            CallRecordingUploadStatus.INITIATED,
            CallRecordingUploadStatus.UPLOADING,
          ],
        },
      },
      data: {
        status: CallRecordingUploadStatus.CANCELED,
      },
    });

    const upload = await tx.callRecordingUpload.create({
      data: {
        recordingId: recording.id,
        status: CallRecordingUploadStatus.INITIATED,
        chunkSizeBytes,
        totalChunks: parsed.totalChunks,
        totalSizeBytes: parsed.fileSizeBytes,
        sha256: parsed.sha256 || null,
        chunkStateJson: [],
        expiresAt,
      },
      select: {
        id: true,
        recordingId: true,
        chunkSizeBytes: true,
        totalChunks: true,
        expiresAt: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "call_recording.upload_started",
        targetType: OperationTargetType.CALL_RECORDING,
        targetId: recording.id,
        description: `开始上传通话录音：${customer.name} (${customer.phone})`,
        afterData: {
          callRecordId: callRecord.id,
          customerId,
          salesId: callRecord.salesId,
          teamId,
          uploadId: upload.id,
          storageProvider: config.provider,
          storageBucket: config.bucket,
          storageKey,
          mimeType: parsed.mimeType,
          fileSizeBytes: parsed.fileSizeBytes,
          totalChunks: parsed.totalChunks,
        },
      },
    });

    await createCallActionEvent(tx, {
      action: "call.upload_started",
      actorId: actor.id,
      correlationId: startEvent?.correlationId ?? null,
      callMode: "local-phone",
      customerId,
      salesId: callRecord.salesId,
      callRecordId: callRecord.id,
      deviceId,
      appVersion: startEvent?.appVersion ?? null,
      deviceModel: startEvent?.deviceModel ?? null,
      androidVersion: startEvent?.androidVersion ?? null,
      description: `开始上传通话录音：${customer.name} (${customer.phone})`,
      metadata: {
        recordingId: recording.id,
        uploadId: upload.id,
        teamId,
        storageProvider: config.provider,
        storageBucket: config.bucket,
        storageKey,
        mimeType: parsed.mimeType,
        fileSizeBytes: parsed.fileSizeBytes,
        totalChunks: parsed.totalChunks,
      },
    });

    return upload;
  });

  return result;
}

export async function uploadRecordingChunk(input: {
  actor: CallRecordingActor;
  uploadId: string;
  chunkIndex: string | number;
  bytes: Buffer;
  chunkSha256?: string | null;
}) {
  const chunkIndex = chunkIndexSchema.parse(input.chunkIndex);
  const config = await resolveRecordingStorageConfig();
  const upload = await prisma.callRecordingUpload.findUnique({
    where: { id: input.uploadId },
    select: {
      id: true,
      status: true,
      chunkSizeBytes: true,
      totalChunks: true,
      chunkStateJson: true,
      expiresAt: true,
      recording: {
        select: {
          id: true,
          salesId: true,
          storageProvider: true,
        },
      },
    },
  });

  if (!upload) {
    throw new Error("上传会话不存在。");
  }

  assertUploadAccess(input.actor, upload.recording.salesId);

  if (
    upload.status === CallRecordingUploadStatus.COMPLETED ||
    upload.status === CallRecordingUploadStatus.CANCELED
  ) {
    throw new Error("上传会话已经结束。");
  }

  if (upload.expiresAt.getTime() < Date.now()) {
    throw new Error("上传会话已过期。");
  }

  if (chunkIndex >= upload.totalChunks) {
    throw new Error("上传分片序号超出范围。");
  }

  if (input.bytes.length > upload.chunkSizeBytes) {
    throw new Error("上传分片超过约定大小。");
  }

  await writeUploadChunk({
    uploadId: upload.id,
    index: chunkIndex,
    bytes: input.bytes,
    expectedSha256: input.chunkSha256,
    config,
  });

  const uploadedIndexes = parseUploadedChunkIndexes(upload.chunkStateJson);
  uploadedIndexes.add(chunkIndex);
  const chunkStateJson = [...uploadedIndexes].sort((left, right) => left - right);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.callRecording.update({
      where: { id: upload.recording.id },
      data: { status: CallRecordingStatus.UPLOADING },
      select: { id: true },
    });

    return tx.callRecordingUpload.update({
      where: { id: upload.id },
      data: {
        status: CallRecordingUploadStatus.UPLOADING,
        uploadedChunks: chunkStateJson.length,
        chunkStateJson,
      },
      select: {
        id: true,
        uploadedChunks: true,
        totalChunks: true,
      },
    });
  });

  return updated;
}

export async function completeRecordingUpload(
  actor: CallRecordingActor,
  uploadId: string,
) {
  const config = await resolveRecordingStorageConfig();
  const upload = await prisma.callRecordingUpload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      status: true,
      totalChunks: true,
      uploadedChunks: true,
      chunkStateJson: true,
      sha256: true,
      expiresAt: true,
      recording: {
        select: {
          id: true,
          callRecordId: true,
          customerId: true,
          salesId: true,
          teamId: true,
          deviceId: true,
          storageKey: true,
          status: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!upload) {
    throw new Error("上传会话不存在。");
  }

  assertUploadAccess(actor, upload.recording.salesId);

  if (upload.status === CallRecordingUploadStatus.COMPLETED) {
    return {
      recordingId: upload.recording.id,
      status: upload.recording.status,
    };
  }

  if (upload.expiresAt.getTime() < Date.now()) {
    throw new Error("上传会话已过期。");
  }

  const uploadedIndexes = parseUploadedChunkIndexes(upload.chunkStateJson);

  if (
    uploadedIndexes.size !== upload.totalChunks ||
    upload.uploadedChunks !== upload.totalChunks
  ) {
    throw new Error("录音分片还没有全部上传。");
  }

  if (!upload.recording.storageKey) {
    throw new Error("录音存储路径缺失。");
  }

  const startEvent = await prisma.callActionEvent.findFirst({
    where: { callRecordId: upload.recording.callRecordId },
    orderBy: [{ serverReceivedAt: "desc" }, { id: "desc" }],
    select: {
      correlationId: true,
      appVersion: true,
      deviceModel: true,
      androidVersion: true,
    },
  });

  try {
    const assembled = await assembleUploadChunks({
      uploadId: upload.id,
      totalChunks: upload.totalChunks,
      storageKey: upload.recording.storageKey,
      expectedSha256: upload.sha256,
      config,
    });
    const workerConfig = await resolveCallAiWorkerRuntimeConfig();
    const aiEnabled = workerConfig.callAiWorkerEnabled;
    const completedAt = new Date();
    const recordingStatus = aiEnabled
      ? CallRecordingStatus.PROCESSING
      : CallRecordingStatus.READY;

    await prisma.$transaction(async (tx) => {
      await tx.callRecording.update({
        where: { id: upload.recording.id },
        data: {
          status: recordingStatus,
          fileSizeBytes: assembled.fileSizeBytes,
          sha256: assembled.sha256,
          uploadedAt: completedAt,
          failureCode: null,
          failureMessage: null,
        },
        select: { id: true },
      });

      await tx.callRecordingUpload.update({
        where: { id: upload.id },
        data: {
          status: CallRecordingUploadStatus.COMPLETED,
          completedAt,
          uploadedChunks: upload.totalChunks,
        },
        select: { id: true },
      });

      if (aiEnabled) {
        await tx.callAiAnalysis.upsert({
          where: { recordingId: upload.recording.id },
          create: {
            callRecordId: upload.recording.callRecordId,
            recordingId: upload.recording.id,
          },
          update: {
            status: "PENDING",
            failureMessage: null,
          },
          select: { id: true },
        });
      }

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.CALL,
          action: "call_recording.upload_completed",
          targetType: OperationTargetType.CALL_RECORDING,
          targetId: upload.recording.id,
          description: `完成通话录音上传：${upload.recording.customer.name} (${upload.recording.customer.phone})`,
          afterData: {
            recordingId: upload.recording.id,
            callRecordId: upload.recording.callRecordId,
            customerId: upload.recording.customerId,
            salesId: upload.recording.salesId,
            teamId: upload.recording.teamId,
            uploadId: upload.id,
            status: recordingStatus,
            fileSizeBytes: assembled.fileSizeBytes,
            sha256: assembled.sha256,
            aiEnabled,
            workerConfigSource: workerConfig.source,
          },
        },
      });

      await createCallActionEvent(tx, {
        action: "call.upload_completed",
        actorId: actor.id,
        correlationId: startEvent?.correlationId ?? null,
        callMode: "local-phone",
        customerId: upload.recording.customerId,
        salesId: upload.recording.salesId,
        callRecordId: upload.recording.callRecordId,
        deviceId: upload.recording.deviceId,
        appVersion: startEvent?.appVersion ?? null,
        deviceModel: startEvent?.deviceModel ?? null,
        androidVersion: startEvent?.androidVersion ?? null,
        description: `完成通话录音上传：${upload.recording.customer.name} (${upload.recording.customer.phone})`,
        metadata: {
          recordingId: upload.recording.id,
          uploadId: upload.id,
          teamId: upload.recording.teamId,
          status: recordingStatus,
          fileSizeBytes: assembled.fileSizeBytes,
          sha256: assembled.sha256,
          aiEnabled,
          workerConfigSource: workerConfig.source,
        },
      });
    });

    await removeUploadChunks(upload.id, config);

    return {
      recordingId: upload.recording.id,
      status: recordingStatus,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "录音上传完成失败。";

    await prisma.$transaction(async (tx) => {
      await tx.callRecording.update({
        where: { id: upload.recording.id },
        data: {
          status: CallRecordingStatus.FAILED,
          failureCode: "COMPLETE_FAILED",
          failureMessage: message,
        },
        select: { id: true },
      });

      await tx.callRecordingUpload.update({
        where: { id: upload.id },
        data: {
          status: CallRecordingUploadStatus.FAILED,
          failureMessage: message,
        },
        select: { id: true },
      });

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.CALL,
          action: "call_recording.upload_failed",
          targetType: OperationTargetType.CALL_RECORDING,
          targetId: upload.recording.id,
          description: `通话录音上传失败：${upload.recording.customer.name} (${upload.recording.customer.phone})`,
          afterData: {
            recordingId: upload.recording.id,
            callRecordId: upload.recording.callRecordId,
            uploadId: upload.id,
            failureMessage: message,
          },
        },
      });

      await createCallActionEvent(tx, {
        action: "call.upload_failed",
        actorId: actor.id,
        correlationId: startEvent?.correlationId ?? null,
        callMode: "local-phone",
        customerId: upload.recording.customerId,
        salesId: upload.recording.salesId,
        callRecordId: upload.recording.callRecordId,
        deviceId: upload.recording.deviceId,
        appVersion: startEvent?.appVersion ?? null,
        deviceModel: startEvent?.deviceModel ?? null,
        androidVersion: startEvent?.androidVersion ?? null,
        failureCode: "COMPLETE_FAILED",
        failureMessage: message,
        description: `通话录音上传失败：${upload.recording.customer.name} (${upload.recording.customer.phone})`,
        metadata: {
          recordingId: upload.recording.id,
          uploadId: upload.id,
          failureMessage: message,
        },
      });
    });

    throw error;
  }
}

export async function getRecordingAudioForPlayback(
  actor: CallRecordingActor,
  recordingId: string,
  options: {
    downloadOriginal?: boolean;
    byteRange?: RecordingByteRangeRequest | null;
  } = {},
) {
  if (!canPlaybackCallRecording(actor.role)) {
    throw new Error("当前角色不能播放通话录音。");
  }

  const scope = getCallRecordingScope(
    actor.role,
    actor.id,
    await getActorTeamId(actor),
  );

  if (!scope) {
    throw new Error("当前角色无权播放通话录音。");
  }

  const recording = await prisma.callRecording.findFirst({
    where: {
      id: recordingId,
      ...scope,
    },
    select: {
      id: true,
      callRecordId: true,
      customerId: true,
      salesId: true,
      status: true,
      storageProvider: true,
      storageKey: true,
      mimeType: true,
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!recording) {
    throw new Error("录音不存在，或你无权访问。");
  }

  if (!playableRecordingStatuses.includes(recording.status)) {
    throw new Error("录音尚不可播放。");
  }

  if (!recording.storageKey) {
    throw new Error("录音文件路径缺失。");
  }

  const storageKey = recording.storageKey;
  const config = await resolveRecordingStorageConfig();
  const audio =
    !options.downloadOriginal &&
    shouldTranscodeRecordingForBrowser(recording.mimeType)
      ? await transcodeRecordingForBrowser({
          recordingId: recording.id,
          storageKey,
          config,
          byteRange: options.byteRange,
        })
      : await (async () => {
          const stream = await openRecordingReadStream({
            storageKey,
            config,
            byteRange: options.byteRange,
          });

          return {
            ...stream,
            mimeType: recording.mimeType,
            filename: buildRecordingDownloadFilename(
              recording.id,
              recording.mimeType,
            ),
            transcoded: false,
          };
        })();

  await prisma.operationLog.create({
    data: {
      actorId: actor.id,
      module: OperationModule.CALL,
      action: "call_recording.played",
      targetType: OperationTargetType.CALL_RECORDING,
      targetId: recording.id,
      description: `播放通话录音：${recording.customer.name} (${recording.customer.phone})`,
      afterData: {
        recordingId: recording.id,
        callRecordId: recording.callRecordId,
        customerId: recording.customerId,
        salesId: recording.salesId,
        originalMimeType: recording.mimeType,
        playbackMimeType: audio.mimeType,
        transcoded: audio.transcoded,
        downloadOriginal: options.downloadOriginal ?? false,
      },
    },
  });

  return {
    ...audio,
    originalMimeType: recording.mimeType,
    browserPlayableOriginal: isBrowserPlayableRecordingMimeType(recording.mimeType),
  };
}

export async function saveCallQualityReview(
  actor: CallRecordingActor,
  recordingId: string,
  rawInput: z.input<typeof qualityReviewSchema>,
) {
  if (!canReviewCallRecording(actor.role)) {
    throw new Error("当前角色不能复核通话录音。");
  }

  const parsed = qualityReviewSchema.parse(rawInput);
  const scope = getCallRecordingScope(
    actor.role,
    actor.id,
    await getActorTeamId(actor),
  );

  if (!scope) {
    throw new Error("当前角色无权复核通话录音。");
  }

  const recording = await prisma.callRecording.findFirst({
    where: {
      id: recordingId,
      ...scope,
    },
    select: {
      id: true,
      callRecordId: true,
      customerId: true,
      aiAnalysis: {
        select: {
          qualityScore: true,
        },
      },
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!recording) {
    throw new Error("录音不存在，或你无权复核。");
  }

  const review = await prisma.$transaction(async (tx) => {
    const saved = await tx.callQualityReview.upsert({
      where: {
        recordingId_reviewerId: {
          recordingId: recording.id,
          reviewerId: actor.id,
        },
      },
      create: {
        callRecordId: recording.callRecordId,
        recordingId: recording.id,
        reviewerId: actor.id,
        aiScoreSnapshot: recording.aiAnalysis?.qualityScore ?? null,
        manualScore: parsed.manualScore ?? null,
        reviewStatus: parsed.reviewStatus,
        comment: parsed.comment || null,
      },
      update: {
        manualScore: parsed.manualScore ?? null,
        reviewStatus: parsed.reviewStatus,
        comment: parsed.comment || null,
      },
      select: {
        id: true,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.CALL,
        action: "call_quality_review.updated",
        targetType: OperationTargetType.CALL_QUALITY_REVIEW,
        targetId: saved.id,
        description: `复核通话录音：${recording.customer.name} (${recording.customer.phone})`,
        afterData: {
          reviewId: saved.id,
          recordingId: recording.id,
          callRecordId: recording.callRecordId,
          customerId: recording.customerId,
          reviewStatus: parsed.reviewStatus,
          manualScore: parsed.manualScore ?? null,
        },
      },
    });

    return saved;
  });

  return review;
}
