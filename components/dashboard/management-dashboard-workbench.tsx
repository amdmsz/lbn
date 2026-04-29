import Link from "next/link";
import type { ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Crown,
  LineChart,
  PhoneCall,
  RotateCcw,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import {
  BentoActionLink,
  BentoCard,
  BentoGrid,
  BentoMetricCard,
  BentoMiniStat,
  BentoRadialMetric,
  type BentoTone,
} from "@/components/dashboard/dashboard-bento";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
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

type ManagementMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  tone: BentoTone;
};

const workspaceShellClassName = "crm-workspace-shell";

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
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value} / {total}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/60 shadow-inner">
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: `${percent}%` }}
        />
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
      className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between"
    >
      <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground">
          <CalendarDays className="h-4 w-4" />
        </span>
        时间筛选
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-9 items-center gap-2 rounded-xl border border-border bg-muted/35 px-3 text-xs text-muted-foreground">
          开始
          <input
            type="date"
            name="from"
            defaultValue={from}
            className="bg-transparent text-sm font-medium text-foreground outline-none"
          />
        </label>
        <label className="flex h-9 items-center gap-2 rounded-xl border border-border bg-muted/35 px-3 text-xs text-muted-foreground">
          结束
          <input
            type="date"
            name="to"
            defaultValue={to}
            className="bg-transparent text-sm font-medium text-foreground outline-none"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          应用
        </button>
        <BentoActionLink href="/dashboard">
          <RotateCcw className="h-3.5 w-3.5" />
          今日
        </BentoActionLink>
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
          className="inline-flex min-w-[44px] items-center justify-between gap-1.5 rounded-full border border-border bg-muted/35 px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground"
        >
          <span className="font-semibold text-foreground">{value}</span>
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
      className="group block rounded-2xl border border-border bg-muted/25 p-4 transition hover:-translate-y-px hover:border-primary/30 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-2 font-mono text-xs font-semibold text-primary">
              {rank}
            </span>
            <div className="truncate text-sm font-semibold text-foreground">{row.name}</div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {row.teamName ?? "未分组"} · @{row.username}
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            成交金额
          </div>
          <div className="mt-1 font-mono text-2xl font-semibold tracking-tight text-foreground">
            {row.todayRevenue}
          </div>
        </div>
        <div className="text-right text-xs leading-5 text-muted-foreground">
          <div>出单 {row.todayDealCount}</div>
          <div>邀约 {row.todayInvitationCount}</div>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.max(8, revenuePercent)}%` }}
        />
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
    <div className="rounded-2xl border border-border bg-muted/20 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 lg:w-[18rem]">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-base font-semibold text-foreground">
              {row.name}
            </div>
            <StatusBadge label={row.teamName ?? "未分组"} variant="neutral" />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            @{row.username} · 当前 {row.customerCount} 位客户
          </div>
          <div className="mt-3">
            <ExecutionClassStrip counts={row.executionClassCounts} />
          </div>
        </div>

        <div className="grid flex-1 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <BentoMiniStat label={`${metricPrefix}资源`} value={row.todayAssignedCount} />
          <BentoMiniStat
            label="接通率"
            value={row.connectRate}
            note={`${row.connectedAssignedCount}/${row.todayAssignedCount}`}
          />
          <BentoMiniStat
            label="加微"
            value={row.todayWechatAddedCount}
            note={`历史 ${row.historicalWechatAddedCount}`}
          />
          <BentoMiniStat label="邀约" value={row.todayInvitationCount} />
          <BentoMiniStat label="出单" value={row.todayDealCount} />
          <BentoMiniStat label="销售额" value={row.todayRevenue} />
        </div>

        <div className="flex min-w-[8rem] items-center justify-between gap-3 lg:flex-col lg:items-end">
          <div className="text-xs text-muted-foreground">
            {row.latestFollowUpAt
              ? `最近跟进 ${formatRelativeDateTime(row.latestFollowUpAt)}`
              : "最近跟进 暂无"}
          </div>
          <Link
            href={buildEmployeePoolHref(row)}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-muted hover:text-foreground"
          >
            进入客户池
          </Link>
        </div>
      </div>
    </div>
  );
}

function buildMetrics(data: CustomerOperatingDashboardData): ManagementMetric[] {
  const tones: BentoTone[] = [
    "primary",
    "success",
    "primary",
    "warning",
    "danger",
    "success",
    "muted",
    "primary",
  ];

  return data.summary.map((item, index) => ({
    key: `${item.label}-${index}`,
    label: item.label,
    value: item.value,
    note: item.note,
    tone: tones[index] ?? "muted",
  }));
}

function ActionStrengthRings({
  items,
  maxActivity,
}: Readonly<{
  items: Array<[string, number, BentoTone]>;
  maxActivity: number;
}>) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([label, value, tone]) => {
        const percent = Math.round((value / maxActivity) * 100);

        return (
          <BentoRadialMetric
            key={label}
            label={label}
            value={value}
            percent={percent}
            tone={tone}
          />
        );
      })}
    </div>
  );
}

function HealthCard({
  icon,
  label,
  value,
  percent,
  tone,
}: Readonly<{
  icon: ReactNode;
  label: string;
  value: string;
  percent: number;
  tone: string;
}>) {
  return (
    <div className="rounded-2xl border border-border bg-muted/25 p-4">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground">
        {icon}
      </div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
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
  icon: ReactNode;
  label: string;
  value: string;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/25 px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="text-foreground">{icon}</span>
        {label}
      </div>
      <div className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
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
  const averageConnectRate = Math.round(
    data.employees.reduce((sum, row) => sum + parsePercent(row.connectRate), 0) /
      data.employees.length,
  );

  return (
    <WorkbenchLayout
      className="[gap:0.75rem] md:[gap:0.9rem]"
      contentClassName="space-y-3"
      header={
        <div className={workspaceShellClassName}>
          <PageHeader
            eyebrow={meta.eyebrow}
            title={meta.title}
            description={meta.description}
            meta={
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span>{data.scopeLabel}</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span>{data.periodLabel}</span>
              </div>
            }
            actions={
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <BentoActionLink href="/customers">
                  客户中心
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </BentoActionLink>
                <BentoActionLink href="/customers/public-pool">
                  公海池
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </BentoActionLink>
              </div>
            }
            className="border-border bg-card shadow-sm"
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
          <BentoCard>
            <EmptyState
              title="还没有可展示的员工数据"
              description="当前统计范围内没有匹配到启用中的销售账号，或暂无客户运营数据。"
            />
          </BentoCard>
        </div>
      ) : (
        <div className={workspaceShellClassName}>
          <BentoGrid>
            {metrics.slice(0, 4).map((metric) => (
              <BentoMetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                note={metric.note}
                tone={metric.tone}
              />
            ))}

            <BentoCard
              eyebrow={`${metricPrefix}转化`}
              title="团队资源漏斗"
              className="md:col-span-2 lg:col-span-2 lg:row-span-2"
            >
              <div className="space-y-5">
                <ProgressRow
                  label={`${metricPrefix}资源 -> 接听`}
                  value={totals.connected}
                  total={totals.assigned}
                  tone="bg-primary"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 加微`}
                  value={totals.assignedWechat}
                  total={totals.assigned}
                  tone="bg-foreground/70"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 邀约`}
                  value={totals.invitation}
                  total={totals.assigned}
                  tone="bg-muted-foreground"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 成交`}
                  value={totals.deal}
                  total={totals.assigned}
                  tone="bg-primary/70"
                />
              </div>
            </BentoCard>

            <BentoCard
              eyebrow="行动分布"
              title={`${metricPrefix}团队动作强度`}
              className="md:col-span-1 lg:col-span-2"
            >
              <ActionStrengthRings
                maxActivity={maxActivity}
                items={[
                  ["资源", totals.assigned, "primary"],
                  ["通话", totals.call, "success"],
                  ["加微", totals.wechat, "primary"],
                  ["邀约", totals.invitation, "warning"],
                  ["成交", totals.deal, "success"],
                ]}
              />
            </BentoCard>

            {metrics.slice(4, 8).map((metric) => (
              <BentoMetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                note={metric.note}
                tone={metric.tone}
              />
            ))}

            <BentoCard
              eyebrow="员工排行"
              title={`${metricPrefix}成交先锋`}
              className="md:col-span-3 lg:col-span-2"
            >
              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
                {topEmployees.map((row, index) => (
                  <EmployeePerformanceCard
                    key={row.userId}
                    row={row}
                    rank={index + 1}
                    maxRevenue={totals.revenue || 1}
                  />
                ))}
              </div>
            </BentoCard>

            <BentoCard
              eyebrow="质量观察"
              title="团队转化健康度"
              className="md:col-span-3 lg:col-span-2"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <HealthCard
                  icon={<PhoneCall className="h-5 w-5" />}
                  label="资源接听率"
                  value={`${toPercent(totals.connected, totals.assigned)}%`}
                  percent={toPercent(totals.connected, totals.assigned)}
                  tone="bg-primary"
                />
                <HealthCard
                  icon={<Target className="h-5 w-5" />}
                  label="资源加微率"
                  value={`${toPercent(totals.assignedWechat, totals.assigned)}%`}
                  percent={toPercent(totals.assignedWechat, totals.assigned)}
                  tone="bg-foreground/70"
                />
                <HealthCard
                  icon={<TrendingUp className="h-5 w-5" />}
                  label="加微成交率"
                  value={`${toPercent(totals.deal, totals.wechat)}%`}
                  percent={toPercent(totals.deal, totals.wechat)}
                  tone="bg-primary/70"
                />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <InsightPill
                  icon={<UsersRound className="h-4 w-4" />}
                  label="销售人数"
                  value={`${data.employees.length} 人`}
                />
                <InsightPill
                  icon={<LineChart className="h-4 w-4" />}
                  label="平均接通率"
                  value={`${averageConnectRate}%`}
                />
                <InsightPill
                  icon={<BarChart3 className="h-4 w-4" />}
                  label="当前客户池"
                  value={`${data.employees.reduce((sum, row) => sum + row.customerCount, 0)} 位`}
                />
                <InsightPill
                  icon={<Crown className="h-4 w-4" />}
                  label="最高成交"
                  value={topEmployees[0]?.todayRevenue ?? "¥0"}
                />
              </div>
            </BentoCard>

            <BentoCard
              eyebrow="员工执行明细"
              title="销售员工客户池推进"
              className="md:col-span-3 lg:col-span-4"
            >
              <div className="space-y-3">
                {data.employees.map((row) => (
                  <EmployeeRowCard key={row.userId} row={row} metricPrefix={metricPrefix} />
                ))}
              </div>
            </BentoCard>
          </BentoGrid>
        </div>
      )}
    </WorkbenchLayout>
  );
}
