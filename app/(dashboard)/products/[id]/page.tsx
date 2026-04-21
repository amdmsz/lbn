import { notFound, redirect } from "next/navigation";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
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
  canViewProductSupplyIdentity,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getProductCenterMeta, getProductDetail } from "@/lib/products/queries";
import {
  createInlineSupplierAction,
  moveProductSkuToRecycleBinInlineAction,
  moveProductToRecycleBinInlineAction,
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
  const canManage = canManageProducts(session.user.role, session.user.permissionCodes);
  const canViewSupplyIdentity = canViewProductSupplyIdentity(
    session.user.role,
    session.user.permissionCodes,
  );
  const data = await getProductDetail(
    {
      id: session.user.id,
      role: session.user.role,
      permissionCodes: session.user.permissionCodes,
    },
    id,
    resolvedSearchParams,
  );
  const productCenterMeta = await getProductCenterMeta({
    id: session.user.id,
    role: session.user.role,
    permissionCodes: session.user.permissionCodes,
  });

  if (!data.product) {
    notFound();
  }

  return (
    <WorkbenchLayout
      header={
        <div className="mb-4">
          <PageHeader
            context={
              <PageContextLink
                href="/products"
                label="返回商品中心"
                trail={["商品中心", data.product.name]}
              />
            }
            eyebrow="兼容详情页"
            title={data.product.name}
            description="保留深链接详情能力，但主体已经切到和右侧抽屉一致的商品工作台结构。"
            meta={
              <>
                <StatusBadge
                  label={data.product.enabled ? "启用中" : "已停用"}
                  variant={data.product.enabled ? "success" : "neutral"}
                />
                <StatusBadge label={`编码 ${data.product.code}`} variant="neutral" />
                <StatusBadge label={`规格 ${data.product._count.skus}`} variant="neutral" />
              </>
            }
          />
        </div>
      }
    >
      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <ProductDetailSection
        product={data.product}
        suppliers={data.suppliers}
        dictionaries={productCenterMeta.dictionaries}
        canManage={canManage}
        canQuickCreateSupplier={canAccessSupplierModule(
          session.user.role,
          session.user.permissionCodes,
        )}
        canViewSupplyIdentity={canViewSupplyIdentity}
        currentHref={`/products/${data.product.id}`}
        initialOpenProductEditor={initialOpenProductEditor}
        initialOpenSkuCreator={initialOpenSkuCreator}
        upsertProductAction={upsertProductInlineAction}
        toggleProductAction={toggleProductInlineAction}
        moveProductToRecycleBinAction={moveProductToRecycleBinInlineAction}
        upsertProductSkuAction={upsertProductSkuInlineAction}
        toggleProductSkuAction={toggleProductSkuInlineAction}
        moveProductSkuToRecycleBinAction={moveProductSkuToRecycleBinInlineAction}
        createInlineSupplierAction={createInlineSupplierAction}
      />
    </WorkbenchLayout>
  );
}
