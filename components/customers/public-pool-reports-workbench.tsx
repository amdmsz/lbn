import Link from "next/link";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PageContextLink } from "@/components/shared/page-context-link";
import { PageHeader } from "@/components/shared/page-header";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  appendCustomerDetailNavigationContext,
  buildCustomerPublicPoolHref,
  buildCustomerPublicPoolReportsHref,
  buildCustomerPublicPoolSettingsHref,
} from "@/lib/customers/public-pool-filter-url";
import type { CustomerPublicPoolReportsData } from "@/lib/customers/public-pool-reports";
import { formatDateTime } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

const workspaceShellClassName = "crm-workspace-shell";

function HeaderActionLink({
  href,
  label,
}: Readonly<{
  href: string;
  label: string;
}>) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-md border border-border/60 bg-[var(--color-shell-surface-soft)] px-3.5 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-[var(--color-shell-hover)] hover:text-foreground"
    >
      {label}
    </Link>
  );
}

function formatAverage(value: number | null, unit: "小时" | "天") {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(1)} ${unit}`;
}

function buildTrendBarWidth(value: number, max: number) {
  if (max <= 0) {
    return "0%";
  }

  return `${Math.max((value / max) * 100, 8)}%`;
}

export function CustomerPublicPoolReportsWorkbench({
  data,
}: Readonly<{
  data: CustomerPublicPoolReportsData;
}>) {
  const moduleTabs = [
    {
      value: "workbench",
      label: "公海池工作台",
      href: buildCustomerPublicPoolHref({
        view: "pool",
        segment: "all",
        search: "",
        reason: "",
        teamId: data.selectedTeam?.id ?? "",
        hasOrders: "all",
        page: 1,
        pageSize: 20,
      }),
    },
    {
      value: "settings",
      label: "团队规则",
      href: buildCustomerPublicPoolSettingsHref(data.selectedTeam?.id ?? ""),
    },
    {
      value: "reports",
      label: "运营报表",
      href: buildCustomerPublicPoolReportsHref({
        teamId: data.filters.teamId,
        windowDays: data.filters.windowDays,
        lingerDays: data.filters.lingerDays,
      }),
    },
  ];

  const maxTrendValue = data.trends.reduce(
    (max, item) => Math.max(max, item.enteredCount, item.claimedCount),
    0,
  );

  return (
    <WorkbenchLayout
      className="!gap-0"
      header={
        <div className={cn(workspaceShellClassName, "mb-4")}>
          <PageHeader
            context={
              <PageContextLink
                href="/customers/public-pool"
                label="返回公海池"
                trail={["客户中心", "公海池", "运营报表"]}
              />
            }
            eyebrow="客户归属生命周期"
            title="公海池运营报表"
            description="查看公海规模、认领效率、滞留风险和团队处理节奏。"
            density="compact"
            className="border-border/60 bg-card shadow-sm"
            meta={
              <>
                <StatusBadge
                  label={data.selectedTeam ? `团队视角 ${data.selectedTeam.name}` : "跨团队视角"}
                  variant="info"
                />
                <StatusBadge label={`窗口 ${data.filters.windowDays} 天`} variant="neutral" />
                <StatusBadge label={`滞留阈值 ${data.filters.lingerDays} 天`} variant="warning" />
              </>
            }
            actions={
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <HeaderActionLink href="/customers/public-pool" label="返回公海池" />
                <HeaderActionLink
                  href={buildCustomerPublicPoolSettingsHref(data.selectedTeam?.id ?? "")}
                  label="查看团队规则"
                />
              </div>
            }
          />
        </div>
      }
      summary={
        <div className={cn(workspaceShellClassName, "mb-5")}>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {data.summaryCards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                note={card.note}
                density="strip"
              />
            ))}
          </div>
        </div>
      }
      toolbar={
        <div className={cn(workspaceShellClassName, "mb-5")}>
          <SectionCard
            eyebrow="报表范围"
            title="报表范围与过滤条件"
            description="按团队、时间窗口和滞留阈值查看当前运营表现。"
            density="compact"
            className="rounded-xl border-border/60 bg-card shadow-sm"
            actions={
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge label={`趋势样本 ${data.trends.length}`} variant="neutral" />
                <StatusBadge label={`长滞留 ${data.longStayItems.length}`} variant="warning" />
                <StatusBadge label={`团队 ${data.teamPerformance.length}`} variant="neutral" />
              </div>
            }
          >
            <div className="space-y-3">
              <RecordTabs items={moduleTabs} activeValue="reports" />

              <form
                action="/customers/public-pool/reports"
                method="get"
                className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
              >
                <label className="space-y-2">
                  <span className="crm-label">团队</span>
                  <select name="teamId" defaultValue={data.filters.teamId} className="crm-select">
                    {data.actor.role === "ADMIN" ? <option value="">全部团队</option> : null}
                    {data.teamOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="crm-label">趋势窗口</span>
                  <select
                    name="windowDays"
                    defaultValue={String(data.filters.windowDays)}
                    className="crm-select"
                  >
                    <option value="7">最近 7 天</option>
                    <option value="30">最近 30 天</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="crm-label">滞留阈值</span>
                  <input
                    type="number"
                    name="lingerDays"
                    defaultValue={data.filters.lingerDays}
                    min={1}
                    max={180}
                    className="crm-input"
                  />
                </label>

                <div className="flex items-end">
                  <button type="submit" className="crm-button crm-button-secondary">
                    更新报表
                  </button>
                </div>
              </form>
            </div>
          </SectionCard>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <DataTableWrapper
            title="入池 / 认领趋势"
            description={`查看最近 ${data.filters.windowDays} 天的节奏变化。`}
            eyebrow="流转信号"
            className="h-full"
          >
            {data.trends.length > 0 ? (
              <div className="space-y-3">
                {data.trends.map((item) => (
                  <div
                    key={item.date}
                    className="rounded-xl border border-border/60 bg-[var(--color-shell-surface-soft)] px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                      <span>{item.date}</span>
                      <span>
                        入池 {item.enteredCount} / 认领 {item.claimedCount}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-xs text-muted-foreground/70">入池</span>
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-[var(--color-warning)]/70"
                            style={{ width: buildTrendBarWidth(item.enteredCount, maxTrendValue) }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-xs text-muted-foreground/70">认领</span>
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-[var(--color-success)]/70"
                            style={{ width: buildTrendBarWidth(item.claimedCount, maxTrendValue) }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无趋势数据" description="当前窗口内没有可展示的趋势记录。" />
            )}
          </DataTableWrapper>

          <DataTableWrapper
            title="原因分布"
            description="查看当前入池原因、回收原因和认领来源。"
            eyebrow="原因分布"
            className="h-full"
          >
            <div className="space-y-4">
              {[
                { title: "当前入池原因", items: data.currentReasonDistribution },
                { title: "近窗回收原因", items: data.recycleReasonDistribution },
                { title: "近窗认领 / 指派来源", items: data.claimSourceDistribution },
              ].map((section) => (
                <div
                  key={section.title}
                  className="rounded-xl border border-border/60 bg-[var(--color-shell-surface-soft)] px-3.5 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">{section.title}</p>
                    <StatusBadge label={`${section.items.length} 类`} variant="neutral" />
                  </div>

                  {section.items.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {section.items.map((item) => (
                        <StatusBadge
                          key={`${section.title}-${item.code}`}
                          label={`${item.label} ${item.count}`}
                          variant="neutral"
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">当前窗口内暂无可展示分布。</p>
                  )}
                </div>
              ))}
            </div>
          </DataTableWrapper>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <DataTableWrapper
            title="团队表现"
            description="用统一口径观察团队当前公海规模、当天处理与滞留压力。"
            eyebrow="团队视角"
          >
            {data.teamPerformance.length > 0 ? (
              <div className="crm-table-shell">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>团队</th>
                      <th>当前公海量</th>
                      <th>今日认领</th>
                      <th>今日回收</th>
                      <th>长期滞留</th>
                      <th>平均认领时长</th>
                      <th>平均滞留时长</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teamPerformance.map((row) => (
                      <tr key={row.teamId ?? row.teamName}>
                        <td>{row.teamName}</td>
                        <td>{row.currentPublicCount}</td>
                        <td>{row.todayClaimCount}</td>
                        <td>{row.todayRecycleCount}</td>
                        <td>{row.longStayCount}</td>
                        <td>{formatAverage(row.averageClaimHours, "小时")}</td>
                        <td>{formatAverage(row.averageDwellDays, "天")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="暂无团队表现数据" description="当前范围内没有相关记录。" />
            )}
          </DataTableWrapper>

          <DataTableWrapper
            title="Owner 表现"
            description="查看认领、重新回公海和离职回收等 owner 处理表现。"
            eyebrow="负责人视角"
          >
            {data.ownerPerformance.length > 0 ? (
              <div className="crm-table-shell">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th>团队</th>
                      <th>认领 / 指派</th>
                      <th>重新回公海</th>
                      <th>离职回收</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ownerPerformance.map((row) => (
                      <tr key={row.ownerId}>
                        <td>
                          <div>{row.ownerName}</div>
                          <div className="text-xs text-muted-foreground/70">@{row.ownerUsername}</div>
                        </td>
                        <td>{row.teamName ?? "未记录团队"}</td>
                        <td>{row.claimCount}</td>
                        <td>{row.recycledBackCount}</td>
                        <td>{row.ownerExitRecycleCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="暂无 owner 数据" description="当前窗口内没有 owner 记录。" />
            )}
          </DataTableWrapper>
        </div>

        <DataTableWrapper
          title="长期滞留明细"
          description={`展示滞留超过 ${data.filters.lingerDays} 天的客户，便于回收与再分配判断。`}
          eyebrow="风险队列"
        >
          {data.longStayItems.length > 0 ? (
            <div className="crm-table-shell">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>客户</th>
                    <th>团队</th>
                    <th>当前原因</th>
                    <th>滞留天数</th>
                    <th>入池次数</th>
                    <th>回收次数</th>
                    <th>最近 owner</th>
                    <th>最近有效跟进</th>
                  </tr>
                </thead>
                <tbody>
                  {data.longStayItems.map((row) => (
                    <tr key={row.customerId}>
                      <td>
                        <Link
                          href={appendCustomerDetailNavigationContext(`/customers/${row.customerId}`, {
                            from: "public-pool",
                            returnTo: buildCustomerPublicPoolReportsHref({
                              teamId: data.filters.teamId,
                              windowDays: data.filters.windowDays,
                              lingerDays: data.filters.lingerDays,
                            }),
                          })}
                          className="font-medium text-foreground underline-offset-2 hover:text-black hover:underline"
                        >
                          {row.customerName}
                        </Link>
                        <div className="text-xs text-muted-foreground/70">{row.phone}</div>
                      </td>
                      <td>{row.teamName ?? "未记录团队"}</td>
                      <td>{row.publicReasonLabel ?? "未记录原因"}</td>
                      <td>{row.inPoolDays}</td>
                      <td>{row.publicEntryCount}</td>
                      <td>{row.recycleCount}</td>
                      <td>{row.lastOwnerName ?? "无最近 owner"}</td>
                      <td>
                        {row.lastEffectiveFollowUpAt
                          ? formatDateTime(row.lastEffectiveFollowUpAt)
                          : "无有效跟进"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="没有长期滞留客户" description="当前筛选条件下没有相关记录。" />
          )}
        </DataTableWrapper>

        <SectionCard
          eyebrow="口径说明"
          title="统计口径"
          description="报表指标的统计口径解释。"
          density="compact"
          className="rounded-xl border-border/60 bg-card shadow-sm"
          actions={<StatusBadge label={`${data.definitions.length} 条口径`} variant="neutral" />}
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {data.definitions.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border/60 bg-[var(--color-shell-surface-soft)] px-3.5 py-3"
              >
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </WorkbenchLayout>
  );
}
