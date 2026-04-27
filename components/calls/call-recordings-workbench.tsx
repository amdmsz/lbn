import Link from "next/link";
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  Headphones,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { CallAiInsightPanel } from "@/components/calls/call-ai-insight-panel";
import { RecordingAudioPlayer } from "@/components/calls/recording-audio-player";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { formatDurationSeconds } from "@/lib/calls/metadata";
import {
  callAiAnalysisStatusLabels,
  callQualityReviewStatusLabels,
  callRecordingStatusLabels,
  formatRecordingFileSize,
  type CallAiAnalysisStatusValue,
  type CallQualityReviewStatusValue,
  type CallRecordingStatusValue,
} from "@/lib/calls/recording-metadata";
import type {
  CallRecordingWorkbenchData,
  CallRecordingWorkbenchItem,
} from "@/lib/calls/recording-queries";
import { formatDateTime } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

function getRecordingStatusLabel(status: string) {
  return callRecordingStatusLabels[status as CallRecordingStatusValue] ?? status;
}

function getAiStatusLabel(status: string) {
  return callAiAnalysisStatusLabels[status as CallAiAnalysisStatusValue] ?? status;
}

function getReviewStatusLabel(status: string) {
  return (
    callQualityReviewStatusLabels[status as CallQualityReviewStatusValue] ??
    status
  );
}

function getRecordingStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "READY":
    case "UPLOADED":
      return "success";
    case "PROCESSING":
    case "UPLOADING":
      return "info";
    case "FAILED":
    case "EXPIRED":
    case "DELETED":
      return "danger";
    default:
      return "neutral";
  }
}

function getAiStatusVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "READY":
      return "success";
    case "FAILED":
      return "danger";
    case "TRANSCRIBING":
    case "ANALYZING":
      return "info";
    default:
      return "neutral";
  }
}

function formatPercent(value: number, total: number) {
  if (total <= 0) {
    return "0%";
  }

  return `${Math.round((value / total) * 100)}%`;
}

function getIntentLabel(intent: string | null | undefined) {
  switch (intent) {
    case "HIGH":
      return "强意向";
    case "MEDIUM":
      return "中意向";
    case "LOW":
      return "弱意向";
    case "REFUSED":
      return "拒绝";
    default:
      return "待判断";
  }
}

function getScoreTone(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)]";
  }

  if (score >= 85) {
    return "border-[rgba(22,163,74,0.16)] bg-[rgba(22,163,74,0.06)] text-[var(--color-success)]";
  }

  if (score >= 70) {
    return "border-[rgba(79,125,247,0.16)] bg-[rgba(79,125,247,0.06)] text-[var(--color-primary)]";
  }

  if (score >= 50) {
    return "border-[rgba(217,119,6,0.16)] bg-[rgba(217,119,6,0.06)] text-[rgb(180,83,9)]";
  }

  return "border-[rgba(220,38,38,0.16)] bg-[rgba(220,38,38,0.06)] text-[var(--color-danger)]";
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: Readonly<{
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone: string;
}>) {
  return (
    <div className="min-w-0 border-r border-[var(--color-border-soft)] px-3 py-2.5 last:border-r-0 md:px-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
          {label}
        </p>
        <Icon className={cn("h-3.5 w-3.5", tone)} aria-hidden="true" />
      </div>
      <p className="mt-1 text-[1.05rem] font-semibold tabular-nums tracking-[-0.035em] text-[var(--foreground)]">
        {value}
      </p>
      <p className="mt-0.5 truncate text-[10.5px] text-[var(--color-sidebar-muted)]">
        {detail}
      </p>
    </div>
  );
}

function WorkbenchHero({
  data,
}: Readonly<{
  data: CallRecordingWorkbenchData;
}>) {
  const aiRate = formatPercent(data.summary.aiReadyCount, data.summary.totalCount);
  const playableRate = formatPercent(data.summary.readyCount, data.summary.totalCount);
  const failedRate = formatPercent(data.summary.failedCount, data.summary.totalCount);

  return (
    <section className="overflow-hidden rounded-[1rem] border border-[rgba(79,125,247,0.14)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)]">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border-soft)] px-4 py-3 md:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
            <span>Call Recording QA</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>{data.items.length} 条当前队列</span>
          </div>
          <h1 className="mt-1.5 text-[1.35rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] md:text-[1.6rem]">
            录音质检工作台
          </h1>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
            回听录音、确认接通、查看 AI 质检信号，并把需要人工复核的通话集中处理。
          </p>
        </div>
        <div className="inline-flex w-full items-center justify-between rounded-[0.8rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2 text-[11px] font-medium text-[var(--color-sidebar-muted)] lg:w-auto lg:min-w-[14rem]">
          <span>当前筛选</span>
          <span className="font-semibold tabular-nums text-[var(--foreground)]">
            {data.summary.totalCount} 条
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-y divide-[var(--color-border-soft)] md:grid-cols-4 md:divide-y-0">
        <SummaryMetric
          label="AI 完成率"
          value={aiRate}
          detail={`${data.summary.aiReadyCount} 完成 / ${data.summary.aiPendingCount} 待处理`}
          icon={Bot}
          tone="text-[var(--color-primary)]"
        />
        <SummaryMetric
          label="可回听率"
          value={playableRate}
          detail={`${data.summary.readyCount} 条可播放`}
          icon={Headphones}
          tone="text-[var(--color-success)]"
        />
        <SummaryMetric
          label="处理中"
          value={data.summary.processingCount}
          detail="上传或 AI 处理中"
          icon={Clock}
          tone="text-[var(--color-primary)]"
        />
        <SummaryMetric
          label="异常占比"
          value={failedRate}
          detail={`${data.summary.failedCount} 条失败`}
          icon={Activity}
          tone="text-[var(--color-danger)]"
        />
      </div>
    </section>
  );
}

