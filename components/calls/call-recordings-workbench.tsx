import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileAudio,
  FileText,
  Gauge,
  Headphones,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  UserRound,
} from "lucide-react";
import { RecordingAudioPlayer } from "@/components/calls/recording-audio-player";
import { RecordingTranscriptLoader } from "@/components/calls/recording-transcript-loader";
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

type QualityTone = "excellent" | "good" | "watch" | "risk" | "neutral";

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

function getQualityTone(score: number | null | undefined): QualityTone {
  if (score === null || score === undefined) {
    return "neutral";
  }

  if (score >= 85) {
    return "excellent";
  }

  if (score >= 70) {
    return "good";
  }

  if (score >= 50) {
    return "watch";
  }

  return "risk";
}

function getQualityToneClass(tone: QualityTone) {
  switch (tone) {
    case "excellent":
      return "border-[rgba(22,163,74,0.18)] bg-[rgba(22,163,74,0.07)] text-[var(--color-success)]";
    case "good":
      return "border-[rgba(30,64,175,0.16)] bg-[rgba(30,64,175,0.07)] text-[var(--color-accent)]";
    case "watch":
      return "border-[rgba(217,119,6,0.18)] bg-[rgba(217,119,6,0.07)] text-[var(--color-warning)]";
    case "risk":
      return "border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.07)] text-[var(--color-danger)]";
    default:
      return "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)]";
  }
}

function getQualityRailClass(tone: QualityTone) {
  switch (tone) {
    case "excellent":
      return "bg-[var(--color-success)]";
    case "good":
      return "bg-[var(--color-accent)]";
    case "watch":
      return "bg-[var(--color-warning)]";
    case "risk":
      return "bg-[var(--color-danger)]";
    default:
      return "bg-[var(--color-border)]";
  }
}

function getScoreLabel(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "待评分";
  }

  return `${score} 分`;
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
    <div className="min-w-0 px-3 py-3 md:px-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
          {label}
        </p>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)]">
          <Icon className={cn("h-3.5 w-3.5", tone)} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-1.5 text-[1.15rem] font-semibold tabular-nums tracking-[-0.04em] text-[var(--foreground)]">
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
  const isFailureMode = data.mode === "failures";
  const failureMetricValue = isFailureMode ? data.summary.failedCount : failedRate;
  const failureMetricDetail = isFailureMode
    ? `${data.summary.totalCount} 条匹配当前筛选`
    : `${data.summary.failedCount} 条失败已拆分处理`;

  return (
    <section className="overflow-hidden rounded-[1.08rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_minmax(21rem,0.65fr)]">
        <div className="min-w-0 border-b border-[var(--color-border-soft)] px-4 py-4 md:px-5 lg:border-b-0 lg:border-r lg:py-5">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
            <span>{isFailureMode ? "Recording Failure Queue" : "Call Recording QA"}</span>
            <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
            <span>{data.summary.totalCount} 条当前队列</span>
          </div>
          <h1 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.04em] text-[var(--foreground)] md:text-[1.65rem]">
            {isFailureMode ? "录音失败记录" : "录音质检工作台"}
          </h1>
          <p className="mt-1 max-w-3xl text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
            {isFailureMode
              ? "失败录音从质检队列拆出，单独查看失败原因、客户、员工和通话时间。"
              : "每条默认折叠，先看员工、客户和时间；需要回听、AI 和转写时再展开。"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/call-recordings"
              prefetch={false}
              className={cn(
                "crm-button h-8 px-3 text-[12px]",
                isFailureMode ? "crm-button-secondary" : "crm-button-primary",
              )}
            >
              质检队列
            </Link>
            <Link
              href="/call-recordings/failures"
              prefetch={false}
              className={cn(
                "crm-button h-8 px-3 text-[12px]",
                isFailureMode ? "crm-button-primary" : "crm-button-secondary",
              )}
            >
              失败记录 {data.summary.failedCount}
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3">
          <div className="px-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
              Identify
            </p>
            <p className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
              客户
            </p>
          </div>
          <div className="px-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
              Listen
            </p>
            <p className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
              回听
            </p>
          </div>
          <div className="px-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
              Decide
            </p>
            <p className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">
              结论
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border-soft)] md:grid-cols-4 md:divide-y-0">
        <SummaryMetric
          label="AI 完成率"
          value={aiRate}
          detail={`${data.summary.aiReadyCount} 完成 / ${data.summary.aiPendingCount} 待处理`}
          icon={Bot}
          tone="text-[var(--color-accent)]"
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
          tone="text-[var(--color-accent)]"
        />
        <SummaryMetric
          label="失败记录"
          value={failureMetricValue}
          detail={failureMetricDetail}
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
  const isFailureMode = data.mode === "failures";
  const visibleRecordingStatuses = recordingStatuses.filter((status) =>
    isFailureMode ? status === "FAILED" : status !== "FAILED",
  );

  return (
    <DataTableWrapper
      title="筛选"
      description="按员工、客户、日期、录音状态和 AI 分数收窄队列。"
      contentClassName="p-0"
      className="border-[var(--color-border-soft)]"
      toolbar={
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Queue Controls</span>
        </div>
      }
    >
      <form
        className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,2fr)_repeat(5,minmax(0,1fr))_minmax(8rem,1fr)_auto]"
        action={isFailureMode ? "/call-recordings/failures" : "/call-recordings"}
      >
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
          {visibleRecordingStatuses.map((status) => (
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

function FieldLine({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: typeof Clock;
  label: string;
  value: string;
}>) {
  return (
    <div className="flex items-center gap-2 text-[11.5px] text-[var(--color-sidebar-muted)]">
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 truncate font-medium text-[var(--foreground)]/82">
        {value}
      </span>
    </div>
  );
}

function SignalPills({
  label,
  values,
}: Readonly<{
  label: string;
  values: string[];
}>) {
  const visibleValues = values.slice(0, 3);

  if (visibleValues.length === 0) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-sidebar-muted)]">
        {label}
      </span>
      {visibleValues.map((value) => (
        <span
          key={value}
          className="inline-flex max-w-full items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--foreground)]/78"
        >
          <span className="truncate">{value}</span>
        </span>
      ))}
    </div>
  );
}

