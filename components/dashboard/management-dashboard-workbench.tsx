import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Crown,
  LineChart,
  PhoneCall,
  RotateCcw,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  formatRelativeDateTime,
  type CustomerExecutionClass,
} from "@/lib/customers/metadata";
import type {
  CustomerOperatingDashboardData,
  CustomerOperatingDashboardEmployeeRow,
} from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type MetricTone = "blue" | "green" | "amber" | "violet" | "rose" | "slate";

type ManagementMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  tone: MetricTone;
};

const workspaceShellClassName = "crm-workspace-shell";
const actionClassName =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 text-[11px] font-medium text-[var(--color-sidebar-muted)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,color,background-color] duration-200 hover:border-[rgba(111,141,255,0.2)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]";

const toneClassNames: Record<MetricTone, string> = {
  blue: "from-blue-50 to-sky-50 text-blue-700 ring-blue-100",
  green: "from-emerald-50 to-green-50 text-emerald-700 ring-emerald-100",
  amber: "from-amber-50 to-orange-50 text-amber-700 ring-amber-100",
  violet: "from-violet-50 to-fuchsia-50 text-violet-700 ring-violet-100",
  rose: "from-rose-50 to-pink-50 text-rose-700 ring-rose-100",
  slate: "from-slate-50 to-zinc-50 text-slate-700 ring-slate-100",
};

function getRoleMeta(role: RoleCode) {
  if (role === "ADMIN") {
    return {
      eyebrow: "组织驾驶舱",
      title: "销售团队经营总览",
      description: "聚合全组织资源分配、接听、加微、邀约与成交，快速定位团队推进质量。",
    };
  }

  return {
    eyebrow: "团队驾驶舱",
    title: "团队员工客户总览",
    description: "先看团队整体推进，再下钻员工客户池，及时发现资源承接与转化断点。",
  };
}

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

function parsePercent(value: string) {
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildEmployeePoolHref(row: CustomerOperatingDashboardEmployeeRow) {
  const params = new URLSearchParams();

  if (row.teamId) {
    params.set("teamId", row.teamId);
  }

  params.set("salesId", row.userId);
  params.set("page", "1");

  return `/customers?${params.toString()}`;
}

function MetricCard({ metric }: Readonly<{ metric: ManagementMetric }>) {
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

function ManagementDashboardDateToolbar({
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
        <button type="submit" className={actionClassName}>
          应用
        </button>
        <Link href="/dashboard" className={actionClassName}>
          <RotateCcw className="h-3.5 w-3.5" />
          今日
        </Link>
      </div>
    </form>
  );
}

function ExecutionClassStrip({
  counts,
}: Readonly<{
  counts: Record<CustomerExecutionClass, number>;
}>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(["A", "B", "C", "D", "E"] as const).map((value) => (
        <span
          key={value}
          className="inline-flex min-w-[44px] items-center justify-between gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[var(--color-sidebar-muted)]"
        >
          <span className="font-semibold text-[var(--foreground)]">{value}</span>
          <span>{counts[value]}</span>
        </span>
      ))}
    </div>
  );
}

function EmployeePerformanceCard({
  row,
  rank,
  maxRevenue,
}: Readonly<{
  row: CustomerOperatingDashboardEmployeeRow;
  rank: number;
  maxRevenue: number;
}>) {
  const revenuePercent = toPercent(row.todayRevenueAmount, maxRevenue);

  return (
    <Link
      href={buildEmployeePoolHref(row)}
      className="group block rounded-[1.05rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-3.5 shadow-[var(--color-shell-shadow-xs)] transition hover:-translate-y-[1px] hover:bg-[var(--color-panel)] hover:shadow-[var(--color-shell-shadow-sm)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--color-accent-soft)] px-1.5 text-[11px] font-semibold text-[var(--color-accent-strong)]">
              {rank}
            </span>
            <div className="truncate text-sm font-semibold text-[var(--foreground)]">
              {row.name}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-sidebar-muted)]">
            {row.teamName ?? "未分组"} · @{row.username}
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-[var(--color-sidebar-muted)] transition group-hover:text-[var(--foreground)]" />
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-[var(--color-sidebar-muted)]">成交金额</div>
          <div className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
            {row.todayRevenue}
          </div>
        </div>
        <div className="text-right text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
          <div>出单 {row.todayDealCount}</div>
          <div>邀约 {row.todayInvitationCount}</div>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-shell-hover)]">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(8, revenuePercent)}%` }} />
      </div>
    </Link>
  );
}