function FilterDeck({
  data,
  recordingStatuses,
  aiStatuses,
}: Readonly<{
  data: CallRecordingWorkbenchData;
  recordingStatuses: string[];
  aiStatuses: string[];
}>) {
  return (
    <DataTableWrapper
      title="筛选"
      description="按员工、客户、日期、录音状态和 AI 分数收窄队列。"
      contentClassName="p-0"
      className="border-[rgba(79,125,247,0.12)]"
      toolbar={
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Queue Controls</span>
        </div>
      }
    >
      <form className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,2fr)_repeat(5,minmax(0,1fr))_minmax(8rem,1fr)_auto]" action="/call-recordings">
        <label className="relative min-w-0">
          <span className="sr-only">搜索客户、手机或员工</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-sidebar-muted)]"
            aria-hidden="true"
          />
          <input
            name="q"
            defaultValue={data.filters.search}
            placeholder="客户 / 手机 / 员工"
            className="crm-input pl-8"
          />
        </label>
        <select
          name="salesId"
          defaultValue={data.filters.salesId}
          className="crm-select"
        >
          <option value="">全部员工</option>
          {data.salesOptions.map((sales) => (
            <option key={sales.id} value={sales.id}>
              {sales.name} (@{sales.username})
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={data.filters.status}
          className="crm-select"
        >
          <option value="">录音状态</option>
          {recordingStatuses.map((status) => (
            <option key={status} value={status}>
              {getRecordingStatusLabel(status)}
            </option>
          ))}
        </select>
        <select
          name="aiStatus"
          defaultValue={data.filters.aiStatus}
          className="crm-select"
        >
          <option value="">AI 状态</option>
          {aiStatuses.map((status) => (
            <option key={status} value={status}>
              {getAiStatusLabel(status)}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={data.filters.from}
          className="crm-input"
        />
        <input
          type="date"
          name="to"
          defaultValue={data.filters.to}
          className="crm-input"
        />
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <input
            name="minScore"
            defaultValue={data.filters.minScore}
            placeholder="低分"
            className="crm-input min-w-0"
          />
          <input
            name="maxScore"
            defaultValue={data.filters.maxScore}
            placeholder="高分"
            className="crm-input min-w-0"
          />
        </div>
        <button type="submit" className="crm-button crm-button-primary gap-2">
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          筛选
        </button>
      </form>
    </DataTableWrapper>
  );
}

function RecordingAiBlock({ item }: Readonly<{ item: CallRecordingWorkbenchItem }>) {
  const ai = item.aiAnalysis;

  if (!ai) {
    return (
      <div className="rounded-[0.7rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
        暂无 AI 分析
      </div>
    );
  }

  return (
    <details className="group rounded-[0.75rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2 transition-colors open:border-[rgba(79,125,247,0.22)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-medium text-[var(--foreground)]">
        <span className="flex min-w-0 items-center gap-2">
          <StatusBadge
            label={getAiStatusLabel(ai.status)}
            variant={getAiStatusVariant(ai.status)}
          />
          <span className="truncate">{getIntentLabel(ai.customerIntent)}</span>
        </span>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-full border px-2 text-[11px] font-semibold tabular-nums",
            getScoreTone(ai.qualityScore),
          )}
        >
          {ai.qualityScore !== null ? `${ai.qualityScore} 分` : "未评分"}
        </span>
      </summary>
      <CallAiInsightPanel
        status={ai.status}
        summary={ai.summary}
        qualityScore={ai.qualityScore}
        customerIntent={ai.customerIntent}
        sentiment={ai.sentiment}
        riskFlags={ai.riskFlags}
        opportunityTags={ai.opportunityTags}
        keywords={ai.keywords}
        nextActionSuggestion={ai.nextActionSuggestion}
        transcriptText={ai.transcriptText}
        transcriptSegments={ai.transcriptSegments}
        maxTranscriptSegments={6}
        className="mt-2"
      />
    </details>
  );
}

function ReviewSummary({ item }: Readonly<{ item: CallRecordingWorkbenchItem }>) {
  if (!item.latestReview) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[0.7rem] border border-dashed border-[var(--color-border-soft)] px-3 py-2 text-[12px] text-[var(--color-sidebar-muted)]">
        <span>人工复核</span>
        <span>待复核</span>
      </div>
    );
  }

  return (
    <div className="rounded-[0.7rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <StatusBadge
          label={getReviewStatusLabel(item.latestReview.reviewStatus)}
          variant="info"
        />
        <span className="text-[11px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
          {formatDateTime(item.latestReview.updatedAt)}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--color-sidebar-muted)]">
        {item.latestReview.manualScore !== null
          ? `${item.latestReview.manualScore} 分 / ${item.latestReview.reviewerName}`
          : item.latestReview.reviewerName}
      </p>
      {item.latestReview.comment ? (
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--foreground)]/82">
          {item.latestReview.comment}
        </p>
      ) : null}
    </div>
  );
}

