import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  PhoneCall,
  RotateCcw,
  Sparkles,
  Target,
  UsersRound,
} from "lucide-react";
import {
  BentoActionLink,
  BentoCard,
  BentoGrid,
  BentoMetricCard,
  BentoRadialMetric,
  type BentoTone,
} from "@/components/dashboard/dashboard-bento";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CustomerOperatingDashboardData } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type SalesMetric = {
  key: string;
  label: string;
  value: string;
  note: string;
  tone: BentoTone;
};

const workspaceShellClassName = "crm-workspace-shell";

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
          今天
        </BentoActionLink>
      </div>
    </form>
  );
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

function PoolStat({
  icon,
  label,
  value,
}: Readonly<{
  icon: ReactNode;
  label: string;
  value: string | number;
}>) {
  return (
    <div className="rounded-2xl border border-border bg-muted/25 p-4">
      <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground">
        {icon}
      </div>
      <div className="font-mono text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
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
          tone: "primary",
        },
        {
          key: "connected",
          label: `${metricPrefix}接听`,
          value: String(self.connectedAssignedCount),
          note: `筛选期内拨通并接听的资源，接通率 ${self.connectRate}。`,
          tone: "success",
        },
        {
          key: "todayWechat",
          label: `${metricPrefix}加微`,
          value: String(self.todayAssignedWechatCount),
          note: "筛选期内分配资源里完成加微的客户。",
          tone: "primary",
        },
        {
          key: "historyWechat",
          label: "历史加微",
          value: String(self.historicalWechatAddedCount),
          note: "不是筛选期内分配、但筛选期内额外完成加微。",
          tone: "warning",
        },
        {
          key: "invite",
          label: `${metricPrefix}邀约`,
          value: String(self.todayInvitationCount),
          note: "筛选期内新增直播/活动邀约客户数。",
          tone: "danger",
        },
        {
          key: "revenue",
          label: `${metricPrefix}成交`,
          value: self.todayRevenue,
          note: `筛选期内成交 ${self.todayDealCount} 单，按已通过主单金额统计。`,
          tone: "muted",
        },
      ]
    : [];

  return (
    <WorkbenchLayout
      className="[gap:0.75rem] md:[gap:0.9rem]"
      contentClassName="space-y-3"
      header={
        <div className={workspaceShellClassName}>
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
              <BentoActionLink href="/customers" className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground">
                进入客户中心
                <ArrowUpRight className="h-4 w-4" />
              </BentoActionLink>
            }
            className="border-border bg-card shadow-sm"
          />
        </div>
      }
      toolbar={
        <div className={workspaceShellClassName}>
          <SalesDashboardDateToolbar from={data.filters.from} to={data.filters.to} />
        </div>
      }
    >
      {self ? (
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
              eyebrow={`${metricPrefix}漏斗`}
              title="资源转化进度"
              className="md:col-span-2 lg:col-span-2 lg:row-span-2"
            >
              <div className="space-y-5">
                <ProgressRow
                  label={`${metricPrefix}资源 -> 接听`}
                  value={self.connectedAssignedCount}
                  total={self.todayAssignedCount}
                  tone="bg-primary"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 加微`}
                  value={self.todayAssignedWechatCount}
                  total={self.todayAssignedCount}
                  tone="bg-foreground/70"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 邀约`}
                  value={self.todayInvitationCount}
                  total={self.todayAssignedCount}
                  tone="bg-muted-foreground"
                />
                <ProgressRow
                  label={`${metricPrefix}资源 -> 成交`}
                  value={self.todayDealCount}
                  total={self.todayAssignedCount}
                  tone="bg-primary/70"
                />
              </div>
            </BentoCard>

            <BentoCard
              eyebrow="行动分布"
              title={`${metricPrefix}动作强度`}
              className="md:col-span-1 lg:col-span-2"
            >
              <ActionStrengthRings
                maxActivity={maxActivity}
                items={[
                  ["资源", self.todayAssignedCount, "primary"],
                  ["通话", self.todayCallCount, "success"],
                  ["加微", self.todayWechatAddedCount, "primary"],
                  ["邀约", self.todayInvitationCount, "warning"],
                  ["成交", self.todayDealCount, "success"],
                ]}
              />
            </BentoCard>

            {metrics.slice(4, 6).map((metric) => (
              <BentoMetricCard
                key={metric.key}
                label={metric.label}
                value={metric.value}
                note={metric.note}
                tone={metric.tone}
              />
            ))}

            <BentoCard
              eyebrow="当前客户池"
              title="本人客户状态"
              className="md:col-span-3 lg:col-span-4"
            >
              <div className="grid gap-3 md:grid-cols-4">
                <PoolStat
                  icon={<UsersRound className="h-5 w-5" />}
                  value={self.customerCount}
                  label="当前客户数"
                />
                <PoolStat
                  icon={<PhoneCall className="h-5 w-5" />}
                  value={self.todayCallCount}
                  label={`${metricPrefix}通话记录`}
                />
                <PoolStat
                  icon={<Target className="h-5 w-5" />}
                  value={self.todayAssignedWechatRate}
                  label={`${metricPrefix}资源加微率`}
                />
                <PoolStat
                  icon={<Sparkles className="h-5 w-5" />}
                  value={self.historicalWechatAddedRate}
                  label="历史资源加微占比"
                />
              </div>
            </BentoCard>
          </BentoGrid>
        </div>
      ) : (
        <div className={workspaceShellClassName}>
          <BentoCard eyebrow="暂无数据" title="还没有可展示的个人销售数据">
            <p className="text-sm leading-6 text-muted-foreground">
              当前账号没有匹配到启用中的销售身份，或还没有客户资源。请先确认账号角色和团队归属。
            </p>
            <Link
              href="/customers"
              className="mt-4 inline-flex h-9 items-center rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              返回客户中心
            </Link>
          </BentoCard>
        </div>
      )}
    </WorkbenchLayout>
  );
}
