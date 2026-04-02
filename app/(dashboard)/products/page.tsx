import { redirect } from "next/navigation";
import { ProductsSection } from "@/components/products/products-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { WorkspaceGuide } from "@/components/shared/workspace-guide";
import {
  canAccessProductModule,
  canManageProducts,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getProductsPageData } from "@/lib/products/queries";
import { toggleProductAction, upsertProductAction } from "./actions";

export default async function ProductsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessProductModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getProductsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );
  const canManage = canManageProducts(session.user.role);

  return (
    <div className="crm-page">
      <PageHeader
        title="商品中心"
        description="商品中心承接商品与 SKU 主数据维护。OPS 可做协同查看，正式交易与履约仍消费这里的快照。"
        actions={
          <>
            <StatusBadge label={`商品 ${data.items.length}`} variant="info" />
            <StatusBadge
              label={canManage ? "支持维护商品 / SKU" : "只读协同"}
              variant={canManage ? "success" : "neutral"}
            />
          </>
        }
      />

      <WorkspaceGuide
        title="商品中心承接方式"
        description="商品中心与供货商中心属于同一商品交易域，负责主数据维护，不在这里承接订单审核或发货执行。"
        items={[
          {
            title: "主数据维护",
            description: "管理员和主管在这里维护商品主体、SKU 骨架与启停状态。",
            badgeLabel: "主数据",
            badgeVariant: "info",
          },
          {
            title: "供货商联动",
            description: "若需调整供货商资料，回到供货商中心统一维护，不在商品页重复保存。",
            href: "/suppliers",
            hrefLabel: "进入供货商中心",
            badgeLabel: "同组协同",
            badgeVariant: "success",
          },
          {
            title: "OPS 协同边界",
            description: "OPS 只承担直播 / 商品协同相关查看或局部配置，不进入订单、收款主链。",
            badgeLabel: "角色边界",
            badgeVariant: "warning",
          },
        ]}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title="商品列表"
        description="本阶段先建立商品与 SKU 主数据骨架，后续订单和发货继续消费这些快照。"
      >
        <ProductsSection
          items={data.items}
          suppliers={data.suppliers}
          selectedSupplierId={data.filters.supplierId}
          canManage={canManage}
          upsertAction={upsertProductAction}
          toggleAction={toggleProductAction}
        />
      </DataTableWrapper>
    </div>
  );
}
