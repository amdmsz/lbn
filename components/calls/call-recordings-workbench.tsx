import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  Bot,
  Headphones,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { PageShell } from "@/components/shared/page-shell";
import { CallTranscriptDialogue } from "@/components/calls/call-transcript-dialogue";
import { RecordingAudioPlayer } from "@/components/calls/recording-audio-player";
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

function getQualityBand(score: number | null | undefined) {
  if (score === null || score === undefined) {
    return "未评分";
  }

  if (score >= 85) {
    return "高质量";
  }

  if (score >= 60) {
    return "可跟进";
  }

  return "需复核";
}

function CompactCell({
  primary,
  secondary,
  className,
}: Readonly<{
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
}>) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="truncate text-[13px] font-medium text-[var(--foreground)]">
        {primary}
      </div>
      {secondary ? (
        <div className="mt-1 truncate text-[11px] text-[var(--color-sidebar-muted)]">
          {secondary}
        </div>
      ) : null}
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
  const signals = [
    {
      label: "AI 完成率",
      value: aiRate,
      detail: `${data.summary.aiReadyCount} 条完成 / ${data.summary.aiPendingCount} 条待处理`,
      icon: Bot,
      tone: "text-[var(--color-primary)]",
    },
    {
      label: "可回听率",
      value: playableRate,
      detail: `${data.summary.readyCount} 条可播放`,
      icon: Headphones,
      tone: "text-[var(--color-success)]",
    },
    {
      label: "异常占比",
      value: failedRate,
      detail: `${data.summary.failedCount} 条失败`,
      icon: Activity,
      tone: "text-[var(--color-danger)]",
    },
  ];

  return (
    <section className="overflow-hidden rounded-[1.2rem] border border-[rgba(79,125,247,0.16)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-md)]">
      <div className="border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 md:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)]">
              <span>Voice Quality Matrix</span>
              <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
              <span>Server Scoped</span>
              <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
              <span>Audit Trace</span>
            </div>
            <h1 className="mt-2 text-[1.45rem] font-semibold tracking-[-0.045em] text-[var(--foreground)] md:text-[1.8rem]">
              录音质检工作台
            </h1>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-6 text-[var(--color-sidebar-muted)]">
              回听录音、查看转写对话、筛查风险与机会信号，所有播放和复核动作保留审计记录。
            </p>
          </div>

          <div className="grid min-w-0 grid-cols-3 gap-2 lg:min-w-[26rem]">
            {signals.map((signal) => {
              const Icon = signal.icon;

              return (
                <div
                  key={signal.label}
                  className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-2.5 shadow-[var(--color-shell-shadow-sm)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                      {signal.label}
                    </p>
                    <Icon className={cn("h-3.5 w-3.5", signal.tone)} aria-hidden="true" />
                  </div>
                  <p className="mt-2 text-[1.15rem] font-semibold tracking-[-0.04em] text-[var(--foreground)]">
                    {signal.value}
                  </p>
                  <p className="mt-1 truncate text-[10.5px] text-[var(--color-sidebar-muted)]">
                    {signal.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid border-t border-[rgba(79,125,247,0.08)] md:grid-cols-4">
        {[
          ["录音总数", data.summary.totalCount, "当前筛选范围"],
          ["可播放", data.summary.readyCount, "已上传并可回听"],
          ["处理中", data.summary.processingCount, "上传或 AI 处理中"],
          ["AI 完成", data.summary.aiReadyCount, `${data.summary.aiPendingCount} 条待处理`],
        ].map(([label, value, note]) => (
          <div
            key={label}
            className="border-b border-r border-[var(--color-border-soft)] px-4 py-3 last:border-r-0 md:border-b-0"
          >
            <p className="text-[11px] font-medium text-[var(--color-sidebar-muted)]">
              {label}
            </p>
            <p className="mt-1 text-[1.15rem] font-semibold tabular-nums tracking-[-0.035em] text-[var(--foreground)]">
              {value}
            </p>
            <p className="mt-0.5 text-[10.5px] text-[var(--color-sidebar-muted)]">
              {note}
            </p>
          </div>
        ))}
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
      description="员工、客户关键词、日期和处理状态。"
      contentClassName="p-0"
      className="border-[rgba(79,125,247,0.12)]"
      toolbar={
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Quality Controls</span>
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
      <div className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
        暂无 AI 分析
      </div>
    );
  }

  return (
    <details className="group rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-2 transition-colors open:border-[rgba(79,125,247,0.22)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12px] font-medium text-[var(--foreground)]">
        <span className="flex min-w-0 items-center gap-2">
          <StatusBadge
            label={getAiStatusLabel(ai.status)}
            variant={getAiStatusVariant(ai.status)}
          />
          <span className="truncate">{getQualityBand(ai.qualityScore)}</span>
        </span>
        {ai.qualityScore !== null ? (
          <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--foreground)]">
            {ai.qualityScore}
          </span>
        ) : null}
      </summary>
      <div className="mt-2 max-w-[31rem] space-y-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
        {ai.summary ? <p className="line-clamp-3">{ai.summary}</p> : null}
        {ai.nextActionSuggestion ? (
          <p className="line-clamp-2">建议：{ai.nextActionSuggestion}</p>
        ) : null}
        {ai.transcriptSegments.length > 0 ? (
          <CallTranscriptDialogue segments={ai.transcriptSegments} maxSegments={5} />
        ) : ai.transcriptText ? (
          <div className="rounded-[0.8rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
              转写
            </p>
            <p className="mt-1 line-clamp-5 text-[12px] leading-5 text-[var(--foreground)]/82">
              {ai.transcriptText}
            </p>
          </div>
        ) : null}
        {ai.riskFlags.length > 0 || ai.opportunityTags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {ai.riskFlags.map((flag) => (
              <span
                key={`risk-${item.id}-${flag}`}
                className="rounded-full border border-[rgba(220,38,38,0.14)] bg-[rgba(220,38,38,0.06)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-danger)]"
              >
                {flag}
              </span>
            ))}
            {ai.opportunityTags.map((tag) => (
              <span
                key={`opportunity-${item.id}-${tag}`}
                className="rounded-full border border-[rgba(22,163,74,0.14)] bg-[rgba(22,163,74,0.06)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-success)]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function RecordingMobileCards({
  items,
}: Readonly<{
  items: CallRecordingWorkbenchItem[];
}>) {
  if (items.length === 0) {
    return (
      <div className="lg:hidden">
        <EmptyState
          title="暂无录音"
          description="当前筛选条件下没有可查看的通话录音。"
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 lg:hidden">
      {items.map((item) => (
        <article
          key={item.id}
          className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-3 shadow-[var(--color-shell-shadow-sm)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/customers/${item.customer.id}?tab=calls`}
                className="crm-text-link text-[14px] font-semibold"
              >
                {item.customer.name}
              </Link>
              <p className="mt-1 text-[11px] tabular-nums text-[var(--color-sidebar-muted)]">
                {item.customer.phone} / {item.sales.name}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium text-[var(--foreground)]">
                {formatDurationSeconds(item.callRecord.durationSeconds)}
              </p>
              <p className="mt-1 text-[10.5px] text-[var(--color-sidebar-muted)]">
                {formatDateTime(item.callRecord.callTime)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge
              label={getRecordingStatusLabel(item.status)}
              variant={getRecordingStatusVariant(item.status)}
            />
            {item.aiAnalysis ? (
              <StatusBadge
                label={`AI ${getAiStatusLabel(item.aiAnalysis.status)}`}
                variant={getAiStatusVariant(item.aiAnalysis.status)}
              />
            ) : null}
            <span className="text-[11px] text-[var(--color-sidebar-muted)]">
              {formatRecordingFileSize(item.fileSizeBytes)}
            </span>
          </div>

          <div className="mt-3">
            <RecordingAudioPlayer
              recordingId={item.id}
              status={item.status}
              mimeType={item.mimeType}
            />
          </div>

          <div className="mt-3 border-t border-[var(--color-border-soft)] pt-3">
            <RecordingAiBlock item={item} />
          </div>
        </article>
      ))}
    </div>
  );
}

function RecordingTable({ items }: Readonly<{ items: CallRecordingWorkbenchItem[] }>) {
  if (items.length === 0) {
    return (
      <div className="hidden lg:block">
        <EmptyState
          title="暂无录音"
          description="当前筛选条件下没有可查看的通话录音。"
        />
      </div>
    );
  }

  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[var(--color-panel)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
            <th className="border-b border-[var(--color-border-soft)] px-3 py-2.5">Call</th>
            <th className="border-b border-[var(--color-border-soft)] px-3 py-2.5">Owner</th>
            <th className="border-b border-[var(--color-border-soft)] px-3 py-2.5">Customer</th>
            <th className="border-b border-[var(--color-border-soft)] px-3 py-2.5">Outcome</th>
            <th className="border-b border-[var(--color-border-soft)] px-3 py-2.5">Audio</th>
            <th className="border-b border-[var(--color-border-soft)] px-3 py-2.5">AI Signal</th>
            <th className="border-b border-[var(--color-border-soft)] px-3 py-2.5">Review</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="align-top transition-colors hover:bg-[var(--color-shell-surface-soft)]"
            >
              <td className="border-b border-[var(--color-border-soft)] px-3 py-3.5">
                <CompactCell
                  primary={formatDateTime(item.callRecord.callTime)}
                  secondary={formatDurationSeconds(item.callRecord.durationSeconds)}
                />
              </td>
              <td className="border-b border-[var(--color-border-soft)] px-3 py-3.5">
                <CompactCell
                  primary={item.sales.name}
                  secondary={`@${item.sales.username}`}
                />
              </td>
              <td className="border-b border-[var(--color-border-soft)] px-3 py-3.5">
                <CompactCell
                  primary={
                    <Link
                      href={`/customers/${item.customer.id}?tab=calls`}
                      className="crm-text-link"
                    >
                      {item.customer.name}
                    </Link>
                  }
                  secondary={item.customer.phone}
                />
              </td>
              <td className="border-b border-[var(--color-border-soft)] px-3 py-3.5">
                <CompactCell
                  primary={item.callRecord.resultLabel}
                  secondary={item.callRecord.remark || "无备注"}
                  className="max-w-[15rem]"
                />
              </td>
              <td className="border-b border-[var(--color-border-soft)] px-3 py-3.5">
                <div className="min-w-[15rem] space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      label={getRecordingStatusLabel(item.status)}
                      variant={getRecordingStatusVariant(item.status)}
                    />
                    <span className="text-[11px] text-[var(--color-sidebar-muted)]">
                      {formatRecordingFileSize(item.fileSizeBytes)}
                    </span>
                  </div>
                  <RecordingAudioPlayer
                    recordingId={item.id}
                    status={item.status}
                    mimeType={item.mimeType}
                  />
                </div>
              </td>
              <td className="border-b border-[var(--color-border-soft)] px-3 py-3.5">
                <RecordingAiBlock item={item} />
              </td>
              <td className="border-b border-[var(--color-border-soft)] px-3 py-3.5">
                {item.latestReview ? (
                  <CompactCell
                    primary={
                      <StatusBadge
                        label={getReviewStatusLabel(item.latestReview.reviewStatus)}
                        variant="info"
                      />
                    }
                    secondary={
                      item.latestReview.manualScore !== null
                        ? `${item.latestReview.manualScore} 分 / ${item.latestReview.reviewerName}`
                        : item.latestReview.reviewerName
                    }
                  />
                ) : (
                  <span className="text-[12px] text-[var(--color-sidebar-muted)]">
                    待复核
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        description="桌面端使用高密度队列表格，手机端自动切换为录音卡片。"
        eyebrow="Review Queue"
        className="border-[rgba(79,125,247,0.12)]"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
              <ShieldCheck className="h-3.5 w-3.5 text-[var(--color-success)]" aria-hidden="true" />
              {data.items.length} / {data.summary.totalCount} 条
            </span>
          </div>
        }
      >
        <RecordingMobileCards items={data.items} />
        <RecordingTable items={data.items} />
      </DataTableWrapper>
    </PageShell>
  );
}