function RecordingAiBlock({ item }: Readonly<{ item: CallRecordingWorkbenchItem }>) {
  const ai = item.aiAnalysis;

  if (!ai) {
    return (
      <div className="rounded-[0.78rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
        暂无 AI 分析
      </div>
    );
  }

  const tone = getQualityTone(ai.qualityScore);

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge
            label={getAiStatusLabel(ai.status)}
            variant={getAiStatusVariant(ai.status)}
          />
          <span className="truncate text-[12px] font-semibold text-[var(--foreground)]">
            {getIntentLabel(ai.customerIntent)}
          </span>
        </div>
        <span
          className={cn(
            "inline-flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold tabular-nums",
            getQualityToneClass(tone),
          )}
        >
          {getScoreLabel(ai.qualityScore)}
        </span>
      </div>

      <p className="line-clamp-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
        {ai.summary?.trim() || "AI 正在整理摘要。"}
      </p>

      <div className="space-y-1.5">
        <SignalPills label="风险" values={ai.riskFlags} />
        <SignalPills label="机会" values={ai.opportunityTags} />
        <SignalPills label="关键词" values={ai.keywords} />
      </div>

      {ai.nextActionSuggestion ? (
        <div className="flex gap-2 rounded-[0.75rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-2 text-[11.5px] leading-5 text-[var(--foreground)]/82">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" />
          <span className="line-clamp-2">{ai.nextActionSuggestion}</span>
        </div>
      ) : null}
    </div>
  );
}

