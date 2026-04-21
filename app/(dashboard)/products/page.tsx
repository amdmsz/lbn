import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ProductSkusSection } from "@/components/products/product-skus-section";
import { ProductsSection } from "@/components/products/products-section";
import { SuppliersSection } from "@/components/suppliers/suppliers-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { PageHeader } from "@/components/shared/page-header";
import { RecordTabs } from "@/components/shared/record-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { getParamValue } from "@/lib/action-notice";
import {
  canAccessProductModule,
  canAccessSupplierModule,
  canCreateProducts,
  canManageProducts,
  canManageSuppliers,
  canViewProductFinanceCategory,
  canViewProductSupplyIdentity,
  canViewProductSupplyGroup,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildProductCenterHref,
  buildSupplierCenterHref,
} from "@/lib/products/navigation";
import {
  getProductCenterMeta,
  getProductDetail,
  getProductsPageData,
  getProductSkusPageData,
} from "@/lib/products/queries";
import { getSuppliersPageData } from "@/lib/suppliers/queries";
import {
  createProductWithInitialSkuInlineAction,
  createInlineSupplierAction,
  moveProductSkuToRecycleBinInlineAction,
  moveProductToRecycleBinInlineAction,
  toggleProductInlineAction,
  toggleProductSkuInlineAction,
  upsertProductInlineAction,
  upsertProductSkuInlineAction,
} from "./actions";
import {
  moveSupplierToRecycleBinInlineAction,
  toggleSupplierInlineAction,
  upsertSupplierInlineAction,
} from "../suppliers/actions";

