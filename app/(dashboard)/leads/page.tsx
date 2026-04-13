import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessLeadModule,
  canManageLeadAssignments,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getLeadListData } from "@/lib/leads/queries";

function getLeadContextLabel(data: Awaited<ReturnType<typeof getLeadListData>>) {
  if (data.filters.importBatchId && data.importBatch) {
    return `本批导入：${data.importBatch.fileName}`;
  }

  if (data.filters.quick === "today") {
    return "今日导入";
  }

  if (data.filters.view === "assigned") {
    return "已分配回看";
  }

  return "全部未分配";
}

export default async function LeadsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessLeadModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getLeadListData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );
  const canAssign = canManageLeadAssignments(session.user.role);
  const contextLabel = getLeadContextLabel(data);

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="Customer Operations / Lead Center"
          title="线索分配中心"
          description="这里只承接导入后的复核、分配和审计。未分配作为主工作区，已分配用于结果回看和轻量修正。"
          context={
            data.importBatch ? (
              <div className="crm-toolbar-cluster gap-1.5">
                <StatusBadge label="当前导入上下文" variant="info" />
                <StatusBadge label={data.importBatch.status} variant="neutral" />
              </div>
            ) : null
          }
          meta={
            <>
              <StatusBadge label="ADMIN / SUPERVISOR" variant="info" />
              <StatusBadge
                label={canAssign ? "支持批量分配" : "只读回看"}
                variant={canAssign ? "success" : "warning"}
              />
              {data.importBatch ? (
                <StatusBadge label={data.importBatch.fileName} variant="neutral" />
              ) : null}
            </>
          }
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/lead-imports"
                scroll={false}
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                返回导入中心
              </Link>
              {data.importBatch ? (
                <Link
                  href={`/lead-imports/${data.importBatch.id}`}
                  scroll={false}
                  className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                >
                  查看当前批次
                </Link>
              ) : null}
            </div>
          }
        />
      }
      summary={
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            density="strip"
            label="未分配"
            value={`${data.unassigned.totalCount}`}
            note="当前主工作区待分配线索数量"
          />
          <MetricCard
            density="strip"
            label="已分配"
            value={`${data.assigned.totalCount}`}
            note="结果回看区内已分配线索数量"
          />
          <MetricCard
            density="strip"
            label="当前焦点"
            value={contextLabel}
            note={
              data.filters.importBatchId
                ? "承接本次导入完成后的分配动作"
                : "支持今日导入、全部未分配与已分配回看"
            }
          />
          <MetricCard
            density="strip"
            label="当前可见"
            value={`${data.summary.totalVisibleCount}`}
            note="当前上下文内未分配与已分配线索总量"
          />
        </div>
      }
      toolbar={
        <LeadsFilters
          filters={data.filters}
          ownerOptions={data.salesOptions}
          showOwnerFilter={canAssign && data.salesOptions.length > 0}
          tagOptions={data.tagOptions}
          scrollTargetId="leads-list"
        />
      }
    >
      <LeadsTable
        key={JSON.stringify(data.filters)}
        unassigned={data.unassigned}
        assigned={data.assigned}
        filters={data.filters}
        canAssign={canAssign}
        salesOptions={data.salesOptions}
        scrollTargetId="leads-list"
      />
    </WorkbenchLayout>
  );
}
