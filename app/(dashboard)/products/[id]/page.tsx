import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ProductDetailSection } from "@/components/products/product-detail-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { MetricCard } from "@/components/shared/metric-card";
import { PageContextLink } from "@/components/shared/page-context-link";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
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
            eyebrow="商品主数据档案"
            title={data.product.name}
            description="当前详情页用于维护商品摘要、SKU 规格与供应商挂接，商品主入口仍然保持在 /products。"
            meta={
              <>
                <StatusBadge label={data.product.enabled ? "启用中" : "已停用"} variant={data.product.enabled ? "success" : "neutral"} />
                <StatusBadge label={`供应商 ${data.product.supplier.name}`} variant="neutral" />
                <StatusBadge label={`编码 ${data.product.code}`} variant="neutral" />
              </>
            }
            actions={
              canManage ? (
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <Link
                    href={`/products/${data.product.id}?editProduct=1`}
                    className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                  >
                    编辑商品
                  </Link>
                  <Link
                    href={`/products/${data.product.id}?createSku=1`}
                    className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                  >
                    新建 SKU
                  </Link>
                </div>
              ) : undefined
            }
          />
        </div>
      }
      summary={
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="SKU 数量"
            value={String(data.product._count.skus)}
            note="当前商品已建立的规格数量"
            density="strip"
          />
          <MetricCard
            label="成交引用"
            value={String(data.product._count.salesOrderItems)}
            note="历史成交中引用该商品的次数"
            density="strip"
          />
          <MetricCard
            label="默认供应商"
            value={data.product.supplier.code}
            note={data.product.supplier.name}
            density="strip"
          />
          <MetricCard
            label="最近更新"
            value={formatDateTime(data.product.updatedAt)}
            note={`创建于 ${formatDateTime(data.product.createdAt)}`}
            density="strip"
          />
        </div>
      }
    >
      {data.notice ? <ActionBanner tone={data.notice.tone}>{data.notice.message}</ActionBanner> : null}

      <ProductDetailSection
        product={data.product}
        suppliers={data.suppliers}
        canManage={canManage}
        canQuickCreateSupplier={canAccessSupplierModule(
          session.user.role,
          session.user.permissionCodes,
        )}
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
