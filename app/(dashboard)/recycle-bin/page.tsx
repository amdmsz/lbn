import { redirect } from "next/navigation";
import { RecycleBinFilterBar } from "@/components/recycle-bin/recycle-bin-filter-bar";
import { RecycleBinViewSegmented } from "@/components/recycle-bin/recycle-bin-view-segmented";
import { RecycleBinWorkbench } from "@/components/recycle-bin/recycle-bin-workbench";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { PageHeader } from "@/components/shared/page-header";
import { RecordTabs } from "@/components/shared/record-tabs";
import CompactBadgeGroup, {
  type BadgeTone,
  type CompactBadgeItem,
} from "@/components/shared/compact-badge-group";
import MetricStrip, {
  type MetricItem,
} from "@/components/shared/metric-strip";
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

  const description = isHistoryView
    ? `${activeTabLabel} · ${activeEntryStatusLabel} 历史终态只读视角：仅展示删除与解决审计。`
    : isFinalizeTab
      ? `${activeTabLabel} · finalize 视角：可按服务端最新真相直接收口 PURGE / ARCHIVE。`
      : "统一治理已移入回收站的对象，支持恢复与基础清理。";

  const headerBadges: CompactBadgeItem[] = [
    { label: activeTabLabel, tone: "info" as BadgeTone },
    { label: activeEntryStatusLabel, tone: "neutral" as BadgeTone },
    { label: `当前条目 ${data.summary.totalCount}`, tone: "neutral" as BadgeTone },
    ...(data.hasActiveFilters
      ? [{ label: "已应用筛选", tone: "warning" as BadgeTone }]
      : []),
  ];

  const metrics: MetricItem[] = [
    {
      label: isHistoryView ? "历史条目" : "当前条目",
      value: String(data.summary.totalCount),
      tone: "primary",
    },
    {
      label: isHistoryView ? "处理人覆盖" : "可恢复",
      value: String(
        isHistoryView
          ? data.summary.resolvedActorCount
          : data.summary.restorableCount,
      ),
      tone: isHistoryView ? "neutral" : "success",
    },
    {
      label: isHistoryView
        ? data.filters.entryStatus === "archived"
          ? "含 Archive Payload"
          : `结果 / ${activeEntryStatusLabel}`
        : isFinalizeTab
          ? "当前终态 ARCHIVE"
          : "清理受阻",
      value: String(
        isHistoryView
          ? data.filters.entryStatus === "archived"
            ? data.summary.archivePayloadCount
            : data.summary.resolvedCount
          : archiveOnlyCount,
      ),
      tone: isHistoryView ? "primary" : "warning",
    },
  ];

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="回收站治理工作台"
          title="回收站"
          description={description}
          meta={<CompactBadgeGroup items={headerBadges} size="sm" maxVisible={6} />}
        />
      }
      summary={<MetricStrip metrics={metrics} ariaLabel="回收站核心指标" />}
      toolbar={
        <div className="space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <RecordTabs items={data.tabs} activeValue={data.activeTab} />
            <RecycleBinViewSegmented
              items={data.statusTabs}
              activeValue={data.filters.entryStatus}
            />
          </div>
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
        viewerRole={session.user.role}
        targetTypeFilter={data.filters.targetType}
      />
    </WorkbenchLayout>
  );
}