function RecordingQueueItem({ item }: Readonly<{ item: CallRecordingWorkbenchItem }>) {
  const callDuration = item.durationSeconds ?? item.callRecord.durationSeconds;
  const uploadMeta = item.uploadedAt
    ? `上传 ${formatDateTime(item.uploadedAt)}`
    : `创建 ${formatDateTime(item.createdAt)}`;

  return (
    <article className="grid gap-3 border-b border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-3.5 transition-colors last:border-b-0 hover:bg-[var(--color-shell-surface-soft)] md:px-4 lg:grid-cols-[minmax(15rem,0.9fr)_minmax(20rem,1.05fr)_minmax(19rem,1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/customers/${item.customer.id}?tab=calls`}
              className="crm-text-link truncate text-[14px] font-semibold"
            >
              {item.customer.name}
            </Link>
            <p className="mt-1 truncate text-[11.5px] tabular-nums text-[var(--color-sidebar-muted)]">
              {item.customer.phone}
            </p>
          </div>
          <StatusBadge
            label={getRecordingStatusLabel(item.status)}
            variant={getRecordingStatusVariant(item.status)}
          />
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2 py-0.5">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {formatDateTime(item.callRecord.callTime)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2 py-0.5">
            <Headphones className="h-3 w-3" aria-hidden="true" />
            {formatDurationSeconds(item.callRecord.durationSeconds)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2 py-0.5">
            <UserRound className="h-3 w-3" aria-hidden="true" />
            {item.sales.name}
          </span>
        </div>

        <div className="rounded-[0.7rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-[var(--foreground)]">
              {item.callRecord.resultLabel}
            </span>
            <span className="text-[11px] tabular-nums text-[var(--color-sidebar-muted)]">
              {formatDurationSeconds(callDuration)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {item.callRecord.remark?.trim() || "无备注"}
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-sidebar-muted)]">
          <span>{formatRecordingFileSize(item.fileSizeBytes)}</span>
          <span>{uploadMeta}</span>
        </div>
        <RecordingAudioPlayer
          recordingId={item.id}
          status={item.status}
          mimeType={item.mimeType}
          durationSeconds={callDuration}
        />
      </div>

      <div className="min-w-0 space-y-2">
        <RecordingAiBlock item={item} />
        <ReviewSummary item={item} />
      </div>
    </article>
  );
}

function RecordingQueueList({
  items,
}: Readonly<{
  items: CallRecordingWorkbenchItem[];
}>) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="暂无录音"
        description="当前筛选条件下没有可查看的通话录音。"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)]">
      <div className="hidden border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)] lg:grid lg:grid-cols-[minmax(15rem,0.9fr)_minmax(20rem,1.05fr)_minmax(19rem,1fr)]">
        <span>Customer / Result</span>
        <span>Audio Playback</span>
        <span>AI / Review</span>
      </div>
      {items.map((item) => (
        <RecordingQueueItem key={item.id} item={item} />
      ))}
    </div>
  );
}

export function CallRecordingsWorkbench({
  data,
  recordingStatuses,
  aiStatuses,
}: Readonly<{
  data: CallRecordingWorkbenchData;
  recordingStatuses: string[];
  aiStatuses: string[];
}>) {
  return (
    <PageShell
      header={<WorkbenchHero data={data} />}
      toolbar={
        <FilterDeck
          data={data}
          recordingStatuses={recordingStatuses}
          aiStatuses={aiStatuses}
        />
      }
    >
      <DataTableWrapper
        title="质检队列"
        description="客户、播放、AI 信号和人工复核合并到同一条记录，减少横向滚动和来回跳转。"
        eyebrow="Review Queue"
        className="border-[rgba(79,125,247,0.12)]"
        contentClassName="p-3"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-success)]" aria-hidden="true" />
              {data.items.length} / {data.summary.totalCount} 条
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)] sm:inline-flex">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-primary)]" aria-hidden="true" />
              {data.summary.aiReadyCount} 条 AI 完成
            </span>
          </div>
        }
      >
        <RecordingQueueList items={data.items} />
      </DataTableWrapper>
    </PageShell>
  );
}
