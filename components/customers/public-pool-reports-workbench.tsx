import Link from "next/link";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { RecordTabs } from "@/components/shared/record-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import {
  appendCustomerDetailNavigationContext,
  buildCustomerPublicPoolHref,
  buildCustomerPublicPoolReportsHref,
  buildCustomerPublicPoolSettingsHref,
} from "@/lib/customers/public-pool-filter-url";
import type { CustomerPublicPoolReportsData } from "@/lib/customers/public-pool-reports";
import { formatDateTime } from "@/lib/customers/metadata";

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
    <div className="crm-page">
      <SummaryHeader
        eyebrow="Public Pool Analytics"
        title="公海池运营报表"
        description="围绕当前 ownership lifecycle 回看公海规模、回收效率、认领效率和长期滞留，不依赖自动分配引擎也能先形成管理闭环。"
        badges={
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
          <div className="flex flex-wrap gap-2">
            <Link href="/customers/public-pool" className="crm-button crm-button-secondary">
              返回公海池
            </Link>
            <Link
              href={buildCustomerPublicPoolSettingsHref(data.selectedTeam?.id ?? "")}
              className="crm-button crm-button-secondary"
            >
              查看团队规则
            </Link>
          </div>
        }
        metrics={[
          {
            label: "当前公海池总量",
            value: data.summaryCards[0]?.value ?? "0",
            hint: data.summaryCards[0]?.note ?? "",
          },
          {
            label: "今日认领数",
            value: data.summaryCards[2]?.value ?? "0",
            hint: data.summaryCards[2]?.note ?? "",
          },
          {
            label: "超时未领数",
            value: data.summaryCards[4]?.value ?? "0",
            hint: data.summaryCards[4]?.note ?? "",
          },
          {
            label: "锁定中数量",
            value: data.summaryCards[5]?.value ?? "0",
            hint: data.summaryCards[5]?.note ?? "",
          },
        ]}
      />

      <div className="crm-subtle-panel">
        <RecordTabs items={moduleTabs} activeValue="reports" />
      </div>

      <DataTableWrapper
        className="mt-5"
        title="报表范围"
        description="先按团队看健康度，再切换窗口复盘近 7 / 30 天波动。ADMIN 可跨团队看，SUPERVISOR 固定本团队。"
      >
        <form
          action="/customers/public-pool/reports"
          method="get"
          className="grid gap-3 md:grid-cols-[minmax(0,260px)_160px_160px_auto]"
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
            <select name="windowDays" defaultValue={String(data.filters.windowDays)} className="crm-select">
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
      </DataTableWrapper>

      <DataTableWrapper className="mt-5" title="核心指标" description="先看池子规模、今日流入流出和锁定状态，再决定是盯规则还是盯承接。">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {data.summaryCards.map((card) => (
            <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} />
          ))}
        </div>
      </DataTableWrapper>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <DataTableWrapper
          title="入池 / 认领趋势"
          description={`近 ${data.filters.windowDays} 天看公海流入与领用节奏，判断池子是在消化还是继续堆积。`}
        >
          {data.trends.length > 0 ? (
            <div className="space-y-3">
              {data.trends.map((item) => (
                <div key={item.date} className="space-y-2 rounded-[16px] border border-black/7 bg-white/72 p-3">
                  <div className="flex items-center justify-between text-sm text-black/68">
                    <span>{item.date}</span>
                    <span>入池 {item.enteredCount} / 认领 {item.claimedCount}</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-black/50">入池</span>
                      <div className="h-2 flex-1 rounded-full bg-black/6">
                        <div
                          className="h-2 rounded-full bg-[rgba(160,106,29,0.72)]"
                          style={{ width: buildTrendBarWidth(item.enteredCount, maxTrendValue) }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-black/50">认领</span>
                      <div className="h-2 flex-1 rounded-full bg-black/6">
                        <div
                          className="h-2 rounded-full bg-[rgba(47,107,71,0.74)]"
                          style={{ width: buildTrendBarWidth(item.claimedCount, maxTrendValue) }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无趋势数据" description="当前窗口内还没有可展示的公海池流转事件。" />
          )}
        </DataTableWrapper>

        <DataTableWrapper
          title="原因分布"
          description="同时看当前池内原因、近窗回收原因和认领来源，判断规则过严还是承接能力不足。"
        >
          <div className="space-y-4">
            {[
              { title: "当前入池原因", items: data.currentReasonDistribution },
              { title: "近窗回收原因", items: data.recycleReasonDistribution },
              { title: "近窗认领 / 指派来源", items: data.claimSourceDistribution },
            ].map((section) => (
              <div key={section.title} className="rounded-[16px] border border-black/7 bg-white/72 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-black/80">{section.title}</p>
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
                  <p className="mt-3 text-sm text-black/52">当前窗口内暂无可展示分布。</p>
                )}
              </div>
            ))}
          </div>
        </DataTableWrapper>
      </div>

      <DataTableWrapper
        className="mt-5"
        title="团队表现"
        description="看团队公海量、今日流转和平均认领时长，判断是规则需要调，还是承接节奏失衡。"
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
          <EmptyState title="暂无团队表现数据" description="当前范围内还没有可展示的团队级公海指标。" />
        )}
      </DataTableWrapper>

      <DataTableWrapper
        className="mt-5"
        title="Owner 表现"
        description="看谁在承接、谁回收得多、谁触发了离职回收，辅助主管做 ownership 复盘。"
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
                      <div className="text-xs text-black/45">@{row.ownerUsername}</div>
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
          <EmptyState title="暂无 owner 维度数据" description="当前窗口内还没有可用于 owner 复盘的公海池流转记录。" />
        )}
      </DataTableWrapper>

      <DataTableWrapper
        className="mt-5"
        title="长期滞留明细"
        description={`筛出滞留超过 ${data.filters.lingerDays} 天、或多次进出公海、或高频回收的当前池内客户，支持直接 drill-down 到客户详情。`}
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
                  <th>进池次数</th>
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
                        className="font-medium text-black/82 underline-offset-2 hover:text-black hover:underline"
                      >
                        {row.customerName}
                      </Link>
                      <div className="text-xs text-black/45">{row.phone}</div>
                    </td>
                    <td>{row.teamName ?? "未记录团队"}</td>
                    <td>{row.publicReasonLabel ?? "未记录原因"}</td>
                    <td>{row.inPoolDays}</td>
                    <td>{row.publicEntryCount}</td>
                    <td>{row.recycleCount}</td>
                    <td>{row.lastOwnerName ?? "无最近 owner"}</td>
                    <td>{row.lastEffectiveFollowUpAt ? formatDateTime(row.lastEffectiveFollowUpAt) : "无有效跟进"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="没有长期滞留客户" description="当前过滤条件下，没有命中长期滞留或高频回收的池内客户。" />
        )}
      </DataTableWrapper>

      <DataTableWrapper className="mt-5" title="统计口径" description="Phase 4 先用现有 ownership 真相层做轻量聚合，不引入额外 BI 模型。">
        <div className="space-y-3">
          {data.definitions.map((item) => (
            <div key={item.label} className="crm-subtle-panel">
              <p className="text-sm font-medium text-black/82">{item.label}</p>
              <p className="mt-2 text-sm leading-6 text-black/56">{item.description}</p>
            </div>
          ))}
        </div>
      </DataTableWrapper>
    </div>
  );
}