function EmployeeRowCard({
  row,
  metricPrefix,
}: Readonly<{
  row: CustomerOperatingDashboardEmployeeRow;
  metricPrefix: string;
}>) {
  return (
    <div className="rounded-[1.05rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-3.5 shadow-[var(--color-shell-shadow-xs)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 lg:w-[18rem]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-semibold text-[var(--foreground)]">
              {row.name}
            </div>
            <StatusBadge label={row.teamName ?? "未分组"} variant="neutral" />
          </div>
          <div className="mt-1 text-[11px] text-[var(--color-sidebar-muted)]">
            @{row.username} · 当前 {row.customerCount} 位客户
          </div>
          <div className="mt-2">
            <ExecutionClassStrip counts={row.executionClassCounts} />
          </div>
        </div>

        <div className="grid flex-1 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <MiniStat label={`${metricPrefix}资源`} value={String(row.todayAssignedCount)} />
          <MiniStat label="接通率" value={row.connectRate} note={`${row.connectedAssignedCount}/${row.todayAssignedCount}`} />
          <MiniStat label="加微" value={String(row.todayWechatAddedCount)} note={`历史 ${row.historicalWechatAddedCount}`} />
          <MiniStat label="邀约" value={String(row.todayInvitationCount)} />
          <MiniStat label="出单" value={String(row.todayDealCount)} />
          <MiniStat label="销售额" value={row.todayRevenue} />
        </div>

        <div className="flex min-w-[8rem] items-center justify-between gap-3 lg:flex-col lg:items-end">
          <div className="text-[11px] text-[var(--color-sidebar-muted)]">
            {row.latestFollowUpAt
              ? `最近跟进 ${formatRelativeDateTime(row.latestFollowUpAt)}`
              : "最近跟进 暂无"}
          </div>
          <Link href={buildEmployeePoolHref(row)} className={actionClassName}>
            进入客户池
          </Link>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  note,
}: Readonly<{
  label: string;
  value: string;
  note?: string;
}>) {
  return (
    <div className="rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2">
      <div className="text-[10px] font-medium text-[var(--color-sidebar-muted)]">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold tabular-nums text-[var(--foreground)]">
        {value}
      </div>
      {note ? <div className="mt-0.5 text-[10px] text-[var(--color-sidebar-muted)]">{note}</div> : null}
    </div>
  );
}

function buildMetrics(data: CustomerOperatingDashboardData): ManagementMetric[] {
  const tones: MetricTone[] = ["blue", "green", "violet", "amber", "rose", "green", "slate", "violet"];

  return data.summary.map((item, index) => ({
    key: `${item.label}-${index}`,
    label: item.label,
    value: item.value,
    note: item.note,
    tone: tones[index] ?? "slate",
  }));
}

