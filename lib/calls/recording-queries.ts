import {
  CallAiAnalysisStatus,
  CallRecordingStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import {
  canAccessCallRecordingModule,
  getCallRecordingScope,
} from "@/lib/auth/access";
import {
  extractStoredCallTranscriptSegments,
  type CallTranscriptSegment,
} from "@/lib/calls/call-ai-diarization";
import {
  CALL_AI_ANALYSIS_STATUSES,
  CALL_RECORDING_STATUSES,
  isCallAiAnalysisStatus,
  isCallRecordingStatus,
} from "@/lib/calls/recording-metadata";
import { hydrateCallResultLabels } from "@/lib/calls/settings";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type CallRecordingViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

export type CallRecordingWorkbenchFilters = {
  search: string;
  salesId: string;
  status: string;
  aiStatus: string;
  from: string;
  to: string;
  minScore: string;
  maxScore: string;
};

export type CallRecordingWorkbenchItem = {
  id: string;
  status: string;
  createdAt: Date;
  uploadedAt: Date | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  mimeType: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  sales: {
    id: string;
    name: string;
    username: string;
  };
  callRecord: {
    id: string;
    callTime: Date;
    durationSeconds: number;
    resultCode: string | null;
    resultLabel: string;
    remark: string | null;
  };
  aiAnalysis: {
    status: string;
    summary: string | null;
    qualityScore: number | null;
    customerIntent: string;
    sentiment: string | null;
    riskFlags: string[];
    opportunityTags: string[];
    keywords: string[];
    nextActionSuggestion: string | null;
    transcriptPreview: string | null;
    transcriptTextLength: number;
    hasTranscript: boolean;
  } | null;
  latestReview: {
    id: string;
    reviewStatus: string;
    manualScore: number | null;
    comment: string | null;
    reviewerName: string;
    updatedAt: Date;
  } | null;
};

export type CallRecordingWorkbenchData = {
  filters: CallRecordingWorkbenchFilters;
  salesOptions: Array<{
    id: string;
    name: string;
    username: string;
  }>;
  summary: {
    totalCount: number;
    readyCount: number;
    processingCount: number;
    failedCount: number;
    aiReadyCount: number;
    aiPendingCount: number;
  };
  items: CallRecordingWorkbenchItem[];
};

export type CallRecordingAnalysisDetail = {
  id: string;
  aiAnalysis: {
    status: string;
    summary: string | null;
    qualityScore: number | null;
    customerIntent: string;
    sentiment: string | null;
    riskFlags: string[];
    opportunityTags: string[];
    keywords: string[];
    nextActionSuggestion: string | null;
    transcriptText: string | null;
    transcriptSegments: CallTranscriptSegment[];
  } | null;
};

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parseDateBoundary(value: string, endOfDay = false) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }

  return parsed;
}

function parseScore(value: string) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(100, Math.max(0, parsed));
}

function parseFilters(
  rawSearchParams?: Record<string, SearchParamsValue>,
): CallRecordingWorkbenchFilters {
  const status = getParamValue(rawSearchParams?.status).trim();
  const aiStatus = getParamValue(rawSearchParams?.aiStatus).trim();

  return {
    search: getParamValue(rawSearchParams?.q).trim(),
    salesId: getParamValue(rawSearchParams?.salesId).trim(),
    status: isCallRecordingStatus(status) ? status : "",
    aiStatus: isCallAiAnalysisStatus(aiStatus) ? aiStatus : "",
    from: getParamValue(rawSearchParams?.from).trim(),
    to: getParamValue(rawSearchParams?.to).trim(),
    minScore: getParamValue(rawSearchParams?.minScore).trim(),
    maxScore: getParamValue(rawSearchParams?.maxScore).trim(),
  };
}

function buildDateWhere(filters: CallRecordingWorkbenchFilters) {
  const from = parseDateBoundary(filters.from);
  const to = parseDateBoundary(filters.to, true);

  if (!from && !to) {
    return {};
  }

  return {
    createdAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    },
  } satisfies Prisma.CallRecordingWhereInput;
}

function buildScoreWhere(filters: CallRecordingWorkbenchFilters) {
  const minScore = parseScore(filters.minScore);
  const maxScore = parseScore(filters.maxScore);

  if (minScore === null && maxScore === null) {
    return {};
  }

  return {
    aiAnalysis: {
      is: {
        qualityScore: {
          ...(minScore !== null ? { gte: minScore } : {}),
          ...(maxScore !== null ? { lte: maxScore } : {}),
        },
      },
    },
  } satisfies Prisma.CallRecordingWhereInput;
}

