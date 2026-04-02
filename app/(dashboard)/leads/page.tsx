import { redirect } from "next/navigation";
import { LeadsFilters } from "@/components/leads/leads-filters";
import { LeadsTable } from "@/components/leads/leads-table";
import { FiltersPanel } from "@/components/shared/filters-panel";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { SummaryHeader } from "@/components/shared/summary-header";
import { WorkspaceGuide } from "@/components/shared/workspace-guide";
import {
  canAccessLeadModule,
  canManageLeadAssignments,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getLeadListData } from "@/lib/leads/queries";

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

  return (
    <div className="crm-page">
      <SummaryHeader
        eyebrow="客户运营 / 线索中心"
        title="线索中心"
        description="这里承接导入后的原始线索复核、归并结果查看、分配与审计，不再作为销售日常主工作台。"
        badges={
          <>
            <StatusBadge label="ADMIN / SUPERVISOR" variant="info" />
            <StatusBadge
              label={canAssign ? "支持批量分配" : "只读审计"}
              variant={canAssign ? "success" : "warning"}
            />
          </>
        }
      />

      <WorkspaceGuide
        title="线索中心承接方式"
        description="线索中心只服务导入复核、分配和审计。客户经营一旦落到 Customer.ownerId，就回到客户中心继续推进。"
        items={[
          {
            title: "导入复核",
            description: "先回看导入中心批次、失败行和重复行，再决定如何处理原始线索。",
            href: "/lead-imports",
            hrefLabel: "进入导入中心",
            badgeLabel: "上游入口",
            badgeVariant: "info",
          },
          {
            title: "分配执行",
            description: "主管和管理员在这里完成批量分配、回收和重分配，不把动作散落到客户页。",
            badgeLabel: "分配台",
            badgeVariant: "success",
          },
          {
            title: "审计回看",
            description: "保留原始来源、归并结果和状态追踪，便于回看导入质量和分配路径。",
            badgeLabel: "审计视角",
            badgeVariant: "warning",
          },
        ]}
      />

      <FiltersPanel
        title="线索筛选"
        description="按姓名、手机号、状态、标签和创建时间回看导入落地后的线索质量与当前分配状态。"
      >
        <LeadsFilters
          filters={data.filters}
          ownerOptions={data.ownerOptions}
          showOwnerFilter={canAssign}
          tagOptions={data.tagOptions}
          scrollTargetId="leads-list"
        />
      </FiltersPanel>

      <SectionCard
        eyebrow="线索列表"
        title={canAssign ? "线索列表与批量分配" : "线索审计列表"}
        description={
          canAssign
            ? "主管和管理员在这里处理分配动作，并回看每条线索的当前状态。"
            : "保留只读线索审计视图，不在这里承接销售客户主链。"
        }
        anchorId="leads-list"
      >
        <LeadsTable
          key={JSON.stringify(data.filters)}
          items={data.items}
          filters={data.filters}
          pagination={data.pagination}
          canAssign={canAssign}
          salesOptions={data.salesOptions}
          scrollTargetId="leads-list"
        />
      </SectionCard>
    </div>
  );
}
