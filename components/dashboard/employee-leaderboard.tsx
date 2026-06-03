"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowUpRight, Flame, Medal, Trophy } from "lucide-react";
import type { CustomerOperatingDashboardEmployeeRow } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

type LeaderboardPeriod = "day" | "week" | "month";
type DetectedPeriod = LeaderboardPeriod | "custom";

const periodOptions = [
  { key: "day", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
] as const satisfies Array<{ key: LeaderboardPeriod; label: string }>;

const periodLabels: Record<LeaderboardPeriod, string> = {
  day: "今日",
  week: "本周",
  month: "本月",
};

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRangeForPeriod(period: LeaderboardPeriod) {
  const today = new Date();
  const todayStr = formatDateInputValue(today);

  if (period === "day") {
    return { from: todayStr, to: todayStr };
  }

  if (period === "week") {
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    return { from: formatDateInputValue(monday), to: todayStr };
  }

  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: formatDateInputValue(firstDay), to: todayStr };
}

function detectCurrentPeriod(from: string, to: string): DetectedPeriod {
  const today = new Date();
  const todayStr = formatDateInputValue(today);

  if (from === todayStr && to === todayStr) {
    return "day";
  }

  if (from === formatDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)) && to === todayStr) {
    return "month";
  }

  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);

  if (from === formatDateInputValue(monday) && to === todayStr) {
    return "week";
  }

  return "custom";
}

const rankBadgeStyles: Record<number, string> = {
  1: "border-amber-200 bg-amber-50 text-amber-700",
  2: "border-slate-200 bg-slate-50 text-slate-600",
  3: "border-orange-200 bg-orange-50 text-orange-700",
};