function ReviewSummary({ item }: Readonly<{ item: CallRecordingWorkbenchItem }>) {
  if (!item.latestReview) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-[0.78rem] border border-dashed border-[var(--color-border-soft)] px-3 py-2 text-[12px] text-[var(--color-sidebar-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          人工复核
        </span>
        <span>待复核</span>
      </div>
    );
  }

  return (
    <div className="rounded-[0.78rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2">
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

function RecordingTranscriptBlock({
  item,
}: Readonly<{
  item: CallRecordingWorkbenchItem;
}>) {
  const ai = item.aiAnalysis;
  const transcriptPreview = ai?.transcriptPreview?.trim();
  const transcriptTextLength = ai?.transcriptTextLength ?? 0;
  const hasTranscript = Boolean(ai?.hasTranscript);

  return (
    <section className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--foreground)]">
          <FileText className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
          <span>语音转文字</span>
        </div>
        <span className="text-[11px] font-medium text-[var(--color-sidebar-muted)]">
          {transcriptTextLength > 0 ? `${transcriptTextLength} 字` : hasTranscript ? "按需加载" : "待生成"}
        </span>
      </div>

      {transcriptPreview ? (
        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-[12.5px] leading-6 text-[var(--foreground)]/84">
          {transcriptPreview}
        </p>
      ) : hasTranscript ? (
        <div className="mt-3 rounded-[0.75rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
          为保证队列打开速度，完整转写不进入首屏数据。点击下方按钮后加载当前录音的完整对话。
        </div>
      ) : (
        <div className="mt-3 rounded-[0.75rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
          {ai
            ? "AI 暂未返回有效转写。可检查录音时长、文件大小、ASR 配置或重新入队分析。"
            : "暂无 AI 转写。录音进入 AI 处理后，这里会显示完整对话文本。"}
        </div>
      )}

      {hasTranscript ? <RecordingTranscriptLoader recordingId={item.id} /> : null}
    </section>
  );
}

function RecordingFailureDetails({
  item,
}: Readonly<{
  item: CallRecordingWorkbenchItem;
}>) {
  const callDuration = item.durationSeconds ?? item.callRecord.durationSeconds;
  const failureCode = item.failureCode?.trim() || "UNKNOWN";
  const failureMessage = item.failureMessage?.trim() || "未记录失败原因";

  return (
    <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.65fr)]">
      <section className="rounded-[0.9rem] border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.045)] px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--foreground)]">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-danger)]" aria-hidden="true" />
            失败原因
          </span>
          <span className="inline-flex rounded-full border border-[rgba(220,38,38,0.16)] bg-[var(--color-panel)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
            {failureCode}
          </span>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-[12.5px] leading-6 text-[var(--foreground)]/84">
          {failureMessage}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--color-sidebar-muted)]">
          <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2 py-0.5">
            {item.mimeType}
          </span>
          <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2 py-0.5">
            {formatRecordingFileSize(item.fileSizeBytes)}
          </span>
          <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2 py-0.5">
            {formatDurationSeconds(callDuration)}
          </span>
        </div>
      </section>

      <section className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-3">
        <div className="space-y-1.5">
          <FieldLine
            icon={Clock}
            label="通话"
            value={formatDateTime(item.callRecord.callTime)}
          />
          <FieldLine
            icon={Timer}
            label="时长"
            value={formatDurationSeconds(item.callRecord.durationSeconds)}
          />
          <FieldLine
            icon={UserRound}
            label="员工"
            value={`${item.sales.name} (@${item.sales.username})`}
          />
        </div>
        <div className="mt-3 border-t border-[var(--color-border-soft)] pt-3">
          <Link
            href={`/customers/${item.customer.id}?tab=calls`}
            prefetch={false}
            className="crm-text-link text-[12px] font-semibold"
          >
            打开客户通话记录
          </Link>
          <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {item.callRecord.remark?.trim() || "无备注"}
          </p>
        </div>
      </section>
    </div>
  );
}

