import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { PageHeader } from "@/components/shared/page-header";
import type { PageSummaryStripItem } from "@/components/shared/page-summary-strip";
import {
  canAccessLeadModule,
  canManageLeadAssignments,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getLeadListData } from "@/lib/leads/queries";

function getLeadContextLabel(
  data: Awaited<ReturnType<typeof getLeadListData>>,
) {
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

function buildSummaryItems(input: {
  contextLabel: string;
  importBatchFileName: string | null;
  unassignedCount: number;
  assignedCount: number;
  totalVisibleCount: number;
}): PageSummaryStripItem[] {
  return [
    {
      key: "unassigned",
      label: "未分配",
      value: `${input.unassignedCount}`,
      note: "当前待处理主工作区",
      emphasis: "default",
    },
    {
      key: "assigned",
      label: "已分配",
      value: `${input.assignedCount}`,
      note: "结果回看与轻量修正",
      emphasis: "info",
    },
    {
      key: "scope",
      label: "当前焦点",
      value: input.contextLabel,
      note: input.importBatchFileName
        ? `批次 ${input.importBatchFileName}`
        : "支持本次导入、今日导入与全部未分配",
      emphasis: "default",
    },
    {
      key: "visible",
      label: "当前可见",
      value: `${input.totalVisibleCount}`,
      note: "当前上下文内可见线索总量",
      emphasis: "success",
    },
  ];
}

function LeadSummaryGrid({
  items,
}: Readonly<{
  items: PageSummaryStripItem[];
}>) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={item.key ?? `${item.label}-${index}`}
          className="rounded-xl border border-border/60 bg-card p-5 shadow-sm"
        >
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {item.label}
          </p>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {item.value}
          </div>
          {item.note ? (
            <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
              {item.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
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
      teamId: session.user.teamId,
    },
    resolvedSearchParams,
  );
  const canAssign = canManageLeadAssignments(session.user.role);
  const contextLabel = getLeadContextLabel(data);

  return (
    <WorkbenchLayout
      className="!gap-4 md:!gap-5"
      header={
        <PageHeader
          eyebrow="线索中心"
          title="线索分配中心"
          description={undefined}
          meta={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span>{contextLabel}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{canAssign ? "支持批量分配" : "只读回看"}</span>
              {data.importBatch ? (
                <>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span>{data.importBatch.fileName}</span>
                </>
              ) : null}
            </div>
          }
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/lead-imports"
                scroll={false}
                className="inline-flex min-h-0 items-center rounded-lg border border-border/60 bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-primary"
              >
                返回导入中心
              </Link>
              {data.importBatch ? (
                <Link
                  href={`/lead-imports/${data.importBatch.id}`}
                  scroll={false}
                  className="inline-flex min-h-0 items-center rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90"
                >
                  查看当前批次
                </Link>
              ) : null}
            </div>
          }
          className="px-4 py-2 md:px-5 md:py-2.5"
        />
      }
      summary={
        <LeadSummaryGrid
          items={buildSummaryItems({
            contextLabel,
            importBatchFileName: data.importBatch?.fileName ?? null,
            unassignedCount: data.unassigned.totalCount,
            assignedCount: data.assigned.totalCount,
            totalVisibleCount: data.summary.totalVisibleCount,
          })}
        />
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