function RankBadge({ rank }: Readonly<{ rank: number }>) {
  if (rank <= 3) {
    const Icon = rank === 1 ? Trophy : Medal;

    return (
      <span
        className={cn(
          "inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full border px-2 font-mono text-xs font-semibold",
          rankBadgeStyles[rank],
        )}
        aria-label={`第 ${rank} 名`}
      >
        <Icon className="h-3.5 w-3.5" />
        {rank}
      </span>
    );
  }

  return (
    <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-border bg-muted/40 px-2 font-mono text-xs font-semibold text-muted-foreground">
      {rank}
    </span>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "0%";
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
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

function MetricCell({
  label,
  value,
  isHighlight,
  className,
}: Readonly<{
  label: string;
  value: string | number;
  isHighlight?: boolean;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2 text-left sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-center",
        className,
      )}
    >
      <div className="text-[11px] font-medium text-muted-foreground sm:text-[10px] sm:uppercase sm:tracking-wider">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate font-mono text-sm font-semibold tabular-nums",
          isHighlight ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LeaderboardRow({
  row,
  rank,
  isTop,
  leaderRevenueAmount,
}: Readonly<{
  row: CustomerOperatingDashboardEmployeeRow;
  rank: number;
  isTop: boolean;
  leaderRevenueAmount: number;
}>) {
  const revenueGap = Math.max(0, leaderRevenueAmount - row.todayRevenueAmount);
  const chaseLabel =
    rank === 1
      ? "当前领跑"
      : revenueGap > 0
        ? `距榜首 ${formatCurrency(revenueGap)}`
        : "并列冲刺";

  return (
    <Link
      href={buildEmployeePoolHref(row)}
      className={cn(
        "group grid gap-3 rounded-xl border px-3 py-3 transition hover:-translate-y-px hover:border-primary/30 hover:bg-muted/30 sm:grid-cols-[auto_minmax(8rem,1fr)_minmax(24rem,2fr)_auto] sm:items-center sm:px-4",
        isTop
          ? "border-primary/20 bg-primary/[0.03]"
          : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-3 sm:contents">
        <RankBadge rank={rank} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-foreground">
              {row.name}
            </div>
            {rank <= 3 ? (
              <span className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                Top {rank}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {row.teamName ?? "未分组"} · @{row.username}
          </div>
          <div className="mt-1 hidden items-center gap-1 text-[11px] font-medium text-muted-foreground sm:flex">
            <Flame
              className={cn(
                "h-3.5 w-3.5",
                rank === 1 ? "text-orange-500" : "text-muted-foreground",
              )}
            />
            {chaseLabel}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5 sm:items-center">
        <MetricCell label="加微" value={row.todayWechatAddedCount} />
        <MetricCell label="出单" value={row.todayDealCount} />
        <MetricCell
          label="业绩"
          value={row.todayRevenue}
          isHighlight={row.todayRevenueAmount > 0}
          className="col-span-2 sm:col-span-1"
        />
        <MetricCell label="接通率" value={row.connectRate} />
        <MetricCell label="邀约" value={row.todayInvitationCount} />
      </div>

      <ArrowUpRight className="hidden h-4 w-4 text-muted-foreground transition group-hover:text-primary sm:block" />
    </Link>
  );
}

export function EmployeeLeaderboard({
  employees,
  currentFrom,
  currentTo,
}: Readonly<{
  employees: CustomerOperatingDashboardEmployeeRow[];
  currentFrom: string;
  currentTo: string;
}>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPeriod = detectCurrentPeriod(currentFrom, currentTo);

  const rankedEmployees = [...employees].sort((a, b) => {
    if (b.todayRevenueAmount !== a.todayRevenueAmount) {
      return b.todayRevenueAmount - a.todayRevenueAmount;
    }
    if (b.todayDealCount !== a.todayDealCount) {
      return b.todayDealCount - a.todayDealCount;
    }
    if (b.todayWechatAddedCount !== a.todayWechatAddedCount) {
      return b.todayWechatAddedCount - a.todayWechatAddedCount;
    }
    return b.todayInvitationCount - a.todayInvitationCount;
  });
  const leaderRevenueAmount = rankedEmployees[0]?.todayRevenueAmount ?? 0;

  function buildPeriodHref(period: LeaderboardPeriod) {
    const range = getDateRangeForPeriod(period);
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", range.from);
    params.set("to", range.to);
    return `${pathname}?${params.toString()}`;
  }

  const totals = employees.reduce(
    (result, row) => {
      result.wechat += row.todayWechatAddedCount;
      result.deals += row.todayDealCount;
      result.revenue += row.todayRevenueAmount;
      result.connected += row.connectedAssignedCount;
      result.assigned += row.todayAssignedCount;
      result.invitations += row.todayInvitationCount;
      return result;
    },
    {
      wechat: 0,
      deals: 0,
      revenue: 0,
      connected: 0,
      assigned: 0,
      invitations: 0,
    },
  );
  const activePeriodLabel =
    currentPeriod === "custom" ? "自定义周期" : periodLabels[currentPeriod];

  return (
    <section className="md:col-span-3 lg:col-span-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            员工排行
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">
              员工竞争排行榜
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700">
              <Flame className="h-3.5 w-3.5" />
              {employees.length} 人竞争中
            </span>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {activePeriodLabel}按业绩优先排名，同分看出单、加微和邀约进场。
          </p>
        </div>

        <div className="flex w-full items-center gap-1 rounded-xl border border-border bg-muted/30 p-1 sm:w-auto">
          {periodOptions.map((period) => (
            <Link
              key={period.key}
              href={buildPeriodHref(period.key)}
              aria-current={currentPeriod === period.key ? "page" : undefined}
              className={cn(
                "inline-flex h-8 flex-1 items-center justify-center rounded-lg px-3 text-xs font-medium transition sm:flex-none sm:px-4",
                currentPeriod === period.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {period.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-5">
        <div className="text-center">
          <div className="text-[11px] font-medium text-muted-foreground">团队加微</div>
          <div className="font-mono text-lg font-bold tabular-nums text-foreground">{totals.wechat}</div>
        </div>
        <div className="text-center">
          <div className="text-[11px] font-medium text-muted-foreground">团队出单</div>
          <div className="font-mono text-lg font-bold tabular-nums text-foreground">{totals.deals}</div>
        </div>
        <div className="text-center">
          <div className="text-[11px] font-medium text-muted-foreground">团队业绩</div>
          <div className="font-mono text-lg font-bold tabular-nums text-primary">
            {formatCurrency(totals.revenue)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[11px] font-medium text-muted-foreground">团队接通率</div>
          <div className="font-mono text-lg font-bold tabular-nums text-foreground">
            {formatPercent(totals.connected, totals.assigned)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[11px] font-medium text-muted-foreground">团队邀约</div>
          <div className="font-mono text-lg font-bold tabular-nums text-foreground">{totals.invitations}</div>
        </div>
      </div>

      <div className="hidden items-center gap-3 px-4 py-1 sm:grid sm:grid-cols-[auto_minmax(8rem,1fr)_minmax(24rem,2fr)_auto]">
        <div className="min-w-9 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          排名
        </div>
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          员工
        </div>
        <div className="grid grid-cols-5 gap-2">
          <div className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">加微</div>
          <div className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">出单</div>
          <div className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">业绩</div>
          <div className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">接通率</div>
          <div className="text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">邀约</div>
        </div>
        <div className="w-4" />
      </div>

      <div className="space-y-2">
        {rankedEmployees.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无数据
          </div>
        ) : (
          rankedEmployees.map((row, index) => (
            <LeaderboardRow
              key={row.userId}
              row={row}
              rank={index + 1}
              isTop={index < 3}
              leaderRevenueAmount={leaderRevenueAmount}
            />
          ))
        )}
      </div>
    </section>
  );
}