export default async function ProductsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessProductModule(session.user.role, session.user.permissionCodes)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedTab = getParamValue(resolvedSearchParams?.tab);
  const detailProductId = getParamValue(resolvedSearchParams?.detail);
  const detailSkuId = getParamValue(resolvedSearchParams?.detailSku);
  const canCreate = canCreateProducts(session.user.role, session.user.permissionCodes);
  const canManage = canManageProducts(session.user.role, session.user.permissionCodes);
  const canAccessSupplierTab = canAccessSupplierModule(
    session.user.role,
    session.user.permissionCodes,
  );
  const canManageSupplierData = canManageSuppliers(
    session.user.role,
    session.user.permissionCodes,
  );
  const canViewSupplyIdentity = canViewProductSupplyIdentity(
    session.user.role,
    session.user.permissionCodes,
  );
  const canViewSupplyGroup = canViewProductSupplyGroup(
    session.user.role,
    session.user.permissionCodes,
  );
  const canViewFinanceCategory = canViewProductFinanceCategory(
    session.user.role,
    session.user.permissionCodes,
  );

  const activeTab =
    requestedTab === "suppliers" && canAccessSupplierTab
      ? "suppliers"
      : requestedTab === "skus"
        ? "skus"
        : "products";

  const viewer = {
    id: session.user.id,
    role: session.user.role,
    permissionCodes: session.user.permissionCodes,
  };

  const productData = activeTab === "products" ? await getProductsPageData(viewer, resolvedSearchParams) : null;
  const productSkuData =
    activeTab === "skus" ? await getProductSkusPageData(viewer, resolvedSearchParams) : null;
  const supplierData =
    activeTab === "suppliers" ? await getSuppliersPageData(viewer, resolvedSearchParams) : null;
  const productCenterMeta =
    activeTab === "suppliers" ? null : await getProductCenterMeta(viewer);
  const detailData =
    activeTab === "suppliers" || !detailProductId
      ? null
      : await getProductDetail(viewer, detailProductId, resolvedSearchParams);

  const productFilters =
    productData?.filters ??
    productSkuData?.filters ?? {
      q: "",
      status: "",
      supplierId: "",
      brandName: "",
      seriesName: "",
      categoryCode: "",
        primarySalesSceneCode: "",
        supplyGroupCode: "",
        financeCategoryCode: "",
        preset: "",
        page: 1,
        savedViewId: "",
    };
  const supplierFilters =
    supplierData?.filters ?? {
      supplierQ: "",
      supplierStatus: "",
    };

  const productWorkspaceHref = buildProductCenterHref(productFilters);
  const skuWorkspaceHref = buildProductCenterHref(productFilters, { tab: "skus" });
  const supplierWorkspaceHref = buildSupplierCenterHref(supplierFilters);
  const initialCreateProduct =
    activeTab === "products" && getParamValue(resolvedSearchParams?.createProduct) === "1";
  const initialCreateSupplier =
    activeTab === "suppliers" && getParamValue(resolvedSearchParams?.createSupplier) === "1";

  const notice =
    activeTab === "products"
      ? productData?.notice
      : activeTab === "skus"
        ? productSkuData?.notice
        : supplierData?.notice;

  const viewTabs = [
    {
      value: "products",
      label: "商品",
      href: productWorkspaceHref,
      count: activeTab === "products" ? productData?.summary.totalCount : null,
    },
    {
      value: "skus",
      label: "SKU",
      href: skuWorkspaceHref,
      count: activeTab === "skus" ? productSkuData?.summary.totalCount : null,
    },
    ...(canAccessSupplierTab
      ? [
          {
            value: "suppliers",
            label: "供应商",
            href: supplierWorkspaceHref,
            count: activeTab === "suppliers" ? supplierData?.items.length : null,
          },
        ]
      : []),
  ];

  const activeStatusLabel =
    activeTab === "suppliers"
      ? supplierFilters.supplierStatus === "enabled"
        ? "仅看启用"
        : supplierFilters.supplierStatus === "disabled"
          ? "仅看停用"
          : "全部状态"
      : productFilters.status === "enabled"
        ? "仅看启用"
        : productFilters.status === "disabled"
          ? "仅看停用"
          : "全部状态";

  const productMetrics =
    activeTab === "products" && productData
      ? [
          {
            label: "当前商品",
            value: String(productData.summary.totalCount),
            note: "基于当前筛选后可见的商品主数据",
          },
          {
            label: "启用商品",
            value: String(productData.summary.enabledCount),
            note: "当前仍可直接参与建单与报价的商品",
          },
          {
            label: "SKU 覆盖",
            value: String(productData.summary.skuCount),
            note: "当前结果下关联的销售规格总量",
          },
          {
            label: "订单引用",
            value: String(productData.summary.salesOrderItemCount),
            note: "当前结果下历史订单中引用商品的次数",
          },
        ]
      : [];

  const skuMetrics =
    activeTab === "skus" && productSkuData
      ? [
          {
            label: "当前 SKU",
            value: String(productSkuData.summary.totalCount),
            note: "当前筛选后可见的销售规格数量",
          },
          {
            label: "启用 SKU",
            value: String(productSkuData.summary.enabledCount),
            note: "当前仍可直接参与建单的规格数量",
          },
          {
            label: "覆盖商品",
            value: String(productSkuData.summary.productCount),
            note: "当前结果涉及的同款商品数量",
          },
          {
            label: "订单引用",
            value: String(productSkuData.summary.salesOrderItemCount),
            note: "当前结果下历史订单中引用 SKU 的次数",
          },
        ]
      : [];

  void productMetrics;
  void skuMetrics;

  return (
    <WorkbenchLayout
      header={
        <div className="mb-4">
          <PageHeader
            eyebrow="商品目录工作台"
            title="商品中心"
            description="保持 /products 为唯一入口，在同一工作台内查看商品、规格和轻量供应目录。Product 视图优先按类目看商品，再展开销售规格。"
            meta={
              <>
                <StatusBadge
                  label={
                    activeTab === "products"
                      ? "Product 视图"
                      : activeTab === "skus"
                        ? "SKU 视图"
                        : "Supplier 视图"
                  }
                  variant="info"
                />
                <StatusBadge label={activeStatusLabel} variant="neutral" />
                {activeTab !== "suppliers" && productFilters.supplierId ? (
                  <StatusBadge label="已限定供应商" variant="neutral" />
                ) : null}
              </>
            }
            actions={
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {activeTab !== "suppliers" && canCreate ? (
                  <Link
                    href={buildProductCenterHref(productFilters, { createProduct: "1" })}
                    className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                  >
                    新建商品
                  </Link>
                ) : null}
                {activeTab !== "suppliers" && canAccessSupplierTab ? (
                  <Link
                    href={supplierWorkspaceHref}
                    className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                  >
                    供应商目录
                  </Link>
                ) : null}
                {activeTab === "suppliers" && canManageSupplierData ? (
                  <Link
                    href={buildSupplierCenterHref(supplierFilters, { createSupplier: "1" })}
                    className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                  >
                    新建供应商
                  </Link>
                ) : null}
              </div>
            }
          />
        </div>
      }
      summary={undefined}
      toolbar={
        <div className="mb-4 rounded-[1rem] border border-black/8 bg-white/92 p-1.5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
          <RecordTabs activeValue={activeTab} items={viewTabs} />
        </div>
      }
    >
      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      {activeTab === "products" && productData ? (
        <ProductsSection
          key={initialCreateProduct ? "products-create" : "products-default"}
          items={productData.items}
          suppliers={productData.suppliers}
          filters={productData.filters}
          summary={productData.summary}
          pagination={productData.pagination}
          detailProduct={detailData?.product ?? null}
          detailSkuId={detailSkuId}
          canCreate={canCreate}
          canManage={canManage}
          canViewSupplyIdentity={canViewSupplyIdentity}
          canViewSupplyGroup={canViewSupplyGroup}
          canViewFinanceCategory={canViewFinanceCategory}
          canAccessSupplierTab={canAccessSupplierTab}
          manageSuppliersHref={supplierWorkspaceHref}
          dictionaries={productCenterMeta?.dictionaries ?? null}
          initialCreateOpen={initialCreateProduct}
          upsertAction={upsertProductInlineAction}
          createWithInitialSkuAction={createProductWithInitialSkuInlineAction}
          toggleAction={toggleProductInlineAction}
          moveToRecycleBinAction={moveProductToRecycleBinInlineAction}
          upsertProductSkuAction={upsertProductSkuInlineAction}
          toggleProductSkuAction={toggleProductSkuInlineAction}
          moveProductSkuToRecycleBinAction={moveProductSkuToRecycleBinInlineAction}
          createInlineSupplierAction={createInlineSupplierAction}
        />
      ) : null}

      {activeTab === "skus" && productSkuData ? (
        <ProductSkusSection
          items={productSkuData.items}
          suppliers={productSkuData.suppliers}
          filters={productSkuData.filters}
          summary={productSkuData.summary}
          pagination={productSkuData.pagination}
          detailProduct={detailData?.product ?? null}
          detailSkuId={detailSkuId}
          canCreate={canCreate}
          canManage={canManage}
          canViewSupplyIdentity={canViewSupplyIdentity}
          canViewSupplyGroup={canViewSupplyGroup}
          canViewFinanceCategory={canViewFinanceCategory}
          canAccessSupplierTab={canAccessSupplierTab}
          manageSuppliersHref={supplierWorkspaceHref}
          dictionaries={productCenterMeta?.dictionaries ?? null}
          upsertProductAction={upsertProductInlineAction}
          toggleProductAction={toggleProductInlineAction}
          moveProductToRecycleBinAction={moveProductToRecycleBinInlineAction}
          upsertProductSkuAction={upsertProductSkuInlineAction}
          toggleProductSkuAction={toggleProductSkuInlineAction}
          moveProductSkuToRecycleBinAction={moveProductSkuToRecycleBinInlineAction}
          createInlineSupplierAction={createInlineSupplierAction}
        />
      ) : null}

      {activeTab === "suppliers" && supplierData ? (
        <SuppliersSection
          items={supplierData.items}
          filters={supplierData.filters}
          canManage={canManageSupplierData}
          redirectTo={supplierWorkspaceHref}
          currentHref={supplierWorkspaceHref}
          initialCreateOpen={initialCreateSupplier}
          upsertAction={upsertSupplierInlineAction}
          toggleAction={toggleSupplierInlineAction}
          moveToRecycleBinAction={moveSupplierToRecycleBinInlineAction}
        />
      ) : null}
    </WorkbenchLayout>
  );
}
