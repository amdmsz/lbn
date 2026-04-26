import type { CallResult } from "@prisma/client";
import { CallTranscriptDialogue } from "@/components/calls/call-transcript-dialogue";
import { RecordingAudioPlayer } from "@/components/calls/recording-audio-player";
import {
  CustomerEmptyState,
  formatOptionalDate,
} from "@/components/customers/customer-record-list";
import { CustomerDossierRecordCard } from "@/components/customers/customer-dossier-primitives";
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
      riskFlagsJson: unknown;
      opportunityTagsJson: unknown;
      nextActionSuggestion: string | null;
      transcriptText?: string | null;
      transcriptJson?: unknown;
      transcriptSegments?: CallTranscriptSegment[];
    } | null;
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

function renderRecordingSummary(record: CallRecordHistoryItem) {
  const recording = record.recording;

  if (!recording) {
    return record.remark?.trim() || "无备注";
  }

  const ai = recording.aiAnalysis;
  const riskFlags = parseJsonStringArray(ai?.riskFlagsJson);
  const opportunityTags = parseJsonStringArray(ai?.opportunityTagsJson);
  const transcriptSegments =
    ai?.transcriptSegments ??
    extractStoredCallTranscriptSegments(ai?.transcriptJson);

  return (
    <div className="space-y-2">
      <p>{record.remark?.trim() || "无备注"}</p>
      <div className="rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2.5">
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
          className="mt-2"
        />
      </div>
      {ai ? (
        <details className="rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2.5">
          <summary className="cursor-pointer text-[12px] font-medium text-[var(--foreground)]">
            AI 分析 {getAiStatusLabel(ai.status)}
            {ai.qualityScore !== null ? ` / ${ai.qualityScore} 分` : ""}
          </summary>
          <div className="mt-2 space-y-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {ai.summary ? <p>{ai.summary}</p> : null}
            {ai.nextActionSuggestion ? <p>建议：{ai.nextActionSuggestion}</p> : null}
            {transcriptSegments.length > 0 ? (
              <CallTranscriptDialogue segments={transcriptSegments} maxSegments={6} />
            ) : ai.transcriptText ? (
              <div className="rounded-[0.8rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
                  转写
                </p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--foreground)]/82">
                  {ai.transcriptText}
                </p>
              </div>
            ) : null}
            {riskFlags.length > 0 || opportunityTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {riskFlags.map((item) => (
                  <span
                    key={`risk-${item}`}
                    className="rounded-full border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.06)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-danger)]"
                  >
                    {item}
                  </span>
                ))}
                {opportunityTags.map((item) => (
                  <span
                    key={`opportunity-${item}`}
                    className="rounded-full border border-[rgba(22,163,74,0.14)] bg-[rgba(22,163,74,0.06)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success)]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
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
    <div className={cn("space-y-3", className)}>
      {records.map((record) => {
        const nextFollowUpAt = normalizeOptionalDate(record.nextFollowUpAt);
        const meta = [
          `销售 ${record.sales.name} (@${record.sales.username})`,
          `通话时长 ${formatDurationSeconds(record.durationSeconds)}`,
        ];

        if (record.recording) {
          meta.push(`录音 ${getRecordingStatusLabel(record.recording.status)}`);
        }

        if (record.recording?.aiAnalysis) {
          const ai = record.recording.aiAnalysis;
          meta.push(
            `AI ${getAiStatusLabel(ai.status)}${
              ai.qualityScore !== null ? ` / ${ai.qualityScore} 分` : ""
            }`,
          );
        }

        if (nextFollowUpAt) {
          meta.push(`计划跟进 ${formatOptionalDate(nextFollowUpAt)}`);
        }

        return (
          <CustomerDossierRecordCard
            key={record.id}
            title={record.resultLabel}
            meta={meta}
            summary={renderRecordingSummary(record)}
            aside={formatDateTime(normalizeDate(record.callTime))}
            className={cardClassName}
          />
        );
      })}
    </div>
  );
}
