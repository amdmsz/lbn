import {
  CallAiAnalysisStatus,
  CallRecordingStatus,
  OperationModule,
  OperationTargetType,
  type Prisma,
} from "@prisma/client";
import {
  createCallAiProviderFromConfig,
  type CallAiProvider,
  type CallAiProviderContext,
  type ResolvedCallAiRuntimeConfig,
} from "@/lib/calls/call-ai-provider";
import {
  buildCallTranscriptDiarization,
  buildCallTranscriptJsonPayload,
} from "@/lib/calls/call-ai-diarization";
import {
  buildCallAiRuntimeConfigSnapshot,
  resolveCallAiRuntimeConfig,
  resolveCallAiWorkerRuntimeConfig,
} from "@/lib/calls/call-runtime-config";
import { shouldTranscodeRecordingForBrowser } from "@/lib/calls/recording-audio";
import { readTranscodedRecordingFileBuffer } from "@/lib/calls/recording-playback-transcode";
import {
  buildRecordingStorageConfigSnapshot,
  readRecordingFileBuffer,
  resolveRecordingStorageConfig,
  type ResolvedRecordingStorageConfig,
} from "@/lib/calls/recording-storage";
import { prisma } from "@/lib/db/prisma";

type CallAiWorkerLogger = {
  info: (payload: Record<string, unknown>) => void;
  warn: (payload: Record<string, unknown>) => void;
  error: (payload: Record<string, unknown>) => void;
};

type CallAiWorkerOptions = {
  limit: number;
  retryFailed?: boolean;
  dryRun?: boolean;
  enqueueMissing?: boolean;
  includeStaleInProgress?: boolean;
  staleInProgressMinutes?: number;
  actorId?: string | null;
  logger?: CallAiWorkerLogger;
};

type CallAiWorkerRow = NonNullable<
  Awaited<ReturnType<typeof loadPendingCallAiAnalyses>>[number]
>;

export type CallAiWorkerResult = {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  enqueuedCount: number;
  scannedCount: number;
  processedCount: number;
  failedCount: number;
  skippedCount: number;
};

const defaultLogger: CallAiWorkerLogger = {
  info(payload) {
    console.log(JSON.stringify(payload));
  },
  warn(payload) {
    console.warn(JSON.stringify(payload));
  },
  error(payload) {
    console.error(JSON.stringify(payload));
  },
};

const MIN_PLAYABLE_RECORDING_BYTES = 44;
const DEFAULT_STALE_IN_PROGRESS_MINUTES = 30;

function normalizeLimit(limit: number) {
  return Math.max(1, Math.min(50, Number.isFinite(limit) ? Math.floor(limit) : 5));
}

