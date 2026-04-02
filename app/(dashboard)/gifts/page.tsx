import { redirect } from "next/navigation";
import { GiftsSection } from "@/components/gifts/gifts-section";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  WorkspaceGuide,
  type WorkspaceGuideItem,
} from "@/components/shared/workspace-guide";
import {
  canAccessGiftModule,
  canCreateGiftRecord,
  canReviewGiftRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getGiftsPageData } from "@/lib/gifts/queries";

export default async function GiftsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessGiftModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getGiftsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );
  const canCreate = canCreateGiftRecord(session.user.role);
  const canReview = canReviewGiftRecord(session.user.role);
  const giftGuideItems: WorkspaceGuideItem[] =
    session.user.role === "OPS"
      ? [
          {
            title: "礼品协同主入口",
            description: "OPS 在这里承接礼品资格、审核和兼容履约协同，不进入销售客户或收款主链。",
            badgeLabel: "运营协同",
            badgeVariant: "info" as const,
          },
          {
            title: "直播场次联动",
            description: "若礼品资格来自直播场次，继续回到直播场次页查看对应活动。",
            href: "/live-sessions",
            hrefLabel: "进入直播场次",
            badgeLabel: "直播联动",
            badgeVariant: "warning" as const,
          },
        ]
      : [
          {
            title: "礼品独立管理",
            description: "GiftRecord 继续独立于订单赠品，不与 SalesOrderGiftItem 混用。",
            badgeLabel: "独立链路",
            badgeVariant: "info" as const,
          },
          {
            title: "履约兼容查看",
            description: "礼品发货与运费仍在这里查看兼容链路，不放进 V2 发货中心主操作台。",
            href: "/shipping",
            hrefLabel: "查看发货中心",
            badgeLabel: "履约协同",
            badgeVariant: "success" as const,
          },
        ];

  return (
    <div className="crm-page">
      <PageHeader
        title="礼品管理"
        description="礼品管理页承接礼品资格、运费、审核与兼容履约结果，保持 GiftRecord 独立于订单赠品。"
        actions={
          <>
            <StatusBadge
              label={canCreate ? "支持创建礼品记录" : "仅查看"}
              variant={canCreate ? "success" : "neutral"}
            />
            <StatusBadge
              label={canReview ? "支持审核流转" : "无审核权限"}
              variant={canReview ? "info" : "warning"}
            />
          </>
        }
      />

      <WorkspaceGuide
        title="礼品管理承接方式"
        description="礼品管理保留独立业务语义，礼品资格、运费和兼容履约都在这里回看，不把它混进订单赠品。"
        items={giftGuideItems}
      />

      <DataTableWrapper
        title="礼品列表"
        description="支持客户、审核状态和发货状态筛选，并保留基础审核流转。"
      >
        <GiftsSection
          items={data.items}
          filters={data.filters}
          customers={data.customers}
          liveSessions={data.liveSessions}
          assignees={data.assignees}
          pagination={data.pagination}
          canCreate={canCreate}
          canReview={canReview}
          canManageFulfillmentCompat={canReview}
          defaultCustomerId={data.filters.customerId}
        />
      </DataTableWrapper>
    </div>
  );
}