function RecordingQueueItem({
  item,
  mode,
}: Readonly<{
  item: CallRecordingWorkbenchItem;
  mode: CallRecordingWorkbenchData["mode"];
}>) {
  const callDuration = item.durationSeconds ?? item.callRecord.durationSeconds;
  const uploadMeta = item.uploadedAt
    ? `上传 ${formatDateTime(item.uploadedAt)}`
    : `创建 ${formatDateTime(item.createdAt)}`;
  const tone = getQualityTone(item.aiAnalysis?.qualityScore);
  const isFailureMode = mode === "failures";
  const failureCode = item.failureCode?.trim() || "UNKNOWN";
  const failureMessage = item.failureMessage?.trim() || "未记录失败原因";

  return (
    <details className="group overflow-hidden rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-xs)] transition-[border-color,background-color,box-shadow] hover:border-[rgba(30,64,175,0.18)] hover:shadow-[var(--color-shell-shadow-sm)] [&>summary::-webkit-details-marker]:hidden">
      <summary className="grid cursor-pointer list-none gap-3 px-3 py-3 md:grid-cols-[minmax(9rem,0.85fr)_minmax(12rem,1.05fr)_minmax(10rem,0.9fr)_minmax(10rem,0.8fr)_auto] md:items-center md:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
            员工
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[var(--foreground)]">
            {item.sales.name}
            <span className="ml-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
              @{item.sales.username}
            </span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
            客户
          </p>
          <p className="mt-1 truncate text-[13px] font-semibold text-[var(--foreground)]">
            {item.customer.name}
          </p>
          <p className="truncate text-[11px] tabular-nums text-[var(--color-sidebar-muted)]">
            {item.customer.phone}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
            时间
          </p>
          <p className="mt-1 truncate text-[12px] font-semibold tabular-nums text-[var(--foreground)]">
            {formatDateTime(item.callRecord.callTime)}
          </p>
          <p className="truncate text-[11px] text-[var(--color-sidebar-muted)]">
            {formatDurationSeconds(item.callRecord.durationSeconds)}
          </p>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
            <StatusBadge
              label={getRecordingStatusLabel(item.status)}
              variant={getRecordingStatusVariant(item.status)}
            />
            {isFailureMode ? (
              <span className="inline-flex max-w-[12rem] rounded-full border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.045)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-danger)]">
                <span className="truncate">{failureCode}</span>
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold tabular-nums",
                  getQualityToneClass(tone),
                )}
              >
                {getScoreLabel(item.aiAnalysis?.qualityScore)}
              </span>
            )}
          </div>
          {isFailureMode ? (
            <p className="mt-1 line-clamp-1 text-right text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
              {failureMessage}
            </p>
          ) : null}
        </div>
        <ChevronDown
          className="h-4 w-4 justify-self-start text-[var(--color-sidebar-muted)] transition-transform group-open:rotate-180 md:justify-self-end"
          aria-hidden="true"
        />
      </summary>

      <div className="border-t border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)]">
        {isFailureMode ? (
          <RecordingFailureDetails item={item} />
        ) : (
          <div className="relative grid overflow-hidden bg-[var(--color-panel)] lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.42fr)]">
            <div className={cn("absolute inset-y-0 left-0 w-1", getQualityRailClass(tone))} />

            <section className="min-w-0 space-y-4 px-4 py-4 pl-5">
              <div className="grid gap-3 xl:grid-cols-[minmax(14rem,0.55fr)_minmax(22rem,1fr)]">
                <div className="min-w-0 space-y-3 rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/customers/${item.customer.id}?tab=calls`}
                        prefetch={false}
                        className="crm-text-link block truncate text-[14px] font-semibold"
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

                  <div className="space-y-1.5">
                    <FieldLine
                      icon={Clock}
                      label="通话"
                      value={formatDateTime(item.callRecord.callTime)}
                    />
                    <FieldLine
                      icon={Timer}
                      label="时长"
                      value={formatDurationSeconds(item.callRecord.durationSeconds)}
                    />
                    <FieldLine
                      icon={UserRound}
                      label="员工"
                      value={`${item.sales.name} (@${item.sales.username})`}
                    />
                  </div>

                  <div className="border-t border-[var(--color-border-soft)] pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2 py-0.5 text-[11px] font-semibold text-[var(--foreground)]">
                        {item.callRecord.resultLabel}
                      </span>
                      <span className="text-[11px] tabular-nums text-[var(--color-sidebar-muted)]">
                        {formatDurationSeconds(callDuration)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                      {item.callRecord.remark?.trim() || "无备注"}
                    </p>
                  </div>
                </div>

                <div className="min-w-0 rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-sidebar-muted)]">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--foreground)]">
                      <FileAudio className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                      录音播放
                    </span>
                    <span>{formatRecordingFileSize(item.fileSizeBytes)}</span>
                  </div>
                  <RecordingAudioPlayer
                    recordingId={item.id}
                    status={item.status}
                    mimeType={item.mimeType}
                    durationSeconds={callDuration}
                    className="shadow-none"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--color-sidebar-muted)]">
                    <span>{uploadMeta}</span>
                    <span className="tabular-nums">{item.mimeType}</span>
                  </div>
                </div>
              </div>

              <RecordingTranscriptBlock item={item} />
            </section>

            <aside className="min-w-0 space-y-3 border-t border-[var(--color-border-soft)] px-4 py-4 lg:border-l lg:border-t-0 lg:self-start">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--foreground)]">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                  AI 分析
                </span>
                <span
                  className={cn(
                    "inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold tabular-nums",
                    getQualityToneClass(tone),
                  )}
                >
                  {getScoreLabel(item.aiAnalysis?.qualityScore)}
                </span>
              </div>
              <RecordingAiBlock item={item} />
              <ReviewSummary item={item} />
            </aside>
          </div>
        )}
      </div>
    </details>
  );
}

