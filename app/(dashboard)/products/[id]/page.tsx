import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ProductDetailSection } from "@/components/products/product-detail-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { PageContextLink } from "@/components/shared/page-context-link";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { getParamValue } from "@/lib/action-notice";
import {
  canAccessProductModule,
  canAccessSupplierModule,
  canManageProducts,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getProductDetail } from "@/lib/products/queries";
import {
  createInlineSupplierAction,
  toggleProductInlineAction,
  toggleProductSkuInlineAction,
  upsertProductInlineAction,
  upsertProductSkuInlineAction,
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

  if (!canAccessProductModule(session.user.role, session.user.permissionCodes)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialOpenProductEditor = getParamValue(resolvedSearchParams?.editProduct) === "1";
  const initialOpenSkuCreator = getParamValue(resolvedSearchParams?.createSku) === "1";
  const data = await getProductDetail(
    {
      id: session.user.id,
      role: session.user.role,
      permissionCodes: session.user.permissionCodes,
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
        context={
          <PageContextLink
            href="/products"
            label="返回商品中心"
            trail={["商品中心", data.product.name]}
          />
        }
        eyebrow="商品中心"
        title={data.product.name}
        description="查看商品与 SKU。"
        actions={
          <div className="crm-toolbar-cluster">
            <StatusBadge label={`SKU ${data.product.skus.length}`} variant="info" />
            {canManageProducts(session.user.role, session.user.permissionCodes) ? (
              <Link
                href={`/products/${data.product.id}?editProduct=1`}
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                编辑商品
              </Link>
            ) : null}
            {canManageProducts(session.user.role, session.user.permissionCodes) ? (
              <Link
                href={`/products/${data.product.id}?createSku=1`}
                className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
              >
                新建 SKU
              </Link>
            ) : null}
          </div>
        }
      />

      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <ProductDetailSection
        product={data.product}
        suppliers={data.suppliers}
        canManage={canManageProducts(session.user.role, session.user.permissionCodes)}
        canQuickCreateSupplier={canAccessSupplierModule(
          session.user.role,
          session.user.permissionCodes,
        )}
        currentHref={`/products/${data.product.id}`}
        initialOpenProductEditor={initialOpenProductEditor}
        initialOpenSkuCreator={initialOpenSkuCreator}
        upsertProductAction={upsertProductInlineAction}
        toggleProductAction={toggleProductInlineAction}
        upsertProductSkuAction={upsertProductSkuInlineAction}
        toggleProductSkuAction={toggleProductSkuInlineAction}
        createInlineSupplierAction={createInlineSupplierAction}
      />
    </div>
  );
}
