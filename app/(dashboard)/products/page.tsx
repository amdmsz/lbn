import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ProductSkusSection } from "@/components/products/product-skus-section";
import { ProductsSection } from "@/components/products/products-section";
import { SuppliersSection } from "@/components/suppliers/suppliers-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { PageHeader } from "@/components/shared/page-header";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
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
import { cn } from "@/lib/utils";

export default async function ProductsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (
    !canAccessProductModule(session.user.role, session.user.permissionCodes)
  ) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedTab = getParamValue(resolvedSearchParams?.tab);
  const detailProductId = getParamValue(resolvedSearchParams?.detail);
  const detailSkuId = getParamValue(resolvedSearchParams?.detailSku);
  const canCreate = canCreateProducts(
    session.user.role,
    session.user.permissionCodes,
  );
  const canManage = canManageProducts(
    session.user.role,
    session.user.permissionCodes,
  );
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

  const productData =
    activeTab === "products"
      ? await getProductsPageData(viewer, resolvedSearchParams)
      : null;
  const productSkuData =
    activeTab === "skus"
      ? await getProductSkusPageData(viewer, resolvedSearchParams)
      : null;
  const supplierData =
    activeTab === "suppliers"
      ? await getSuppliersPageData(viewer, resolvedSearchParams)
      : null;
  const productCenterMeta =
    activeTab === "suppliers" ? null : await getProductCenterMeta(viewer);
  const detailData =
    activeTab === "suppliers" || !detailProductId
      ? null
      : await getProductDetail(viewer, detailProductId, resolvedSearchParams);

  const productFilters = productData?.filters ??
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
  const supplierFilters = supplierData?.filters ?? {
    supplierQ: "",
    supplierStatus: "",
  };

  const productWorkspaceHref = buildProductCenterHref(productFilters);
  const skuWorkspaceHref = buildProductCenterHref(productFilters, {
    tab: "skus",
  });
  const supplierWorkspaceHref = buildSupplierCenterHref(supplierFilters);
  const initialCreateProduct =
    activeTab === "products" &&
    getParamValue(resolvedSearchParams?.createProduct) === "1";
  const initialCreateSupplier =
    activeTab === "suppliers" &&
    getParamValue(resolvedSearchParams?.createSupplier) === "1";

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
            count:
              activeTab === "suppliers" ? supplierData?.items.length : null,
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

  const activeViewLabel =
    activeTab === "products"
      ? "商品主档"
      : activeTab === "skus"
        ? "SKU 经营"
        : "供应目录";
  const headerTitle =
    activeTab === "products"
      ? "商品列表"
      : activeTab === "skus"
        ? "SKU 列表"
        : "供应商目录";
  const headerDescription =
    activeTab === "products"
      ? "以商品名与规格为主的轻量主数据工作区。"
      : activeTab === "skus"
        ? "按规格查看默认售价、商品覆盖与当前经营范围。"
        : "供应商保持为商品域次级面，只做轻维护。";

  const topSummaryItems =
    activeTab === "products" && productData
      ? [
          {
            label: "商品",
            value: String(productData.summary.totalCount),
            note: "当前结果",
          },
          {
            label: "启用",
            value: String(productData.summary.enabledCount),
            note: "仍可经营",
          },
          {
            label: "规格",
            value: String(productData.summary.skuCount),
            note: "当前覆盖",
          },
          {
            label: "引用",
            value: String(productData.summary.salesOrderItemCount),
            note: "历史订单",
          },
        ]
      : activeTab === "skus" && productSkuData
        ? [
            {
              label: "SKU",
              value: String(productSkuData.summary.totalCount),
              note: "当前结果",
            },
            {
              label: "启用",
              value: String(productSkuData.summary.enabledCount),
              note: "仍可建单",
            },
            {
              label: "商品",
              value: String(productSkuData.summary.productCount),
              note: "当前覆盖",
            },
            {
              label: "引用",
              value: String(productSkuData.summary.salesOrderItemCount),
              note: "历史订单",
            },
          ]
        : activeTab === "suppliers" && supplierData
          ? [
              {
                label: "供应商",
                value: String(supplierData.items.length),
                note: "当前结果",
              },
              {
                label: "启用",
                value: String(
                  supplierData.items.filter((item) => item.enabled).length,
                ),
                note: "仍在使用",
              },
              {
                label: "关联商品",
                value: String(
                  supplierData.items.reduce(
                    (sum, item) => sum + item._count.products,
                    0,
                  ),
                ),
                note: "商品覆盖",
              },
              {
                label: "当前视图",
                value: activeViewLabel,
                note: "商品域次级面",
              },
            ]
          : [];

  const summaryItems: PageSummaryStripItem[] =
    activeTab === "products"
      ? []
      : topSummaryItems.map((item) => ({
          label: item.label,
          value: item.value,
          note: item.note,
          emphasis:
            item.label === "启用"
              ? "success"
              : item.label === "引用"
                ? "info"
                : "default",
        }));

  const headerMeta =
    activeTab === "products" ? null : (
      <>
        <StatusBadge label={activeStatusLabel} variant="neutral" />
        {activeTab !== "suppliers" && productFilters.supplierId ? (
          <StatusBadge label="已限定供应商" variant="warning" />
        ) : null}
        <StatusBadge label={activeViewLabel} variant="info" />
      </>
    );

  const viewTabLinks = viewTabs.map((item) => (
    <Link
      key={item.value}
      href={item.href}
      className={cn(
        "inline-flex min-h-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium transition-[border-color,background-color,color]",
        item.value === activeTab
          ? "border border-[rgba(111,141,255,0.16)] bg-[rgba(111,141,255,0.08)] text-[var(--foreground)]"
          : "border border-transparent text-[var(--color-sidebar-muted)] hover:border-[var(--color-border-soft)] hover:bg-[var(--color-panel)] hover:text-[var(--foreground)]",
      )}
    >
      <span>{item.label}</span>
      {typeof item.count === "number" ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10.5px]",
            item.value === activeTab
              ? "bg-[rgba(111,141,255,0.12)] text-[var(--color-accent-strong)]"
              : "bg-[var(--color-shell-surface)] text-[var(--color-sidebar-muted)]",
          )}
        >
          {item.count}
        </span>
      ) : null}
    </Link>
  ));

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="商品中心"
          title={headerTitle}
          description={activeTab === "suppliers" ? headerDescription : undefined}
          meta={headerMeta}
          className="px-4 py-2 md:px-5 md:py-2 [&_.crm-eyebrow]:hidden"
          actions={
            <div className="crm-toolbar-cluster">
              {activeTab !== "suppliers" && canCreate ? (
                <Link
                  href={buildProductCenterHref(productFilters, {
                    createProduct: "1",
                  })}
                  className="crm-button crm-button-primary min-h-0 gap-1.5 px-3 py-1.5 text-[13px]"
                >
                  <Plus className="h-4 w-4" />
                  添加商品
                </Link>
              ) : null}
              {activeTab !== "suppliers" && canAccessSupplierTab ? (
                <Link
                  href={supplierWorkspaceHref}
                  className="crm-button crm-button-secondary min-h-0 px-2.5 py-1.5 text-[13px]"
                >
                  供应商目录
                </Link>
              ) : null}
              {activeTab === "suppliers" && canManageSupplierData ? (
                <Link
                  href={buildSupplierCenterHref(supplierFilters, {
                    createSupplier: "1",
                  })}
                  className="crm-button crm-button-primary min-h-0 gap-1.5 px-3 py-1.5 text-[13px]"
                >
                  <Plus className="h-4 w-4" />
                  新建供应商
                </Link>
              ) : null}
            </div>
          }
        />
      }
      summary={
        summaryItems.length > 0 ? (
          <PageSummaryStrip items={summaryItems} className="gap-2" />
        ) : undefined
      }
      toolbar={
        <div className="overflow-x-auto">
          <div className="inline-flex min-w-max items-center gap-1 rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-1 shadow-[var(--color-shell-shadow-xs)]">
            {viewTabLinks}
          </div>
        </div>
      }
    >
      {notice ? (
        <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner>
      ) : null}

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
          moveProductSkuToRecycleBinAction={
            moveProductSkuToRecycleBinInlineAction
          }
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
          moveProductSkuToRecycleBinAction={
            moveProductSkuToRecycleBinInlineAction
          }
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