function RecordingQueueList({
  items,
  mode,
}: Readonly<{
  items: CallRecordingWorkbenchItem[];
  mode: CallRecordingWorkbenchData["mode"];
}>) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={mode === "failures" ? "暂无失败录音" : "暂无质检录音"}
        description={
          mode === "failures"
            ? "当前筛选条件下没有录音保存失败记录。"
            : "当前筛选条件下没有可查看的通话录音。"
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <RecordingQueueItem key={item.id} item={item} mode={mode} />
      ))}
    </div>
  );
}

function buildQueuePageHref(data: CallRecordingWorkbenchData, page: number) {
  const params = new URLSearchParams();
  const { filters } = data;

  if (filters.search) params.set("q", filters.search);
  if (filters.salesId) params.set("salesId", filters.salesId);
  if (filters.status) params.set("status", filters.status);
  if (filters.aiStatus) params.set("aiStatus", filters.aiStatus);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.minScore) params.set("minScore", filters.minScore);
  if (filters.maxScore) params.set("maxScore", filters.maxScore);
  if (page > 1) params.set("page", String(page));

  const query = params.toString();
  const basePath =
    data.mode === "failures" ? "/call-recordings/failures" : "/call-recordings";
  return query ? `${basePath}?${query}` : basePath;
}

function RecordingQueuePagination({
  data,
}: Readonly<{
  data: CallRecordingWorkbenchData;
}>) {
  const { page, totalPages, pageSize } = data.pagination;

  if (data.summary.totalCount <= pageSize) {
    return null;
  }

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-soft)] pt-3 text-[12px] text-[var(--color-sidebar-muted)]">
      <span className="font-medium">
        第 {page} / {totalPages} 页，每页 {pageSize} 条
      </span>
      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <Link
            href={buildQueuePageHref(data, page - 1)}
            prefetch={false}
            className="crm-button crm-button-secondary h-8 px-3 text-[12px]"
          >
            上一页
          </Link>
        ) : (
          <span className="crm-button crm-button-secondary h-8 cursor-not-allowed px-3 text-[12px] opacity-45">
            上一页
          </span>
        )}
        {hasNext ? (
          <Link
            href={buildQueuePageHref(data, page + 1)}
            prefetch={false}
            className="crm-button crm-button-secondary h-8 px-3 text-[12px]"
          >
            下一页
          </Link>
        ) : (
          <span className="crm-button crm-button-secondary h-8 cursor-not-allowed px-3 text-[12px] opacity-45">
            下一页
          </span>
        )}
      </div>
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
  const isFailureMode = data.mode === "failures";

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
        title={isFailureMode ? "失败记录" : "质检队列"}
        description={
          isFailureMode
            ? "失败录音从质检主队列拆出，默认显示员工、客户、时间和失败原因，展开后查看完整上下文。"
            : "默认只显示员工、客户和通话时间；展开后再回听录音、查看转写和 AI 结论。"
        }
        eyebrow={isFailureMode ? "Failure Queue" : "Review Queue"}
        className="border-[var(--color-border-soft)]"
        contentClassName="p-3"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-success)]" aria-hidden="true" />
              {data.items.length} / {data.summary.totalCount} 条
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)] sm:inline-flex">
              {isFailureMode ? (
                <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-danger)]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden="true" />
              )}
              {isFailureMode
                ? `${data.summary.failedCount} 条失败记录`
                : `${data.summary.aiReadyCount} 条 AI 完成`}
            </span>
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)] sm:inline-flex">
              <Gauge className="h-3.5 w-3.5 text-[var(--color-warning)]" aria-hidden="true" />
              低分优先复核
            </span>
          </div>
        }
      >
        <RecordingQueueList items={data.items} mode={data.mode} />
        <RecordingQueuePagination data={data} />
      </DataTableWrapper>
    </PageShell>
  );
}
