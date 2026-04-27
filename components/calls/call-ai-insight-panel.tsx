import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  MessageSquareText,
  Tags,
  Target,
} from "lucide-react";
import { CallTranscriptDialogue } from "@/components/calls/call-transcript-dialogue";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CallTranscriptSegment } from "@/lib/calls/call-ai-diarization";
import {
  callAiAnalysisStatusLabels,
  callCustomerIntentLabels,
  callSentimentLabels,
  type CallAiAnalysisStatusValue,
} from "@/lib/calls/recording-metadata";
import { cn } from "@/lib/utils";

type InsightTone = "neutral" | "success" | "warning" | "danger" | "info";

type CallAiInsightPanelProps = {
  status: string;
  summary: string | null;
  qualityScore: number | null;
  customerIntent?: string | null;
  sentiment?: string | null;
  riskFlags?: string[];
  opportunityTags?: string[];
  keywords?: string[];
  nextActionSuggestion: string | null;
  transcriptText?: string | null;
  transcriptSegments?: CallTranscriptSegment[];
  maxTranscriptSegments?: number;
  className?: string;
};

function getAiStatusLabel(status: string) {
  return callAiAnalysisStatusLabels[status as CallAiAnalysisStatusValue] ?? status;
}

function getQualityBand(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return {
      label: "未评分",
      tone: "neutral" as InsightTone,
      detail: "等待模型给出质检分",
    };
  }

  if (score >= 85) {
    return {
      label: "高质量",
      tone: "success" as InsightTone,
      detail: "话术和推进动作较完整",
    };
  }

  if (score >= 70) {
    return {
      label: "可跟进",
      tone: "info" as InsightTone,
      detail: "有推进线索，仍需补动作",
    };
  }

  if (score >= 50) {
    return {
      label: "需辅导",
      tone: "warning" as InsightTone,
      detail: "关键销售信息不足",
    };
  }

  return {
    label: "高风险",
    tone: "danger" as InsightTone,
    detail: "建议主管复核",
  };
}

function getIntentTone(intent: string | null | undefined): InsightTone {
  switch (intent) {
    case "HIGH":
      return "success";
    case "MEDIUM":
      return "info";
    case "LOW":
      return "warning";
    case "REFUSED":
      return "danger";
    default:
      return "neutral";
  }
}

function getSentimentTone(sentiment: string | null | undefined): InsightTone {
  switch (sentiment) {
    case "POSITIVE":
      return "success";
    case "NEGATIVE":
      return "danger";
    case "MIXED":
      return "warning";
    case "NEUTRAL":
      return "info";
    default:
      return "neutral";
  }
}

function toneClassName(tone: InsightTone) {
  switch (tone) {
    case "success":
      return "border-[rgba(22,163,74,0.16)] bg-[rgba(22,163,74,0.06)] text-[var(--color-success)]";
    case "warning":
      return "border-[rgba(217,119,6,0.16)] bg-[rgba(217,119,6,0.06)] text-[rgb(180,83,9)]";
    case "danger":
      return "border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.06)] text-[var(--color-danger)]";
    case "info":
      return "border-[rgba(79,125,247,0.16)] bg-[rgba(79,125,247,0.06)] text-[var(--color-primary)]";
    default:
      return "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)]";
  }
}

function MetricTile({
  label,
  value,
  detail,
  tone = "neutral",
}: Readonly<{
  label: string;
  value: string;
  detail?: string;
  tone?: InsightTone;
}>) {
  return (
    <div className={cn("rounded-[0.55rem] border px-2.5 py-2", toneClassName(tone))}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">
        {label}
      </p>
      <p className="mt-1 truncate text-[13px] font-semibold text-[var(--foreground)]">
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 line-clamp-1 text-[10.5px] opacity-75">{detail}</p>
      ) : null}
    </div>
  );
}

function InsightTagGroup({
  title,
  icon: Icon,
  items,
  tone,
}: Readonly<{
  title: string;
  icon: typeof AlertTriangle;
  items: string[];
  tone: InsightTone;
}>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{title}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={`${title}-${item}`}
            className={cn("rounded-full border px-2 py-0.5 text-[10.5px] font-medium", toneClassName(tone))}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CallAiInsightPanel({
  status,
  summary,
  qualityScore,
  customerIntent,
  sentiment,
  riskFlags = [],
  opportunityTags = [],
  keywords = [],
  nextActionSuggestion,
  transcriptText,
  transcriptSegments = [],
  maxTranscriptSegments = 6,
  className,
}: Readonly<CallAiInsightPanelProps>) {
  const quality = getQualityBand(qualityScore);
  const intentLabel = customerIntent
    ? callCustomerIntentLabels[customerIntent] ?? customerIntent
    : "未知";
  const sentimentLabel = sentiment
    ? callSentimentLabels[sentiment] ?? sentiment
    : "未判断";

  return (
    <div className={cn("space-y-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)]", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={getAiStatusLabel(status)} variant={status === "READY" ? "success" : status === "FAILED" ? "danger" : "info"} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--foreground)]">
          <Target className="h-3 w-3 text-[var(--color-primary)]" aria-hidden="true" />
          {qualityScore !== null ? `${qualityScore} 分` : "未评分"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <MetricTile
          label="质检判断"
          value={quality.label}
          detail={quality.detail}
          tone={quality.tone}
        />
        <MetricTile
          label="购买意向"
          value={intentLabel}
          detail="客户推进可能性"
          tone={getIntentTone(customerIntent)}
        />
        <MetricTile
          label="情绪"
          value={sentimentLabel}
          detail="通话态度信号"
          tone={getSentimentTone(sentiment)}
        />
      </div>

      {summary ? (
        <div className="rounded-[0.55rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-sidebar-muted)]">
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>业务摘要</span>
          </div>
          <p className="text-[12.5px] leading-5 text-[var(--foreground)]/86">{summary}</p>
        </div>
      ) : null}

      {nextActionSuggestion ? (
        <div className="rounded-[0.55rem] border border-[rgba(79,125,247,0.16)] bg-[rgba(79,125,247,0.05)] px-2.5 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--color-primary)]">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>下一步动作</span>
          </div>
          <p className="text-[12.5px] leading-5 text-[var(--foreground)]/86">
            {nextActionSuggestion}
          </p>
        </div>
      ) : null}

      <div className="grid gap-2 lg:grid-cols-3">
        <InsightTagGroup
          title="风险点"
          icon={AlertTriangle}
          items={riskFlags}
          tone="danger"
        />
        <InsightTagGroup
          title="机会点"
          icon={Lightbulb}
          items={opportunityTags}
          tone="success"
        />
        <InsightTagGroup
          title="关键词"
          icon={Tags}
          items={keywords}
          tone="info"
        />
      </div>

      {transcriptSegments.length > 0 ? (
        <CallTranscriptDialogue
          segments={transcriptSegments}
          maxSegments={maxTranscriptSegments}
        />
      ) : transcriptText ? (
        <div className="rounded-[0.55rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
            转写
          </p>
          <p className="mt-1 line-clamp-6 text-[12px] leading-5 text-[var(--foreground)]/82">
            {transcriptText}
          </p>
        </div>
      ) : null}
    </div>
  );
}
