import type { CallResult, OutboundCallSessionStatus } from "@prisma/client";
import { CallAiInsightPanel } from "@/components/calls/call-ai-insight-panel";
import { RecordingAudioPlayer } from "@/components/calls/recording-audio-player";
import {
  CustomerEmptyState,
  formatOptionalDate,
} from "@/components/customers/customer-record-list";
import {
  CustomerDossierLedgerRow,
  type CustomerDossierStatusItem,
  type CustomerDossierStatusTone,
} from "@/components/customers/customer-dossier-primitives";
import { formatDurationSeconds } from "@/lib/calls/metadata";
import {
  callAiAnalysisStatusLabels,
  callRecordingStatusLabels,
  formatRecordingFileSize,
  parseJsonStringArray,
  type CallAiAnalysisStatusValue,
  type CallRecordingStatusValue,
} from "@/lib/calls/recording-metadata";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  extractStoredCallTranscriptSegments,
  type CallTranscriptSegment,
} from "@/lib/calls/call-ai-diarization";
import { getOutboundCallSessionDisplay } from "@/lib/outbound-calls/metadata";
import { cn } from "@/lib/utils";

type CallRecordHistoryItem = {
  id: string;
  callTime: Date | string;
  durationSeconds: number;
  result: CallResult | null;
  resultCode: string | null;
  resultLabel: string;
  remark: string | null;
  nextFollowUpAt: Date | string | null;
  recording?: {
    id: string;
    status: string;
    mimeType: string;
    fileSizeBytes: number | null;
    durationSeconds: number | null;
    uploadedAt: Date | string | null;
    aiAnalysis: {
      status: string;
      summary: string | null;
      qualityScore: number | null;
      customerIntent?: string | null;
      sentiment?: string | null;
      riskFlagsJson: unknown;
      opportunityTagsJson: unknown;
      keywordsJson?: unknown;
      nextActionSuggestion: string | null;
      transcriptText?: string | null;
      transcriptJson?: unknown;
      transcriptSegments?: CallTranscriptSegment[];
    } | null;
  } | null;
  outboundSession?: {
    status: OutboundCallSessionStatus;
    failureCode: string | null;
    failureMessage: string | null;
    durationSeconds: number | null;
    recordingImportedAt: Date | string | null;
  } | null;
  sales: {
    name: string;
    username: string;
  };
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeOptionalDate(value: Date | string | null) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function getRecordingStatusLabel(status: string) {
  return callRecordingStatusLabels[status as CallRecordingStatusValue] ?? status;
}

function getAiStatusLabel(status: string) {
  return callAiAnalysisStatusLabels[status as CallAiAnalysisStatusValue] ?? status;
}

function getOutboundSessionLabel(record: CallRecordHistoryItem) {
  const session = record.outboundSession;

  if (!session) {
    return null;
  }

  return getOutboundCallSessionDisplay({
    status: session.status,
    failureCode: session.failureCode,
    failureMessage: session.failureMessage,
    durationSeconds: session.durationSeconds ?? record.durationSeconds,
  });
}

function getRecordTitle(record: CallRecordHistoryItem) {
  const outboundLabel = getOutboundSessionLabel(record);

  if (outboundLabel && (!record.resultCode || record.resultLabel === "未记录")) {
    return outboundLabel;
  }

  return record.resultLabel;
}

function getCallOutcomeTone(record: CallRecordHistoryItem): CustomerDossierStatusTone {
  const title = getRecordTitle(record);

  if (/拒|失败|无效|空号|停机|忙|CHANUNAVAIL|CONGESTION/i.test(title)) {
    return "danger";
  }

  if (/未接|未接通|NO ANSWER|CANCEL/i.test(title)) {
    return "warning";
  }

  if (record.durationSeconds > 0) {
    return "success";
  }

  return "neutral";
}

function getRecordingTone(record: CallRecordHistoryItem): CustomerDossierStatusTone {
  if (!record.recording) {
    return "neutral";
  }

  return record.recording.durationSeconds || record.durationSeconds > 0
    ? "success"
    : "warning";
}

function getAiTone(record: CallRecordHistoryItem): CustomerDossierStatusTone {
  const ai = record.recording?.aiAnalysis;

  if (!ai) {
    return "neutral";
  }

  if (ai.status === "FAILED") {
    return "danger";
  }

  if (ai.status === "READY") {
    return "success";
  }

  return "info";
}

function getAiLabel(record: CallRecordHistoryItem) {
  const ai = record.recording?.aiAnalysis;

  if (!ai) {
    return "未分析";
  }

  return `${getAiStatusLabel(ai.status)}${ai.qualityScore !== null ? ` / ${ai.qualityScore} 分` : ""}`;
}

function renderRecordingDetail(record: CallRecordHistoryItem) {
  const recording = record.recording;

  if (!recording) {
    return null;
  }

  const ai = recording.aiAnalysis;
  const riskFlags = parseJsonStringArray(ai?.riskFlagsJson);
  const opportunityTags = parseJsonStringArray(ai?.opportunityTagsJson);
  const keywords = parseJsonStringArray(ai?.keywordsJson);
  const transcriptSegments =
    ai?.transcriptSegments ??
    extractStoredCallTranscriptSegments(ai?.transcriptJson);

  return (
    <details className="group rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2.5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-[12px] font-medium text-[var(--foreground)]">
        <span>录音与 AI 分析</span>
        <span className="text-[11px] font-normal text-[var(--color-sidebar-muted)]">
          {getRecordingStatusLabel(recording.status)} / {formatRecordingFileSize(recording.fileSizeBytes)}
          {ai ? ` / ${getAiLabel(record)}` : ""}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
            <span>录音 {getRecordingStatusLabel(recording.status)}</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>{formatRecordingFileSize(recording.fileSizeBytes)}</span>
            {recording.uploadedAt ? (
              <>
                <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
                <span>上传 {formatDateTime(normalizeDate(recording.uploadedAt))}</span>
              </>
            ) : null}
          </div>
          <RecordingAudioPlayer
            recordingId={recording.id}
            status={recording.status}
            mimeType={recording.mimeType}
            durationSeconds={recording.durationSeconds ?? record.durationSeconds}
            className="mt-2"
          />
        </div>
        {ai ? (
          <CallAiInsightPanel
            status={ai.status}
            summary={ai.summary}
            qualityScore={ai.qualityScore}
            customerIntent={ai.customerIntent}
            sentiment={ai.sentiment}
            riskFlags={riskFlags}
            opportunityTags={opportunityTags}
            keywords={keywords}
            nextActionSuggestion={ai.nextActionSuggestion}
            transcriptText={ai.transcriptText}
            transcriptSegments={transcriptSegments}
            maxTranscriptSegments={6}
            className="border-none bg-transparent p-0 shadow-none"
          />
        ) : null}
      </div>
    </details>
  );
}

export function CustomerCallRecordHistory({
  records,
  emptyTitle = "暂无通话记录",
  emptyDescription = "当前客户还没有通话记录。",
  className,
  cardClassName,
  emptyClassName,
}: Readonly<{
  records: CallRecordHistoryItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  cardClassName?: string;
  emptyClassName?: string;
}>) {
  if (records.length === 0) {
    return (
      <CustomerEmptyState
        title={emptyTitle}
        description={emptyDescription}
        className={emptyClassName}
      />
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      {records.map((record) => {
        const nextFollowUpAt = normalizeOptionalDate(record.nextFollowUpAt);
        const outboundLabel = getOutboundSessionLabel(record);
        const statusItems: CustomerDossierStatusItem[] = [
          {
            label: "结果",
            value: getRecordTitle(record),
            tone: getCallOutcomeTone(record),
          },
          {
            label: "时长",
            value: formatDurationSeconds(record.durationSeconds),
            tone: record.durationSeconds > 0 ? "success" : "neutral",
          },
          {
            label: "录音",
            value: record.recording
              ? getRecordingStatusLabel(record.recording.status)
              : "无录音",
            tone: getRecordingTone(record),
          },
          {
            label: "AI",
            value: getAiLabel(record),
            tone: getAiTone(record),
          },
        ];
        const meta = [`销售 ${record.sales.name} (@${record.sales.username})`];

        if (outboundLabel) {
          meta.push(`外呼状态 ${outboundLabel}`);
        }

        if (nextFollowUpAt) {
          meta.push(`计划跟进 ${formatOptionalDate(nextFollowUpAt)}`);
        }

        return (
          <CustomerDossierLedgerRow
            key={record.id}
            title={getRecordTitle(record)}
            subtitle={record.remark?.trim() || outboundLabel || "无备注"}
            meta={meta}
            statusItems={statusItems}
            aside={formatDateTime(normalizeDate(record.callTime))}
            detail={renderRecordingDetail(record)}
            className={cardClassName}
          />
        );
      })}
    </div>
  );
}
