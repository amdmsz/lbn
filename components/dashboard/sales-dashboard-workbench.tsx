import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  PhoneCall,
  RotateCcw,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CustomerOperatingDashboardData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type SalesMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  tone: "blue" | "green" | "amber" | "violet" | "rose" | "slate";
};

const toneClassNames: Record<SalesMetric["tone"], string> = {
  blue: "from-blue-50 to-sky-50 text-blue-700 ring-blue-100",
  green: "from-emerald-50 to-green-50 text-emerald-700 ring-emerald-100",
  amber: "from-amber-50 to-orange-50 text-amber-700 ring-amber-100",
  violet: "from-violet-50 to-fuchsia-50 text-violet-700 ring-violet-100",
  rose: "from-rose-50 to-pink-50 text-rose-700 ring-rose-100",
  slate: "from-slate-50 to-zinc-50 text-slate-700 ring-slate-100",
};

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function isTodayDateInput(value: string) {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return value === `${year}-${month}-${day}`;
}

function MetricCard({ metric }: Readonly<{ metric: SalesMetric }>) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-4 shadow-[var(--color-shell-shadow-xs)]">
      <div
        className={cn(
          "mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ring-1",
          toneClassNames[metric.tone],
        )}
      >
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="text-[12px] font-medium text-[var(--color-sidebar-muted)]">
        {metric.label}
      </div>
      <div className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
        {metric.value}
      </div>
      <div className="mt-2 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
        {metric.note}
      </div>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  total,
  tone,
}: Readonly<{
  label: string;
  value: number;
  total: number;
  tone: string;
}>) {
  const percent = toPercent(value, total);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-[var(--foreground)]">{label}</span>
        <span className="tabular-nums text-[var(--color-sidebar-muted)]">
          {value} / {total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-shell-hover)]">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function SalesDashboardDateToolbar({
  from,
  to,
}: Readonly<{
  from: string;
  to: string;
}>) {
  return (
    <form
      action="/dashboard"
      className="flex flex-col gap-2 rounded-[1.1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-2.5 shadow-[var(--color-shell-shadow-xs)] md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-center gap-2 px-1 text-[12px] font-medium text-[var(--color-sidebar-muted)]">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
          <CalendarDays className="h-4 w-4" />
        </span>
        时间筛选
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 items-center gap-2 rounded-[0.8rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 text-[12px] text-[var(--color-sidebar-muted)]">
          开始
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="bg-transparent text-[13px] font-medium text-[var(--foreground)] outline-none"
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-[0.8rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 text-[12px] text-[var(--color-sidebar-muted)]">
          结束
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="bg-transparent text-[13px] font-medium text-[var(--foreground)] outline-none"
          />
        </label>
        <button type="submit" className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm">
          应用
        </button>
        <Link href="/dashboard" className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
          <RotateCcw className="h-4 w-4" />
          今天
        </Link>
      </div>
    </form>
  );
}

export function SalesDashboardWorkbench({
  data,
}: Readonly<{ data: CustomerOperatingDashboardData }>) {
  const self = data.employees[0] ?? null;
  const isToday = data.filters.from === data.filters.to && isTodayDateInput(data.filters.from);
  const metricPrefix = isToday ? "今日" : "期间";
  const maxActivity = Math.max(
    self?.todayAssignedCount ?? 0,
    self?.todayCallCount ?? 0,
    self?.todayWechatAddedCount ?? 0,
    self?.todayInvitationCount ?? 0,
    self?.todayDealCount ?? 0,
    1,
  );
  const metrics: SalesMetric[] = self
    ? [
        {
          key: "assigned",
          label: `${metricPrefix}资源`,
          value: String(self.todayAssignedCount),
          note: `${data.periodLabel} 分配到你名下的客户资源。`,
          tone: "blue",
        },
        {
          key: "connected",
          label: `${metricPrefix}接听`,
          value: String(self.connectedAssignedCount),
          note: `筛选期内拨通并接听的资源，接通率 ${self.connectRate}。`,
          tone: "green",
        },
        {
          key: "todayWechat",
          label: `${metricPrefix}加微`,
          value: String(self.todayAssignedWechatCount),
          note: "筛选期内分配资源里完成加微的客户。",
          tone: "violet",
        },
        {
          key: "historyWechat",
          label: "历史加微",
          value: String(self.historicalWechatAddedCount),
          note: "不是筛选期内分配、但筛选期内额外完成加微。",
          tone: "amber",
        },
        {
          key: "invite",
          label: `${metricPrefix}邀约`,
          value: String(self.todayInvitationCount),
          note: "筛选期内新增直播/活动邀约客户数。",
          tone: "rose",
        },
        {
          key: "revenue",
          label: `${metricPrefix}成交`,
          value: self.todayRevenue,
          note: `筛选期内成交 ${self.todayDealCount} 单，按已通过主单金额统计。`,
          tone: "slate",
        },
      ]
    : [];

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="个人销售驾驶舱"
          title="今日作战看板"
          description="只展示你自己的资源、接听、加微、邀约和成交数据；客户执行仍回到客户中心。"
          meta={
            <>
              <StatusBadge label={data.periodLabel} variant="info" />
              <StatusBadge label="本人数据" variant="success" />
            </>
          }
          actions={
            <Link href="/customers" className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm">
              进入客户中心
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          }
        />
      }
      toolbar={<SalesDashboardDateToolbar from={data.filters.from} to={data.filters.to} />}
    >
      {self ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard eyebrow={`${metricPrefix}漏斗`} title="资源转化进度">
              <div className="space-y-5">
                <ProgressRow
                  label={`${metricPrefix}资源 -> 接听`}
                  value={self.connectedAssignedCount}
                  total={self.todayAssignedCount}
                  tone="bg-blue-500"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 加微`}
                  value={self.todayAssignedWechatCount}
                  total={self.todayAssignedCount}
                  tone="bg-violet-500"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 邀约`}
                  value={self.todayInvitationCount}
                  total={self.todayAssignedCount}
                  tone="bg-rose-500"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 成交`}
                  value={self.todayDealCount}
                  total={self.todayAssignedCount}
                  tone="bg-emerald-500"
                />
              </div>
            </SectionCard>

            <SectionCard eyebrow="行动分布" title={`${metricPrefix}动作强度`}>
              <div className="flex h-64 items-end gap-3 px-1 pt-4">
                {[
                  ["资源", self.todayAssignedCount, "bg-blue-500"],
                  ["通话", self.todayCallCount, "bg-sky-500"],
                  ["加微", self.todayWechatAddedCount, "bg-violet-500"],
                  ["邀约", self.todayInvitationCount, "bg-rose-500"],
                  ["成交", self.todayDealCount, "bg-emerald-500"],
                ].map(([label, rawValue, color]) => {
                  const value = Number(rawValue);
                  const height = Math.max(10, Math.round((value / maxActivity) * 100));

                  return (
                    <div key={String(label)} className="flex flex-1 flex-col items-center gap-2">
                      <div className="text-xs font-semibold tabular-nums text-[var(--foreground)]">
                        {value}
                      </div>
                      <div className="flex h-40 w-full items-end rounded-full bg-[var(--color-shell-hover)] p-1">
                        <div
                          className={cn("w-full rounded-full", String(color))}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-[var(--color-sidebar-muted)]">{label}</div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>

          <SectionCard eyebrow="当前客户池" title="本人客户状态">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4">
                <UsersRound className="mb-3 h-5 w-5 text-blue-500" />
                <div className="text-2xl font-semibold">{self.customerCount}</div>
                <div className="text-xs text-[var(--color-sidebar-muted)]">当前客户数</div>
              </div>
              <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4">
                <PhoneCall className="mb-3 h-5 w-5 text-emerald-500" />
                <div className="text-2xl font-semibold">{self.todayCallCount}</div>
                <div className="text-xs text-[var(--color-sidebar-muted)]">{metricPrefix}通话记录</div>
              </div>
              <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4">
                <Target className="mb-3 h-5 w-5 text-violet-500" />
                <div className="text-2xl font-semibold">{self.todayAssignedWechatRate}</div>
                <div className="text-xs text-[var(--color-sidebar-muted)]">{metricPrefix}资源加微率</div>
              </div>
              <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4">
                <Sparkles className="mb-3 h-5 w-5 text-amber-500" />
                <div className="text-2xl font-semibold">{self.historicalWechatAddedRate}</div>
                <div className="text-xs text-[var(--color-sidebar-muted)]">历史资源加微占比</div>
              </div>
            </div>
          </SectionCard>
        </>
      ) : (
        <SectionCard eyebrow="暂无数据" title="还没有可展示的个人销售数据">
          <p className="text-sm text-[var(--color-sidebar-muted)]">
            当前账号没有匹配到启用中的销售身份，或还没有客户资源。请先确认账号角色和团队归属。
          </p>
        </SectionCard>
      )}
    </WorkbenchLayout>
  );
}
