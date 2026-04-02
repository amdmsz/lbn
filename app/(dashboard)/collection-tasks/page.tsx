import { redirect } from "next/navigation";
import { CollectionTasksSection } from "@/components/payments/collection-tasks-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  WorkspaceGuide,
  type WorkspaceGuideItem,
} from "@/components/shared/workspace-guide";
import {
  canAccessCollectionTaskModule,
  canManageCollectionTasks,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCollectionTasksPageData } from "@/lib/payments/queries";
import { updateCollectionTaskAction } from "./actions";

export default async function CollectionTasksPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCollectionTaskModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getCollectionTasksPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );
  const canManage = canManageCollectionTasks(session.user.role);
  const guideItems: WorkspaceGuideItem[] =
    session.user.role === "SALES"
      ? [
          {
            title: "我的催收任务",
            description: "销售只看本人客户对应的尾款、COD 或运费催收任务，不查看团队任务池。",
            badgeLabel: "本人范围",
            badgeVariant: "info" as const,
          },
          {
            title: "收款记录联动",
            description: "收款提交和确认仍在收款记录页完成，这里只承接未收或部分已收后的跟进工作。",
            href: "/payment-records",
            hrefLabel: "进入收款记录",
            badgeLabel: "上游收款",
            badgeVariant: "success" as const,
          },
          {
            title: "客户主线回流",
            description: "催收结果继续回流到客户与订单详情，但销售主工作台仍是客户中心。",
            href: "/customers",
            hrefLabel: "回到客户中心",
            badgeLabel: "客户回流",
            badgeVariant: "warning" as const,
          },
        ]
      : [
          {
            title: "团队催收视角",
            description: "主管和管理员在这里统一查看待收、逾期和异常任务，不把催收分散到订单页。",
            badgeLabel: "团队视角",
            badgeVariant: "info" as const,
          },
          {
            title: "收款协同",
            description: "收款记录页负责确认与驳回，这里负责跟进动作与下一步催收安排。",
            href: "/payment-records",
            hrefLabel: "进入收款记录",
            badgeLabel: "收款协同",
            badgeVariant: "success" as const,
          },
          {
            title: "财务与异常回看",
            description: "财务预览和异常回看继续从报表与财务页面进入，不把它们塞到催收列表。",
            href: "/finance/exceptions",
            hrefLabel: "查看财务异常",
            badgeLabel: "异常回看",
            badgeVariant: "warning" as const,
          },
        ];

  return (
    <div className="crm-page">
      <PageHeader
        title="催收任务"
        description="催收任务页承接尾款、COD 与运费的跟进任务，独立于收款记录和订单页存在。"
        actions={
          <>
            <StatusBadge
              label={session.user.role === "SALES" ? "我的催收任务" : "团队催收视角"}
              variant={session.user.role === "SALES" ? "info" : "warning"}
            />
            <StatusBadge
              label={canManage ? "支持更新任务" : "只读"}
              variant={canManage ? "success" : "neutral"}
            />
          </>
        }
      />

      <WorkspaceGuide
        title="催收任务承接方式"
        description="催收任务负责跟进和下一步安排，不替代收款提交、订单审核或财务中心。"
        items={guideItems}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title="催收任务工作台"
        description="CollectionTask 是待收跟进层，用于记录下一步由谁在什么时间继续处理。"
      >
        <CollectionTasksSection
          items={data.items}
          filters={data.filters}
          ownerOptions={data.ownerOptions}
          pagination={data.pagination}
          canManageCollectionTasks={canManage}
          updateCollectionTaskAction={updateCollectionTaskAction}
        />
      </DataTableWrapper>
    </div>
  );
}
