import { promises as fs } from "node:fs";
import path from "node:path";
import {
  CallRecordingStatus,
  OperationModule,
  OperationTargetType,
  type Prisma,
} from "@prisma/client";
import { buildRetentionUntil } from "@/lib/calls/recording-storage";
import {
  resolveCallAiWorkerRuntimeConfig,
} from "@/lib/calls/call-runtime-config";
import {
  resolveRecordingStorageConfig,
  resolveRecordingStoragePath,
  type ResolvedRecordingStorageConfig,
} from "@/lib/calls/recording-storage";
import { maskPhoneForAudit } from "@/lib/outbound-calls/metadata";

type RecordingImportSession = {
  id: string;
  callRecordId: string;
  customerId: string;
  salesId: string;
  teamId: string | null;
  customer: {
    name: string;
    phone: string;
  };
};

type RecordingImportEvent = {
  recordingUrl?: string | null;
  recordingPath?: string | null;
  recordingStorageKey?: string | null;
  recordingExternalId?: string | null;
  recordingMimeType?: string | null;
  recordingCodec?: string | null;
  durationSeconds?: number | null;
  eventAt: Date;
};

type RecordingImportRuntime = {
  storageConfig: ResolvedRecordingStorageConfig;
  aiEnabled: boolean;
};

const MIN_PLAYABLE_WAV_BYTES = 44;

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function decodeFileUrl(value: string) {
  if (!value.startsWith("file://")) {
    return value;
  }

  try {
    return decodeURIComponent(new URL(value).pathname);
  } catch {
    return value.replace(/^file:\/\//, "");
  }
}

function normalizeStorageKey(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isProbablyHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function resolveStorageKey(input: {
  event: RecordingImportEvent;
  storageConfig: ResolvedRecordingStorageConfig;
}) {
  const explicitStorageKey = normalizeOptional(input.event.recordingStorageKey);

  if (explicitStorageKey) {
    return normalizeStorageKey(explicitStorageKey);
  }

  const rawLocation =
    normalizeOptional(input.event.recordingPath) ??
    normalizeOptional(input.event.recordingUrl);

  if (!rawLocation || isProbablyHttpUrl(rawLocation)) {
    return null;
  }

  const decodedPath = decodeFileUrl(rawLocation);
  const storageDir = path.resolve(input.storageConfig.storageDir);
  const absolutePath = path.resolve(decodedPath);

  if (absolutePath === storageDir || absolutePath.startsWith(`${storageDir}${path.sep}`)) {
    return normalizeStorageKey(path.relative(storageDir, absolutePath));
  }

  if (!path.isAbsolute(decodedPath)) {
    return normalizeStorageKey(decodedPath);
  }

  return null;
}

async function getRecordingFileStat(input: {
  storageKey: string | null;
  storageConfig: ResolvedRecordingStorageConfig;
}) {
  if (!input.storageKey) {
    return null;
  }

  try {
    const absolutePath = resolveRecordingStoragePath({
      storageKey: input.storageKey,
      config: input.storageConfig,
    });
    return await fs.stat(absolutePath);
  } catch {
    return null;
  }
}

function getRecordingImportSkipReason(input: {
  storageKey: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
}) {
  if (!input.storageKey) {
    return {
      code: "RECORDING_PATH_UNMAPPED",
      message: "外呼回调已收到录音位置，但无法映射到 CRM 录音存储路径。",
    };
  }

  if (input.durationSeconds !== null && input.durationSeconds <= 0) {
    return {
      code: "RECORDING_NO_EFFECTIVE_TALK_TIME",
      message: "外呼未产生有效通话时长，不导入录音。",
    };
  }

  if (input.fileSizeBytes === null) {
    return {
      code: "RECORDING_FILE_MISSING",
      message: "外呼录音文件不存在或暂不可读。",
    };
  }

  if (input.fileSizeBytes <= MIN_PLAYABLE_WAV_BYTES) {
    return {
      code: "RECORDING_FILE_EMPTY",
      message: "外呼录音文件为空，不导入录音。",
    };
  }

  return null;
}

export async function resolveOutboundRecordingImportRuntime(): Promise<RecordingImportRuntime> {
  const [storageConfig, workerConfig] = await Promise.all([
    resolveRecordingStorageConfig(),
    resolveCallAiWorkerRuntimeConfig(),
  ]);

  return {
    storageConfig,
    aiEnabled: workerConfig.callAiWorkerEnabled,
  };
}

export async function upsertOutboundCallRecordingFromWebhook(input: {
  tx: Prisma.TransactionClient;
  session: RecordingImportSession;
  event: RecordingImportEvent;
  runtime: RecordingImportRuntime;
}) {
  const storageKey = resolveStorageKey({
    event: input.event,
    storageConfig: input.runtime.storageConfig,
  });
  const fileStat = await getRecordingFileStat({
    storageKey,
    storageConfig: input.runtime.storageConfig,
  });
  const now = input.event.eventAt;
  const mimeType = input.event.recordingMimeType || "audio/wav";
  const durationSeconds = input.event.durationSeconds ?? null;
  const skipReason = getRecordingImportSkipReason({
    storageKey,
    durationSeconds,
    fileSizeBytes: fileStat?.size ?? null,
  });

  if (skipReason) {
    await input.tx.operationLog.create({
      data: {
        actorId: null,
        module: OperationModule.CALL,
        action: "call_recording.import_from_cti_skipped",
        targetType: OperationTargetType.OUTBOUND_CALL_SESSION,
        targetId: input.session.id,
        description: `外呼录音未导入：${input.session.customer.name} (${maskPhoneForAudit(input.session.customer.phone)})`,
        afterData: toPrismaJson({
          sessionId: input.session.id,
          callRecordId: input.session.callRecordId,
          customerId: input.session.customerId,
          salesId: input.session.salesId,
          teamId: input.session.teamId,
          storageProvider: input.runtime.storageConfig.provider,
          storageDir: input.runtime.storageConfig.storageDir,
          storageKey,
          recordingUrl: input.event.recordingUrl ?? null,
          recordingPath: input.event.recordingPath ?? null,
          recordingExternalId: input.event.recordingExternalId ?? null,
          mimeType,
          fileSizeBytes: fileStat?.size ?? null,
          durationSeconds,
          skipCode: skipReason.code,
          skipMessage: skipReason.message,
        }),
      },
    });

    return {
      recordingId: null,
      imported: false,
      skipped: true,
      skipCode: skipReason.code,
      storageKey,
      aiEnqueued: false,
    };
  }

  const recordingStatus = input.runtime.aiEnabled
    ? CallRecordingStatus.PROCESSING
    : CallRecordingStatus.READY;

  const recording = await input.tx.callRecording.upsert({
    where: {
      callRecordId: input.session.callRecordId,
    },
    create: {
      callRecordId: input.session.callRecordId,
      customerId: input.session.customerId,
      salesId: input.session.salesId,
      teamId: input.session.teamId,
      status: recordingStatus,
      storageProvider: input.runtime.storageConfig.provider,
      storageBucket: input.runtime.storageConfig.bucket,
      storageKey,
      mimeType,
      codec: input.event.recordingCodec || null,
      fileSizeBytes: fileStat?.size ?? null,
      durationSeconds,
      uploadedAt: now,
      retentionUntil: buildRetentionUntil(input.runtime.storageConfig, now),
      failureCode: null,
      failureMessage: null,
    },
    update: {
      customerId: input.session.customerId,
      salesId: input.session.salesId,
      teamId: input.session.teamId,
      status: recordingStatus,
      storageProvider: input.runtime.storageConfig.provider,
      storageBucket: input.runtime.storageConfig.bucket,
      storageKey,
      mimeType,
      codec: input.event.recordingCodec || null,
      fileSizeBytes: fileStat?.size ?? null,
      durationSeconds,
      uploadedAt: now,
      retentionUntil: buildRetentionUntil(input.runtime.storageConfig, now),
      failureCode: null,
      failureMessage: null,
    },
    select: {
      id: true,
    },
  });

  if (input.runtime.aiEnabled) {
    await input.tx.callAiAnalysis.upsert({
      where: { recordingId: recording.id },
      create: {
        callRecordId: input.session.callRecordId,
        recordingId: recording.id,
      },
      update: {
        status: "PENDING",
        failureMessage: null,
      },
      select: { id: true },
    });
  }

  await input.tx.operationLog.create({
    data: {
      actorId: null,
      module: OperationModule.CALL,
      action: "call_recording.imported_from_cti",
      targetType: OperationTargetType.CALL_RECORDING,
      targetId: recording.id,
      description: `外呼录音已进入 CRM：${input.session.customer.name} (${maskPhoneForAudit(input.session.customer.phone)})`,
      afterData: toPrismaJson({
        recordingId: recording.id,
        sessionId: input.session.id,
        callRecordId: input.session.callRecordId,
        customerId: input.session.customerId,
        salesId: input.session.salesId,
        teamId: input.session.teamId,
        storageProvider: input.runtime.storageConfig.provider,
        storageDir: input.runtime.storageConfig.storageDir,
        storageKey,
        recordingUrl: input.event.recordingUrl ?? null,
        recordingPath: input.event.recordingPath ?? null,
        recordingExternalId: input.event.recordingExternalId ?? null,
        mimeType,
        fileSizeBytes: fileStat?.size ?? null,
        durationSeconds,
        aiEnabled: input.runtime.aiEnabled,
      }),
    },
  });

  return {
    recordingId: recording.id,
    imported: true,
    storageKey,
    aiEnqueued: input.runtime.aiEnabled,
  };
}
