import { redirect } from "next/navigation";
import { RecycleBinFilterBar } from "@/components/recycle-bin/recycle-bin-filter-bar";
import { RecycleBinWorkbench } from "@/components/recycle-bin/recycle-bin-workbench";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { RecordTabs } from "@/components/shared/record-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessRecycleBinModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { buildRecycleBinHistoryExportHref } from "@/lib/recycle-bin/export";
import { getRecycleBinPageData } from "@/lib/recycle-bin/queries";

function getActiveTabLabel(
  activeTab: Awaited<ReturnType<typeof getRecycleBinPageData>>["activeTab"],
) {
  switch (activeTab) {
    case "master-data":
      return "商品主数据";
    case "live-sessions":
      return "直播场次";
    case "leads":
      return "线索";
    case "customers":
      return "客户";
    case "trade-orders":
      return "交易订单";
    default:
      return "回收站";
  }
}

function getEntryStatusLabel(
  entryStatus: Awaited<ReturnType<typeof getRecycleBinPageData>>["filters"]["entryStatus"],
) {
  switch (entryStatus) {
    case "archived":
      return "ARCHIVED";
    case "purged":
      return "PURGED";
    case "restored":
      return "RESTORED";
    case "active":
    default:
      return "ACTIVE";
  }
}

export default async function RecycleBinPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessRecycleBinModule(session.user.role, session.user.permissionCodes)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getRecycleBinPageData(
    {
      id: session.user.id,
      role: session.user.role,
      permissionCodes: session.user.permissionCodes,
    },
    resolvedSearchParams,
  );

  const activeTabLabel = getActiveTabLabel(data.activeTab);
  const activeEntryStatusLabel = getEntryStatusLabel(data.filters.entryStatus);
  const isFinalizeTab =
    data.activeTab === "customers" || data.activeTab === "trade-orders";
  const isHistoryView = data.filters.entryStatus !== "active";
  const exportHref = isHistoryView
    ? buildRecycleBinHistoryExportHref({
        activeTab: data.activeTab,
        filters: data.filters,
      })
    : null;
  const archiveOnlyCount = isFinalizeTab && !isHistoryView
    ? data.items.filter(
        (item) => item.finalActionPreview?.finalAction === "ARCHIVE",
      ).length
    : data.summary.purgeBlockedCount;

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="回收站治理工作台"
          title="回收站"
          description={
            isHistoryView
              ? `${activeTabLabel} tab 已切到 ${activeEntryStatusLabel} 历史终态视角：这里只读展示删除与解决审计，不提供历史恢复或历史 purge。`
              : isFinalizeTab
              ? `${activeTabLabel} tab 已切到双终态 finalize 视角：move 只代表进入 3 天冷静期，到期后再按最新服务端真相收口为 PURGE 或 ARCHIVE。`
              : "统一治理已移入回收站的商品主数据、直播场次、线索、客户与交易订单。当前保留恢复、最终处理入口、基础筛选和治理详情。"
          }
          meta={
            <>
              <StatusBadge label={activeTabLabel} variant="info" />
              <StatusBadge label={activeEntryStatusLabel} variant="neutral" />
              <StatusBadge
                label={`当前条目 ${data.summary.totalCount}`}
                variant="neutral"
              />
              {data.hasActiveFilters ? (
                <StatusBadge label="已应用筛选" variant="warning" />
              ) : null}
            </>
          }
        />
      }
      summary={
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label={isHistoryView ? "历史条目" : "当前条目"}
            value={String(data.summary.totalCount)}
            note={
              isHistoryView
                ? `当前 tab 与筛选条件下，已进入 ${activeEntryStatusLabel} 的回收站历史条目数量。`
                : isFinalizeTab
                ? `当前 tab 与筛选条件下，仍处于 ACTIVE 的${activeTabLabel}回收站对象数量。`
                : "当前 tab 与筛选条件下，仍处于 ACTIVE 的回收站对象数量。"
            }
            density="strip"
          />
          <MetricCard
            label={isHistoryView ? "处理人覆盖" : "可恢复"}
            value={String(
              isHistoryView ? data.summary.resolvedActorCount : data.summary.restorableCount,
            )}
            note={
              isHistoryView
                ? "当前历史结果中，实际参与 resolve / finalize 的处理人数量。"
                : "当前筛选结果中，已通过 restore guard、可直接恢复到原业务域的对象数量。"
            }
            density="strip"
          />
          <MetricCard
            label={
              isHistoryView
                ? data.filters.entryStatus === "archived"
                  ? "含 Archive Payload"
                  : `结果 / ${activeEntryStatusLabel}`
                : isFinalizeTab
                  ? "3 天后仅封存"
                  : "清理受阻"
            }
            value={String(
              isHistoryView
                ? data.filters.entryStatus === "archived"
                  ? data.summary.archivePayloadCount
                  : data.summary.resolvedCount
                : archiveOnlyCount,
            )}
            note={
              isHistoryView
                ? data.filters.entryStatus === "archived"
                  ? "当前历史结果中，包含 archivePayloadJson 的条目数量。"
                  : `当前筛选结果中，最终结果为 ${activeEntryStatusLabel} 的历史条目数量。`
                : isFinalizeTab
                ? "当前筛选结果中，按最新 finalize preview 判断，3 天后只能 ARCHIVE 的对象数量。"
                : "当前筛选结果中，包含清理阻断项未通过或仅管理员可执行的对象。"
            }
            density="strip"
          />
        </div>
      }
      toolbar={
        <div className="space-y-2">
          <RecordTabs items={data.statusTabs} activeValue={data.filters.entryStatus} />
          <RecordTabs items={data.tabs} activeValue={data.activeTab} />
          <RecycleBinFilterBar
            activeTab={data.activeTab}
            filters={data.filters}
            deletedByOptions={data.deletedByOptions}
            resolvedByOptions={data.resolvedByOptions}
            targetTypeOptions={data.targetTypeOptions}
            finalActionOptions={data.finalActionOptions}
            historyArchiveSourceOptions={data.historyArchiveSourceOptions}
            resetHref={data.resetHref}
            exportHref={exportHref}
          />
        </div>
      }
    >
      <RecycleBinWorkbench
        activeTab={data.activeTab}
        entryStatus={data.filters.entryStatus}
        items={data.items}
      />
    </WorkbenchLayout>
  );
}