function normalizeStaleInProgressMinutes(minutes: number | undefined) {
  return Math.max(
    1,
    Math.min(
      24 * 60,
      Number.isFinite(minutes ?? NaN)
        ? Math.floor(minutes as number)
        : DEFAULT_STALE_IN_PROGRESS_MINUTES,
    ),
  );
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function loadPendingCallAiAnalyses(input: {
  limit: number;
  retryFailed?: boolean;
  includeStaleInProgress?: boolean;
  staleInProgressCutoff?: Date;
}) {
  const baseStatuses = input.retryFailed
    ? [CallAiAnalysisStatus.PENDING, CallAiAnalysisStatus.FAILED]
    : [CallAiAnalysisStatus.PENDING];
  const statusWhere: Prisma.CallAiAnalysisWhereInput =
    input.includeStaleInProgress && input.staleInProgressCutoff
      ? {
          OR: [
            {
              status: {
                in: baseStatuses,
              },
            },
            {
              status: {
                in: [
                  CallAiAnalysisStatus.TRANSCRIBING,
                  CallAiAnalysisStatus.ANALYZING,
                ],
              },
              updatedAt: {
                lt: input.staleInProgressCutoff,
              },
            },
          ],
        }
      : {
          status: {
            in: baseStatuses,
          },
        };

  return prisma.callAiAnalysis.findMany({
    where: {
      ...statusWhere,
      recording: {
        is: {
          status: {
            in: [
              CallRecordingStatus.PROCESSING,
              CallRecordingStatus.UPLOADED,
              CallRecordingStatus.READY,
            ],
          },
          storageKey: {
            not: null,
          },
          AND: [
            {
              OR: [{ durationSeconds: null }, { durationSeconds: { gt: 0 } }],
            },
            {
              OR: [
                { fileSizeBytes: null },
                { fileSizeBytes: { gt: MIN_PLAYABLE_RECORDING_BYTES } },
              ],
            },
          ],
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
    take: input.limit,
    select: {
      id: true,
      status: true,
      callRecordId: true,
      recordingId: true,
      recording: {
        select: {
          id: true,
          storageKey: true,
          mimeType: true,
          status: true,
          fileSizeBytes: true,
          durationSeconds: true,
          customerId: true,
          salesId: true,
          teamId: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
          sales: {
            select: {
              name: true,
              username: true,
            },
          },
        },
      },
      callRecord: {
        select: {
          id: true,
          callTime: true,
          durationSeconds: true,
          resultCode: true,
          remark: true,
        },
      },
    },
  });
}

async function loadMissingCallAiAnalysisRecordings(limit: number) {
  return prisma.callRecording.findMany({
    where: {
      status: {
        in: [
          CallRecordingStatus.PROCESSING,
          CallRecordingStatus.UPLOADED,
          CallRecordingStatus.READY,
        ],
      },
      storageKey: {
        not: null,
      },
      AND: [
        {
          OR: [{ durationSeconds: null }, { durationSeconds: { gt: 0 } }],
        },
        {
          OR: [
            { fileSizeBytes: null },
            { fileSizeBytes: { gt: MIN_PLAYABLE_RECORDING_BYTES } },
          ],
        },
      ],
      aiAnalysis: {
        is: null,
      },
    },
    orderBy: [{ createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      callRecordId: true,
      customerId: true,
      salesId: true,
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });
}

async function enqueueMissingCallAiAnalyses(input: {
  limit: number;
  actorId?: string | null;
  logger: CallAiWorkerLogger;
}) {
  const rows = await loadMissingCallAiAnalysisRecordings(input.limit);

  for (const row of rows) {
    await prisma.$transaction(async (tx) => {
      await tx.callAiAnalysis.upsert({
        where: { recordingId: row.id },
        create: {
          callRecordId: row.callRecordId,
          recordingId: row.id,
        },
        update: {
          status: CallAiAnalysisStatus.PENDING,
          failureMessage: null,
        },
        select: { id: true },
      });

      await tx.callRecording.updateMany({
        where: {
          id: row.id,
          status: {
            in: [CallRecordingStatus.UPLOADED, CallRecordingStatus.READY],
          },
        },
        data: {
          status: CallRecordingStatus.PROCESSING,
        },
      });

      await tx.operationLog.create({
        data: {
          actorId: input.actorId || null,
          module: OperationModule.CALL,
          action: "call_ai.analysis_enqueued",
          targetType: OperationTargetType.CALL_RECORDING,
          targetId: row.id,
          description: `通话录音加入 AI 队列：${row.customer.name} (${row.customer.phone})`,
          afterData: {
            recordingId: row.id,
            callRecordId: row.callRecordId,
            customerId: row.customerId,
            salesId: row.salesId,
          },
        },
      });
    });

    input.logger.info({
      event: "call_ai.enqueued",
      recordingId: row.id,
      callRecordId: row.callRecordId,
    });
  }

  return rows.length;
}

async function logMissingCallAiAnalysisCandidates(input: {
  limit: number;
  logger: CallAiWorkerLogger;
}) {
  const rows = await loadMissingCallAiAnalysisRecordings(input.limit);

  for (const row of rows) {
    input.logger.info({
      event: "call_ai.enqueue_missing_candidate",
      recordingId: row.id,
      callRecordId: row.callRecordId,
      customerId: row.customerId,
      salesId: row.salesId,
    });
  }

  return rows.length;
}

function buildProviderContext(row: CallAiWorkerRow): CallAiProviderContext {
  return {
    recordingId: row.recordingId,
    callRecordId: row.callRecordId,
    customerName: row.recording.customer.name,
    customerPhone: row.recording.customer.phone,
    salesName: row.recording.sales.name || row.recording.sales.username,
    callTime: row.callRecord.callTime,
    durationSeconds: row.recording.durationSeconds ?? row.callRecord.durationSeconds,
    callRemark: row.callRecord.remark,
    callResultCode: row.callRecord.resultCode,
  };
}

async function readTranscriptionAudioFile(input: {
  recordingId: string;
  storageKey: string;
  mimeType: string;
  storageConfig: ResolvedRecordingStorageConfig;
}) {
  if (shouldTranscodeRecordingForBrowser(input.mimeType)) {
    return readTranscodedRecordingFileBuffer({
      recordingId: input.recordingId,
      storageKey: input.storageKey,
      config: input.storageConfig,
    });
  }

  const file = await readRecordingFileBuffer({
    storageKey: input.storageKey,
    config: input.storageConfig,
  });

  return {
    bytes: file.bytes,
    filename: file.filename,
    mimeType: input.mimeType,
    storageKey: input.storageKey,
    transcoded: false,
  };
}

async function markAnalysisFailed(input: {
  row: CallAiWorkerRow;
  actorId?: string | null;
  message: string;
  runtimeSnapshot?: Prisma.InputJsonValue;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.callAiAnalysis.update({
      where: { id: input.row.id },
      data: {
        status: CallAiAnalysisStatus.FAILED,
        failureMessage: input.message,
      },
      select: { id: true },
    });

    await tx.callRecording.updateMany({
      where: {
        id: input.row.recordingId,
        status: CallRecordingStatus.PROCESSING,
      },
      data: {
        status: CallRecordingStatus.READY,
      },
    });

    await tx.operationLog.create({
      data: {
        actorId: input.actorId || null,
        module: OperationModule.CALL,
        action: "call_ai.analysis_failed",
        targetType: OperationTargetType.CALL_AI_ANALYSIS,
        targetId: input.row.id,
        description: `通话 AI 处理失败：${input.row.recording.customer.name} (${input.row.recording.customer.phone})`,
        afterData: {
          recordingId: input.row.recordingId,
          callRecordId: input.row.callRecordId,
          failureMessage: input.message,
          runtime: input.runtimeSnapshot ?? null,
        },
      },
    });
  });
}

async function processCallAiAnalysis(input: {
  row: CallAiWorkerRow;
  provider: CallAiProvider;
  aiConfig: ResolvedCallAiRuntimeConfig;
  storageConfig: ResolvedRecordingStorageConfig;
  runtimeSnapshot: Prisma.InputJsonValue;
  actorId?: string | null;
  logger: CallAiWorkerLogger;
}) {
  const { row, provider, storageConfig, runtimeSnapshot, actorId, logger } =
    input;
  const storageKey = row.recording.storageKey;

  if (!storageKey) {
    throw new Error("录音文件路径缺失。");
  }

  const context = buildProviderContext(row);

  await prisma.$transaction(async (tx) => {
    await tx.callAiAnalysis.update({
      where: { id: row.id },
      data: {
        status: CallAiAnalysisStatus.TRANSCRIBING,
        failureMessage: null,
      },
      select: { id: true },
    });

    await tx.callRecording.update({
      where: { id: row.recordingId },
      data: { status: CallRecordingStatus.PROCESSING },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actorId || null,
        module: OperationModule.CALL,
        action: "call_ai.transcription_started",
        targetType: OperationTargetType.CALL_AI_ANALYSIS,
        targetId: row.id,
        description: `开始通话 AI 转写：${row.recording.customer.name} (${row.recording.customer.phone})`,
        afterData: {
          recordingId: row.recordingId,
          callRecordId: row.callRecordId,
          provider: provider.providerName,
          runtime: runtimeSnapshot,
        },
      },
    });
  });

  const file = await readTranscriptionAudioFile({
    recordingId: row.recordingId,
    storageKey,
    mimeType: row.recording.mimeType,
    storageConfig,
  });

  if (file.bytes.length <= MIN_PLAYABLE_RECORDING_BYTES) {
    throw new Error("录音文件为空或未产生有效音频，已跳过 AI 分析。");
  }

  const transcription = await provider.transcribe({
    audio: file.bytes,
    filename: file.filename,
    mimeType: file.mimeType,
    storageKey: file.storageKey,
    context,
  });
  const initialDiarization = buildCallTranscriptDiarization({
    transcriptText: transcription.text,
    transcriptRaw: transcription.raw,
    config: input.aiConfig.diarization,
  });
  const initialTranscriptJson = buildCallTranscriptJsonPayload({
    raw: transcription.raw,
    diarization: initialDiarization,
  });

  await prisma.$transaction(async (tx) => {
    await tx.callAiAnalysis.update({
      where: { id: row.id },
      data: {
        status: CallAiAnalysisStatus.ANALYZING,
        transcriptText: transcription.text,
        transcriptJson: toPrismaJson(initialTranscriptJson),
        modelProvider: transcription.modelProvider,
        modelName: transcription.modelName,
        failureMessage: null,
      },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actorId || null,
        module: OperationModule.CALL,
        action: "call_ai.transcription_completed",
        targetType: OperationTargetType.CALL_AI_ANALYSIS,
        targetId: row.id,
        description: `完成通话 AI 转写：${row.recording.customer.name} (${row.recording.customer.phone})`,
        afterData: {
          recordingId: row.recordingId,
          callRecordId: row.callRecordId,
          provider: transcription.modelProvider,
          modelName: transcription.modelName,
          transcriptLength: transcription.text.length,
          originalMimeType: row.recording.mimeType,
          asrInputMimeType: file.mimeType,
          asrInputFilename: file.filename,
          asrInputTranscoded: file.transcoded,
          diarizationSource: initialDiarization.source,
          diarizationSegmentCount: initialDiarization.segmentCount,
          runtime: runtimeSnapshot,
        },
      },
    });
  });

  const analysis = await provider.analyze({
    transcriptText: transcription.text,
    transcriptRaw: transcription.raw,
    context,
  });
  const finalDiarization = buildCallTranscriptDiarization({
    transcriptText: transcription.text,
    transcriptRaw: transcription.raw,
    analysisSegments: analysis.dialogueSegments,
    config: input.aiConfig.diarization,
  });
  const finalTranscriptJson = buildCallTranscriptJsonPayload({
    raw: transcription.raw,
    diarization: finalDiarization,
  });
  const processedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.callAiAnalysis.update({
      where: { id: row.id },
      data: {
        status: CallAiAnalysisStatus.READY,
        summary: analysis.summary,
        customerIntent: analysis.customerIntent,
        sentiment: analysis.sentiment,
        qualityScore: analysis.qualityScore,
        riskFlagsJson: toPrismaJson(analysis.riskFlags),
        opportunityTagsJson: toPrismaJson(analysis.opportunityTags),
        keywordsJson: toPrismaJson(analysis.keywords),
        nextActionSuggestion: analysis.nextActionSuggestion,
        transcriptJson: toPrismaJson(finalTranscriptJson),
        modelProvider: analysis.modelProvider,
        modelName: analysis.modelName,
        modelVersion: analysis.modelVersion,
        processedAt,
        failureMessage: null,
      },
      select: { id: true },
    });

    await tx.callRecording.update({
      where: { id: row.recordingId },
      data: { status: CallRecordingStatus.READY },
      select: { id: true },
    });

    await tx.operationLog.create({
      data: {
        actorId: actorId || null,
        module: OperationModule.CALL,
        action: "call_ai.analysis_completed",
        targetType: OperationTargetType.CALL_AI_ANALYSIS,
        targetId: row.id,
        description: `完成通话 AI 分析：${row.recording.customer.name} (${row.recording.customer.phone})`,
        afterData: {
          recordingId: row.recordingId,
          callRecordId: row.callRecordId,
          provider: analysis.modelProvider,
          modelName: analysis.modelName,
          qualityScore: analysis.qualityScore,
          customerIntent: analysis.customerIntent,
          diarizationSource: finalDiarization.source,
          diarizationSegmentCount: finalDiarization.segmentCount,
          runtime: runtimeSnapshot,
        },
      },
    });
  });

  logger.info({
    event: "call_ai.processed",
    analysisId: row.id,
    recordingId: row.recordingId,
    callRecordId: row.callRecordId,
    provider: provider.providerName,
    originalMimeType: row.recording.mimeType,
    asrInputMimeType: file.mimeType,
    asrInputTranscoded: file.transcoded,
  });
}

export async function runCallAiAnalysisBatch(
  options: CallAiWorkerOptions,
): Promise<CallAiWorkerResult> {
  const startedAt = new Date();
  const logger = options.logger ?? defaultLogger;
  const limit = normalizeLimit(options.limit);
  const staleInProgressMinutes = normalizeStaleInProgressMinutes(
    options.staleInProgressMinutes,
  );
  const includeStaleInProgress = options.includeStaleInProgress ?? true;
  const staleInProgressCutoff = new Date(
    Date.now() - staleInProgressMinutes * 60 * 1000,
  );
  const workerConfig = await resolveCallAiWorkerRuntimeConfig();

  if (!workerConfig.callAiWorkerEnabled && !options.dryRun) {
    logger.warn({
      event: "call_ai.worker_disabled",
      source: workerConfig.source,
    });

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      dryRun: false,
      enqueuedCount: 0,
      scannedCount: 0,
      processedCount: 0,
      failedCount: 0,
      skippedCount: 0,
    };
  }

  const enqueuedCount = options.enqueueMissing
    ? options.dryRun
      ? await logMissingCallAiAnalysisCandidates({ limit, logger })
      : await enqueueMissingCallAiAnalyses({
          limit,
          actorId: options.actorId,
          logger,
        })
    : 0;
  const rows = await loadPendingCallAiAnalyses({
    limit,
    retryFailed: options.retryFailed,
    includeStaleInProgress,
    staleInProgressCutoff,
  });

  if (options.dryRun) {
    for (const row of rows) {
      logger.info({
        event: "call_ai.dry_run_candidate",
        analysisId: row.id,
        analysisStatus: row.status,
        recordingId: row.recordingId,
        callRecordId: row.callRecordId,
        recordingStatus: row.recording.status,
        staleInProgressCutoff: includeStaleInProgress
          ? staleInProgressCutoff.toISOString()
          : null,
      });
    }

    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      dryRun: true,
      enqueuedCount: options.enqueueMissing ? 0 : enqueuedCount,
      scannedCount: rows.length,
      processedCount: 0,
      failedCount: 0,
      skippedCount: 0,
    };
  }

  let processedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  if (rows.length === 0) {
    return {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      dryRun: false,
      enqueuedCount,
      scannedCount: 0,
      processedCount,
      failedCount,
      skippedCount,
    };
  }

  const [aiConfig, storageConfig] = await Promise.all([
    resolveCallAiRuntimeConfig(),
    resolveRecordingStorageConfig(),
  ]);
  const runtimeSnapshot = toPrismaJson({
    callAi: buildCallAiRuntimeConfigSnapshot(aiConfig),
    recordingStorage: buildRecordingStorageConfigSnapshot(storageConfig),
    worker: {
      source: workerConfig.source,
      callAiWorkerEnabled: workerConfig.callAiWorkerEnabled,
      callAiWorkerConcurrency: workerConfig.callAiWorkerConcurrency,
      callAiRetryLimit: workerConfig.callAiRetryLimit,
      staleInProgressMinutes,
      includeStaleInProgress,
    },
  });
  const provider = createCallAiProviderFromConfig(aiConfig);

  for (const row of rows) {
    try {
      await processCallAiAnalysis({
        row,
        provider,
        aiConfig,
        storageConfig,
        runtimeSnapshot,
        actorId: options.actorId,
        logger,
      });
      processedCount += 1;
    } catch (error) {
      failedCount += 1;
      const message =
        error instanceof Error ? error.message : "通话 AI 处理失败。";

      logger.error({
        event: "call_ai.failed",
        analysisId: row.id,
        recordingId: row.recordingId,
        callRecordId: row.callRecordId,
        message,
      });

      try {
        await markAnalysisFailed({
          row,
          actorId: options.actorId,
          message,
          runtimeSnapshot,
        });
      } catch (markError) {
        skippedCount += 1;
        logger.error({
          event: "call_ai.mark_failed_error",
          analysisId: row.id,
          message:
            markError instanceof Error
              ? markError.message
              : "AI 失败状态写入失败。",
        });
      }
    }
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    dryRun: false,
    enqueuedCount,
    scannedCount: rows.length,
    processedCount,
    failedCount,
    skippedCount,
  };
}
