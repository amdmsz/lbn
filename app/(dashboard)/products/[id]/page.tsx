import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductDetailSection } from "@/components/products/product-detail-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canAccessProductModule,
  canManageProducts,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getProductDetail } from "@/lib/products/queries";
import {
  toggleProductAction,
  toggleProductSkuAction,
  upsertProductAction,
  upsertProductSkuAction,
} from "../actions";

export default async function ProductDetailPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessProductModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getProductDetail(
    {
      id: session.user.id,
      role: session.user.role,
    },
    id,
    resolvedSearchParams,
  );

  if (!data.product) {
    notFound();
  }

  return (
    <div className="crm-page">
      <PageHeader
        title={data.product.name}
        description="查看商品详情、SKU 骨架和直播商品绑定预留。"
        actions={
          <>
            <StatusBadge label={`SKU ${data.product.skus.length}`} variant="info" />
            <Link href="/products" className="crm-button crm-button-secondary">
              返回商品中心
            </Link>
          </>
        }
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title="商品详情"
        description="本阶段只提供商品 / SKU 骨架与运营预留位，不落正式直播商品绑定关系。"
      >
        <ProductDetailSection
          product={data.product}
          suppliers={data.suppliers}
          canManage={canManageProducts(session.user.role)}
          upsertProductAction={upsertProductAction}
          toggleProductAction={toggleProductAction}
          upsertProductSkuAction={upsertProductSkuAction}
          toggleProductSkuAction={toggleProductSkuAction}
        />
      </DataTableWrapper>
    </div>
  );
}
