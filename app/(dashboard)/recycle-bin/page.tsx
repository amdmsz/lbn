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
import { getRecycleBinPageData } from "@/lib/recycle-bin/queries";

function getActiveTabLabel(activeTab: "master-data" | "live-sessions" | "leads") {
  switch (activeTab) {
    case "master-data":
      return "商品主数据";
    case "live-sessions":
      return "直播场次";
    case "leads":
      return "线索";
    default:
      return "回收站";
  }
}

function getResolvedActiveTabLabel(
  activeTab: Awaited<ReturnType<typeof getRecycleBinPageData>>["activeTab"],
) {
  if (activeTab === "trade-orders") {
    return "交易订单";
  }

  return getActiveTabLabel(activeTab);
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

  const activeTabLabel = getResolvedActiveTabLabel(data.activeTab);

  return (
    <WorkbenchLayout
      header={
        <div className="mb-4">
          <PageHeader
            eyebrow="回收站治理工作台"
            title="回收站"
            description="统一治理已移入回收站的商品主数据、直播场次与线索。第一版提供恢复、永久删除、基础筛选和 blocker 详情，不扩批量动作与高级筛选系统。"
            meta={
              <>
                <StatusBadge label={activeTabLabel} variant="info" />
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
        </div>
      }
      summary={
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="当前条目"
            value={String(data.summary.totalCount)}
            note="当前 tab 与筛选条件下，仍处于 ACTIVE 的回收站对象数量。"
            density="strip"
          />
          <MetricCard
            label="可恢复"
            value={String(data.summary.restorableCount)}
            note="当前筛选结果中，已通过 restore guard、可直接恢复到原业务域的对象数量。"
            density="strip"
          />
          <MetricCard
            label="永久删除受阻"
            value={String(data.summary.purgeBlockedCount)}
            note="当前筛选结果中，包含 purge blocker 未通过或仅管理员可执行的对象。"
            density="strip"
          />
        </div>
      }
      toolbar={
        <div className="space-y-3">
          <RecordTabs items={data.tabs} activeValue={data.activeTab} />
          <RecycleBinFilterBar
            activeTab={data.activeTab}
            filters={data.filters}
            deletedByOptions={data.deletedByOptions}
            targetTypeOptions={data.targetTypeOptions}
            resetHref={data.resetHref}
          />
        </div>
      }
    >
      <RecycleBinWorkbench activeTab={data.activeTab} items={data.items} />
    </WorkbenchLayout>
  );
}