function buildRecordingWhere(
  scope: Prisma.CallRecordingWhereInput,
  filters: CallRecordingWorkbenchFilters,
) {
  const search = filters.search.trim();
  const where: Prisma.CallRecordingWhereInput = {
    ...scope,
    ...buildDateWhere(filters),
    ...(filters.salesId ? { salesId: filters.salesId } : {}),
    ...(filters.status
      ? { status: filters.status as CallRecordingStatus }
      : {}),
    ...(filters.aiStatus
      ? {
          aiAnalysis: {
            is: {
              status: filters.aiStatus as CallAiAnalysisStatus,
            },
          },
        }
      : {}),
    ...buildScoreWhere(filters),
    ...(search
      ? {
          OR: [
            { customer: { is: { name: { contains: search } } } },
            { customer: { is: { phone: { contains: search } } } },
            { sales: { is: { name: { contains: search } } } },
            { sales: { is: { username: { contains: search } } } },
          ],
        }
      : {}),
  };

  return where;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTranscriptPreview(value: string | null | undefined) {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function buildCountMap(rows: Array<{ status: string; _count?: { _all?: number } | true }>) {
  return new Map(
    rows.map((row) => [
      row.status,
      typeof row._count === "object" ? row._count._all ?? 0 : 0,
    ] as const),
  );
}

export async function getCallRecordingWorkbenchData(
  viewer: CallRecordingViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
): Promise<CallRecordingWorkbenchData> {
  if (!canAccessCallRecordingModule(viewer.role)) {
    throw new Error("当前角色无权访问通话录音工作台。");
  }

  const scope = getCallRecordingScope(viewer.role, viewer.id, viewer.teamId);

  if (!scope) {
    throw new Error("当前角色无权访问通话录音工作台。");
  }

  const filters = parseFilters(rawSearchParams);
  const where = buildRecordingWhere(scope, filters);
  const salesWhere =
    viewer.role === "SUPERVISOR"
      ? viewer.teamId
        ? { teamId: viewer.teamId }
        : { id: "__missing_call_recording_sales_scope__" }
      : {};

  const [
    rows,
    totalCount,
    recordingStatusCounts,
    aiStatusCounts,
    salesOptions,
  ] = await Promise.all([
    prisma.callRecording.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 80,
      select: {
        id: true,
        status: true,
        createdAt: true,
        uploadedAt: true,
        durationSeconds: true,
        fileSizeBytes: true,
        mimeType: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
        sales: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
        callRecord: {
          select: {
            id: true,
            callTime: true,
            durationSeconds: true,
            result: true,
            resultCode: true,
            remark: true,
          },
        },
        aiAnalysis: {
          select: {
            status: true,
            summary: true,
            qualityScore: true,
            customerIntent: true,
            sentiment: true,
            riskFlagsJson: true,
            opportunityTagsJson: true,
            keywordsJson: true,
            nextActionSuggestion: true,
            transcriptText: true,
          },
        },
        qualityReviews: {
          orderBy: [{ updatedAt: "desc" }],
          take: 1,
          select: {
            id: true,
            reviewStatus: true,
            manualScore: true,
            comment: true,
            updatedAt: true,
            reviewer: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.callRecording.count({ where }),
    prisma.callRecording.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.callAiAnalysis.groupBy({
      by: ["status"],
      where: {
        recording: {
          is: where,
        },
      },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: {
        ...salesWhere,
        role: {
          code: "SALES",
        },
      },
      orderBy: [{ name: "asc" }, { username: "asc" }],
      select: {
        id: true,
        name: true,
        username: true,
      },
    }),
  ]);

  const hydratedCallRecords = await hydrateCallResultLabels(
    rows.map((row) => row.callRecord),
  );
  const callRecordLabelMap = new Map(
    hydratedCallRecords.map((record) => [record.id, record.resultLabel] as const),
  );
  const recordingCountMap = buildCountMap(recordingStatusCounts);
  const aiCountMap = buildCountMap(aiStatusCounts);

  return {
    filters,
    salesOptions,
    summary: {
      totalCount,
      readyCount:
        (recordingCountMap.get("READY") ?? 0) +
        (recordingCountMap.get("UPLOADED") ?? 0),
      processingCount:
        (recordingCountMap.get("PROCESSING") ?? 0) +
        (recordingCountMap.get("UPLOADING") ?? 0),
      failedCount: recordingCountMap.get("FAILED") ?? 0,
      aiReadyCount: aiCountMap.get("READY") ?? 0,
      aiPendingCount:
        (aiCountMap.get("PENDING") ?? 0) +
        (aiCountMap.get("TRANSCRIBING") ?? 0) +
        (aiCountMap.get("ANALYZING") ?? 0),
    },
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      createdAt: row.createdAt,
      uploadedAt: row.uploadedAt,
      durationSeconds: row.durationSeconds,
      fileSizeBytes: row.fileSizeBytes,
      mimeType: row.mimeType,
      customer: row.customer,
      sales: row.sales,
      callRecord: {
        id: row.callRecord.id,
        callTime: row.callRecord.callTime,
        durationSeconds: row.callRecord.durationSeconds,
        resultCode: row.callRecord.resultCode,
        resultLabel: callRecordLabelMap.get(row.callRecord.id) ?? "未记录",
        remark: row.callRecord.remark,
      },
      aiAnalysis: row.aiAnalysis
        ? {
            status: row.aiAnalysis.status,
            summary: row.aiAnalysis.summary,
            qualityScore: row.aiAnalysis.qualityScore,
            customerIntent: row.aiAnalysis.customerIntent,
            sentiment: row.aiAnalysis.sentiment,
            riskFlags: toStringArray(row.aiAnalysis.riskFlagsJson),
            opportunityTags: toStringArray(row.aiAnalysis.opportunityTagsJson),
            keywords: toStringArray(row.aiAnalysis.keywordsJson),
            nextActionSuggestion: row.aiAnalysis.nextActionSuggestion,
            transcriptPreview: buildTranscriptPreview(row.aiAnalysis.transcriptText),
            transcriptTextLength: row.aiAnalysis.transcriptText?.trim().length ?? 0,
            hasTranscript: Boolean(row.aiAnalysis.transcriptText?.trim()),
          }
        : null,
      latestReview: row.qualityReviews[0]
        ? {
            id: row.qualityReviews[0].id,
            reviewStatus: row.qualityReviews[0].reviewStatus,
            manualScore: row.qualityReviews[0].manualScore,
            comment: row.qualityReviews[0].comment,
            reviewerName: row.qualityReviews[0].reviewer.name,
            updatedAt: row.qualityReviews[0].updatedAt,
          }
        : null,
    })),
  };
}

export async function getCallRecordingAnalysisDetail(
  viewer: CallRecordingViewer,
  recordingId: string,
): Promise<CallRecordingAnalysisDetail> {
  if (!canAccessCallRecordingModule(viewer.role)) {
    throw new Error("当前角色无权访问通话录音工作台。");
  }

  const scope = getCallRecordingScope(viewer.role, viewer.id, viewer.teamId);

  if (!scope) {
    throw new Error("当前角色无权访问通话录音工作台。");
  }

  const row = await prisma.callRecording.findFirst({
    where: {
      id: recordingId,
      ...scope,
    },
    select: {
      id: true,
      aiAnalysis: {
        select: {
          status: true,
          summary: true,
          qualityScore: true,
          customerIntent: true,
          sentiment: true,
          riskFlagsJson: true,
          opportunityTagsJson: true,
          keywordsJson: true,
          nextActionSuggestion: true,
          transcriptText: true,
          transcriptJson: true,
        },
      },
    },
  });

  if (!row) {
    throw new Error("录音不存在或无权查看。");
  }

  return {
    id: row.id,
    aiAnalysis: row.aiAnalysis
      ? {
          status: row.aiAnalysis.status,
          summary: row.aiAnalysis.summary,
          qualityScore: row.aiAnalysis.qualityScore,
          customerIntent: row.aiAnalysis.customerIntent,
          sentiment: row.aiAnalysis.sentiment,
          riskFlags: toStringArray(row.aiAnalysis.riskFlagsJson),
          opportunityTags: toStringArray(row.aiAnalysis.opportunityTagsJson),
          keywords: toStringArray(row.aiAnalysis.keywordsJson),
          nextActionSuggestion: row.aiAnalysis.nextActionSuggestion,
          transcriptText: row.aiAnalysis.transcriptText,
          transcriptSegments: extractStoredCallTranscriptSegments(
            row.aiAnalysis.transcriptJson,
          ),
        }
      : null,
  };
}

export function getCallRecordingFilterOptions() {
  return {
    recordingStatuses: [...CALL_RECORDING_STATUSES],
    aiStatuses: [...CALL_AI_ANALYSIS_STATUSES],
  };
}