export function ManagementDashboardWorkbench({
  role,
  data,
}: Readonly<{
  role: RoleCode;
  data: CustomerOperatingDashboardData;
}>) {
  const meta = getRoleMeta(role);
  const isToday =
    data.filters.from === data.filters.to && isTodayDateInput(data.filters.from);
  const metricPrefix = isToday ? "今日" : "期间";
  const metrics = buildMetrics(data);
  const totals = data.employees.reduce(
    (result, row) => {
      result.assigned += row.todayAssignedCount;
      result.connected += row.connectedAssignedCount;
      result.wechat += row.todayWechatAddedCount;
      result.assignedWechat += row.todayAssignedWechatCount;
      result.invitation += row.todayInvitationCount;
      result.deal += row.todayDealCount;
      result.call += row.todayCallCount;
      result.revenue = Math.max(result.revenue, row.todayRevenueAmount);
      return result;
    },
    {
      assigned: 0,
      connected: 0,
      wechat: 0,
      assignedWechat: 0,
      invitation: 0,
      deal: 0,
      call: 0,
      revenue: 0,
    },
  );
  const maxActivity = Math.max(
    totals.assigned,
    totals.call,
    totals.wechat,
    totals.invitation,
    totals.deal,
    1,
  );
  const topEmployees = [...data.employees]
    .sort((left, right) => {
      if (right.todayRevenueAmount !== left.todayRevenueAmount) {
        return right.todayRevenueAmount - left.todayRevenueAmount;
      }
      if (right.todayDealCount !== left.todayDealCount) {
        return right.todayDealCount - left.todayDealCount;
      }
      return right.todayAssignedCount - left.todayAssignedCount;
    })
    .slice(0, 3);

  return (
    <WorkbenchLayout
      header={
        <div className={workspaceShellClassName}>
          <PageHeader
            eyebrow={meta.eyebrow}
            title={meta.title}
            description={meta.description}
            meta={
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium tracking-[0.06em] text-[var(--color-sidebar-muted)]">
                <span>{data.scopeLabel}</span>
                <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
                <span>{data.periodLabel}</span>
              </div>
            }
            actions={
              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                <Link href="/customers" className={actionClassName}>
                  客户中心
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <Link href="/customers/public-pool" className={actionClassName}>
                  公海池
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            }
            className="rounded-[1rem] bg-[var(--color-shell-surface)] px-4 py-3 shadow-[var(--color-shell-shadow-sm)] md:px-4 md:py-3.5"
          />
        </div>
      }
      toolbar={
        <div className={workspaceShellClassName}>
          <ManagementDashboardDateToolbar from={data.filters.from} to={data.filters.to} />
        </div>
      }
    >
      {data.employees.length === 0 ? (
        <div className={workspaceShellClassName}>
          <EmptyState
            title="还没有可展示的员工数据"
            description="当前统计范围内没有匹配到启用中的销售账号，或暂无客户运营数据。"
          />
        </div>
      ) : (
        <div className={cn(workspaceShellClassName, "space-y-3")}> 
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {metrics.slice(0, 8).map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <SectionCard eyebrow={`${metricPrefix}转化`} title="团队资源漏斗">
              <div className="space-y-5">
                <ProgressRow
                  label={`${metricPrefix}资源 -> 接听`}
                  value={totals.connected}
                  total={totals.assigned}
                  tone="bg-blue-500"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 加微`}
                  value={totals.assignedWechat}
                  total={totals.assigned}
                  tone="bg-violet-500"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 邀约`}
                  value={totals.invitation}
                  total={totals.assigned}
                  tone="bg-rose-500"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 成交`}
                  value={totals.deal}
                  total={totals.assigned}
                  tone="bg-emerald-500"
                />
              </div>
            </SectionCard>

            <SectionCard eyebrow="行动分布" title={`${metricPrefix}团队动作强度`}>
              <div className="flex h-64 items-end gap-3 px-1 pt-4">
                {[
                  ["资源", totals.assigned, "bg-blue-500"],
                  ["通话", totals.call, "bg-sky-500"],
                  ["加微", totals.wechat, "bg-violet-500"],
                  ["邀约", totals.invitation, "bg-rose-500"],
                  ["成交", totals.deal, "bg-emerald-500"],
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

          <div className="grid gap-3 xl:grid-cols-[0.95fr_1.05fr]">
            <SectionCard eyebrow="员工排行" title={`${metricPrefix}成交先锋`}>
              <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1">
                {topEmployees.map((row, index) => (
                  <EmployeePerformanceCard
                    key={row.userId}
                    row={row}
                    rank={index + 1}
                    maxRevenue={totals.revenue || 1}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard eyebrow="质量观察" title="团队转化健康度">
              <div className="grid gap-3 sm:grid-cols-3">
                <HealthCard
                  icon={<PhoneCall className="h-5 w-5" />}
                  label="资源接听率"
                  value={`${toPercent(totals.connected, totals.assigned)}%`}
                  percent={toPercent(totals.connected, totals.assigned)}
                  tone="bg-blue-500"
                />
                <HealthCard
                  icon={<Target className="h-5 w-5" />}
                  label="资源加微率"
                  value={`${toPercent(totals.assignedWechat, totals.assigned)}%`}
                  percent={toPercent(totals.assignedWechat, totals.assigned)}
                  tone="bg-violet-500"
                />
                <HealthCard
                  icon={<TrendingUp className="h-5 w-5" />}
                  label="加微成交率"
                  value={`${toPercent(totals.deal, totals.wechat)}%`}
                  percent={toPercent(totals.deal, totals.wechat)}
                  tone="bg-emerald-500"
                />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <InsightPill icon={<UsersRound className="h-4 w-4" />} label="销售人数" value={`${data.employees.length} 人`} />
                <InsightPill icon={<LineChart className="h-4 w-4" />} label="平均接通率" value={`${Math.round(data.employees.reduce((sum, row) => sum + parsePercent(row.connectRate), 0) / data.employees.length)}%`} />
                <InsightPill icon={<BarChart3 className="h-4 w-4" />} label="当前客户池" value={`${data.employees.reduce((sum, row) => sum + row.customerCount, 0)} 位`} />
                <InsightPill icon={<Crown className="h-4 w-4" />} label="最高成交" value={topEmployees[0]?.todayRevenue ?? "¥0"} />
              </div>
            </SectionCard>
          </div>

          <SectionCard eyebrow="员工执行明细" title="销售员工客户池推进">
            <div className="space-y-2">
              {data.employees.map((row) => (
                <EmployeeRowCard key={row.userId} row={row} metricPrefix={metricPrefix} />
              ))}
            </div>
          </SectionCard>
        </div>
      )}
    </WorkbenchLayout>
  );
}

function HealthCard({
  icon,
  label,
  value,
  percent,
  tone,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  value: string;
  percent: number;
  tone: string;
}>) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-shell-surface)] text-[var(--foreground)]">
        {icon}
      </div>
      <div className="text-[12px] text-[var(--color-sidebar-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
        {value}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-shell-hover)]">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function InsightPill({
  icon,
  label,
  value,
}: Readonly<{
  icon: React.ReactNode;
  label: string;
  value: string;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[12px] text-[var(--color-sidebar-muted)]">
        <span className="text-[var(--foreground)]">{icon}</span>
        {label}
      </div>
      <div className="text-sm font-semibold tabular-nums text-[var(--foreground)]">{value}</div>
    </div>
  );
}
