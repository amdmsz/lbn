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
  const readyForPlayback = Boolean(storageKey);
  const recordingStatus = readyForPlayback
    ? input.runtime.aiEnabled
      ? CallRecordingStatus.PROCESSING
      : CallRecordingStatus.READY
    : CallRecordingStatus.FAILED;
  const failureMessage = readyForPlayback
    ? null
    : "外呼回调已收到录音位置，但无法映射到 CRM 录音存储路径。";

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
      fileSizeBytes: readyForPlayback ? fileStat?.size ?? null : null,
      durationSeconds,
      uploadedAt: now,
      retentionUntil: buildRetentionUntil(input.runtime.storageConfig, now),
      failureCode: readyForPlayback ? null : "RECORDING_PATH_UNMAPPED",
      failureMessage,
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
      fileSizeBytes: readyForPlayback ? fileStat?.size ?? null : null,
      durationSeconds,
      uploadedAt: now,
      retentionUntil: buildRetentionUntil(input.runtime.storageConfig, now),
      failureCode: readyForPlayback ? null : "RECORDING_PATH_UNMAPPED",
      failureMessage,
    },
    select: {
      id: true,
    },
  });

  if (readyForPlayback && input.runtime.aiEnabled) {
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
      action: readyForPlayback
        ? "call_recording.imported_from_cti"
        : "call_recording.import_from_cti_failed",
      targetType: OperationTargetType.CALL_RECORDING,
      targetId: recording.id,
      description: readyForPlayback
        ? `外呼录音已进入 CRM：${input.session.customer.name} (${maskPhoneForAudit(input.session.customer.phone)})`
        : `外呼录音导入失败：${input.session.customer.name} (${maskPhoneForAudit(input.session.customer.phone)})`,
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
        failureMessage,
      }),
    },
  });

  return {
    recordingId: recording.id,
    imported: readyForPlayback,
    storageKey,
    aiEnqueued: readyForPlayback && input.runtime.aiEnabled,
  };
}
