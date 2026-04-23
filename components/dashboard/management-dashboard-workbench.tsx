import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { EntityTable } from "@/components/shared/entity-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { SectionCard } from "@/components/shared/section-card";
import {
  formatRelativeDateTime,
  type CustomerExecutionClass,
} from "@/lib/customers/metadata";
import type {
  CustomerOperatingDashboardData,
  CustomerOperatingDashboardEmployeeRow,
} from "@/lib/customers/queries";

const workspaceShellClassName = "crm-workspace-shell";
const dashboardActionClassName =
  "inline-flex h-8 items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 text-[12px] font-medium text-[var(--color-sidebar-muted)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,color,background-color] duration-200 hover:border-[rgba(111,141,255,0.2)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]";

function getRoleMeta(role: RoleCode) {
  if (role === "ADMIN") {
    return {
      eyebrow: "组织驾驶舱",
      title: "员工客户总览",
      description: "把当日经营推进压回一张员工表，直接下钻客户池继续处理。",
    };
  }

  return {
    eyebrow: "团队驾驶舱",
    title: "员工客户总览",
    description: "先看团队今日推进，再下钻员工客户池。",
  };
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
          className="inline-flex min-w-[46px] items-center justify-between gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[var(--color-sidebar-muted)]"
        >
          <span className="font-semibold text-[var(--foreground)]">{value}</span>
          <span>{counts[value]}</span>
        </span>
      ))}
    </div>
  );
}

function buildSummaryItems(data: CustomerOperatingDashboardData): PageSummaryStripItem[] {
  return data.summary.map((item, index) => ({
    key: `${item.label}-${index}`,
    label: item.label,
    value: item.value,
    note: item.note,
    emphasis: item.emphasis ?? "default",
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
                <span>日报 {data.asOfDateLabel}</span>
              </div>
            }
            actions={
              <div className="flex flex-wrap gap-1.5 lg:justify-end">
                <Link href="/customers" className={dashboardActionClassName}>
                  客户中心
                </Link>
                <Link href="/customers/public-pool" className={dashboardActionClassName}>
                  公海池
                </Link>
              </div>
            }
            className="rounded-[1.05rem] bg-[var(--color-shell-surface)] px-4 py-3 shadow-[var(--color-shell-shadow-sm)] md:px-4 md:py-3.5"
          />
        </div>
      }
      summary={
        <div className={workspaceShellClassName}>
          <PageSummaryStrip items={buildSummaryItems(data)} className="gap-2.5" />
        </div>
      }
    >
      <div className={workspaceShellClassName}>
        <SectionCard
          title="员工执行表"
          description="点击员工直接进入客户池，表内保留当前 ABCDE 分布。"
          className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
          contentClassName="p-3 md:p-4"
        >
          {data.employees.length === 0 ? (
            <EmptyState
              title="当前范围没有员工数据"
              description="先确认团队是否已有在岗销售，或稍后再看今日执行进度。"
            />
          ) : (
            <EntityTable
              density="compact"
              className="rounded-[1rem] shadow-[var(--color-shell-shadow-sm)]"
              columns={[
                {
                  key: "employee",
                  title: "员工",
                  headerClassName: "min-w-[180px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={buildEmployeePoolHref(row)}
                          className="text-[13.5px] font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
                        >
                          {row.name}
                        </Link>
                        <span className="text-[12px] text-[var(--color-sidebar-muted)]">@{row.username}</span>
                      </div>
                      <div className="text-[11px] leading-[1.125rem] text-[var(--color-sidebar-muted)]">
                        <div>{row.teamName ?? "未绑定团队"}</div>
                        <div>
                          {row.latestFollowUpAt
                            ? `最近跟进 ${formatRelativeDateTime(row.latestFollowUpAt)}`
                            : "最近跟进 暂无"}
                        </div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "pool",
                  title: "当前客户池 / ABCDE",
                  headerClassName: "min-w-[280px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <div className="space-y-1.5">
                      <div className="text-[13px] font-medium text-[var(--foreground)]">
                        当前 {row.customerCount} 位客户
                      </div>
                      <ExecutionClassStrip counts={row.executionClassCounts} />
                    </div>
                  ),
                },
                {
                  key: "assigned",
                  title: "今日分配",
                  headerClassName: "min-w-[100px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <div className="text-sm font-semibold text-[var(--foreground)]">
                      {row.todayAssignedCount}
                    </div>
                  ),
                },
                {
                  key: "calls",
                  title: "通话 / 接通率",
                  headerClassName: "min-w-[140px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <div className="space-y-0.5 text-[11px] leading-[1.125rem] text-[var(--color-sidebar-muted)]">
                      <div className="font-medium text-[var(--foreground)]">
                        通话 {row.todayCallCount}
                      </div>
                      <div>
                        接通率 {row.connectRate}
                        {` · ${row.connectedAssignedCount}/${row.todayAssignedCount}`}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "wechat",
                  title: "加微推进",
                  headerClassName: "min-w-[170px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <div className="space-y-0.5 text-[11px] leading-[1.125rem] text-[var(--color-sidebar-muted)]">
                      <div className="font-medium text-[var(--foreground)]">
                        加微 {row.todayWechatAddedCount}
                      </div>
                      <div>
                        历史加微率 {row.historicalWechatAddedRate}
                        {` · 历史 ${row.historicalWechatAddedCount}`}
                      </div>
                      <div>
                        当日线索加微率 {row.todayAssignedWechatRate}
                        {` · 当日 ${row.todayAssignedWechatCount}`}
                      </div>
                    </div>
                  ),
                },
                {
                  key: "result",
                  title: "邀约 / 出单",
                  headerClassName: "min-w-[140px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <div className="space-y-0.5 text-[11px] leading-[1.125rem] text-[var(--color-sidebar-muted)]">
                      <div className="font-medium text-[var(--foreground)]">
                        邀约 {row.todayInvitationCount}
                      </div>
                      <div>出单 {row.todayDealCount}</div>
                    </div>
                  ),
                },
                {
                  key: "revenue",
                  title: "销售额",
                  headerClassName: "min-w-[120px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <div className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                      {row.todayRevenue}
                    </div>
                  ),
                },
                {
                  key: "action",
                  title: "动作",
                  headerClassName: "min-w-[100px]",
                  render: (row: CustomerOperatingDashboardEmployeeRow) => (
                    <Link href={buildEmployeePoolHref(row)} className={dashboardActionClassName}>
                      进入客户池
                    </Link>
                  ),
                },
              ]}
              rows={data.employees}
              getRowKey={(row) => row.userId}
            />
          )}
        </SectionCard>
      </div>
    </WorkbenchLayout>
  );
}
