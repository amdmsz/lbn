import { redirect } from "next/navigation";
import { SuppliersSection } from "@/components/suppliers/suppliers-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { WorkspaceGuide } from "@/components/shared/workspace-guide";
import {
  canAccessSupplierModule,
  canManageSuppliers,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getSuppliersPageData } from "@/lib/suppliers/queries";
import { toggleSupplierAction, upsertSupplierAction } from "./actions";

export default async function SuppliersPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessSupplierModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getSuppliersPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );
  const canManage = canManageSuppliers(session.user.role);

  return (
    <div className="crm-page">
      <PageHeader
        title="供货商中心"
        description="供货商中心负责维护供货商列表与详情资料，为商品、订单审核和发货中心提供统一来源。"
        actions={
          <>
            <StatusBadge label={`供货商 ${data.items.length}`} variant="info" />
            <StatusBadge
              label={canManage ? "支持维护" : "只读"}
              variant={canManage ? "success" : "neutral"}
            />
          </>
        }
      />

      <WorkspaceGuide
        title="供货商中心承接方式"
        description="供货商中心与商品中心属于同一商品交易域。这里专注供货商资料维护，不扩展到对账、合同和结算。"
        items={[
          {
            title: "供货商维护",
            description: "维护供货商基础资料和启停状态，作为订单和发货选择的主数据来源。",
            badgeLabel: "主数据",
            badgeVariant: "info",
          },
          {
            title: "商品联动",
            description: "供货商维护完成后，继续到商品中心维护商品和 SKU。",
            href: "/products",
            hrefLabel: "进入商品中心",
            badgeLabel: "同组协同",
            badgeVariant: "success",
          },
          {
            title: "履约联动",
            description: "发货中心和报单批次会消费这里的供货商数据，但不在这里做履约操作。",
            href: "/shipping",
            hrefLabel: "查看发货中心",
            badgeLabel: "履约下游",
            badgeVariant: "warning",
          },
        ]}
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title="供货商列表"
        description="本阶段先提供基础增删改骨架，不引入复杂对账、合同和结算逻辑。"
      >
        <SuppliersSection
          items={data.items}
          canManage={canManage}
          upsertAction={upsertSupplierAction}
          toggleAction={toggleSupplierAction}
        />
      </DataTableWrapper>
    </div>
  );
}
