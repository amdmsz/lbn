import Link from "next/link";
import { redirect } from "next/navigation";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ProductsSection } from "@/components/products/products-section";
import { SuppliersSection } from "@/components/suppliers/suppliers-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { getParamValue } from "@/lib/action-notice";
import {
  canAccessProductModule,
  canAccessSupplierModule,
  canCreateProducts,
  canManageProducts,
  canManageSuppliers,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getProductsPageData } from "@/lib/products/queries";
import { getSuppliersPageData } from "@/lib/suppliers/queries";
import {
  createInlineSupplierAction,
  toggleProductInlineAction,
  upsertProductInlineAction,
} from "./actions";
import {
  toggleSupplierInlineAction,
  upsertSupplierInlineAction,
} from "../suppliers/actions";

function buildProductsHref(
  filters: {
    q: string;
    status: string;
    category: string;
    supplierId: string;
  },
  overrides: Partial<{
    q: string;
    status: string;
    category: string;
    supplierId: string;
    createProduct: string;
  }> = {},
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.category) params.set("category", next.category);
  if (next.supplierId) params.set("supplierId", next.supplierId);
  if (next.createProduct) params.set("createProduct", next.createProduct);

  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

function buildSuppliersHref(
  filters: {
    supplierQ: string;
    supplierStatus: string;
  },
  overrides: Partial<{
    supplierQ: string;
    supplierStatus: string;
    createSupplier: string;
  }> = {},
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  params.set("tab", "suppliers");

  if (next.supplierQ) params.set("supplierQ", next.supplierQ);
  if (next.supplierStatus) params.set("supplierStatus", next.supplierStatus);
  if (next.createSupplier) params.set("createSupplier", next.createSupplier);

  return `/products?${params.toString()}`;
}

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
  const activeTab = requestedTab === "suppliers" && canAccessSupplierTab ? "suppliers" : "products";

  const productData = await getProductsPageData(
    {
      id: session.user.id,
      role: session.user.role,
      permissionCodes: session.user.permissionCodes,
    },
    resolvedSearchParams,
  );

  const supplierData =
    activeTab === "suppliers"
      ? await getSuppliersPageData(
          {
            id: session.user.id,
            role: session.user.role,
            permissionCodes: session.user.permissionCodes,
          },
          resolvedSearchParams,
        )
      : null;

  const notice = activeTab === "suppliers" ? supplierData?.notice : productData.notice;
  const productWorkspaceHref = buildProductsHref(productData.filters);
  const supplierWorkspaceHref = buildSuppliersHref(
    supplierData?.filters ?? {
      supplierQ: "",
      supplierStatus: "",
    },
  );
  const initialCreateProduct =
    activeTab === "products" && getParamValue(resolvedSearchParams?.createProduct) === "1";
  const initialCreateSupplier =
    activeTab === "suppliers" && getParamValue(resolvedSearchParams?.createSupplier) === "1";

  const visibleProductCount = productData.items.length;
  const enabledProductCount = productData.items.filter((item) => item.enabled).length;
  const totalSkuCount = productData.items.reduce((sum, item) => sum + item._count.skus, 0);
  const visibleSupplierCount = new Set(productData.items.map((item) => item.supplier.id)).size;
  const activeStatusLabel =
    productData.filters.status === "enabled"
      ? "仅看启用"
      : productData.filters.status === "disabled"
        ? "仅看停用"
        : "全部状态";

  const viewTabs = [
    {
      value: "products",
      label: "商品",
      href: "/products",
      count: visibleProductCount,
    },
    ...(canAccessSupplierTab
      ? [
          {
            value: "suppliers",
            label: "供应商",
            href: "/products?tab=suppliers",
            count: productData.suppliers.length,
          },
        ]
      : []),
  ];

  return (
    <WorkbenchLayout
      header={
        <div className="mb-4">
          <PageHeader
            eyebrow="商品主数据工作台"
            title="商品中心"
            description="统一管理商品主数据、SKU 覆盖与供应商挂接，先在当前工作台完成筛选和识别，再进入详情维护。"
            meta={
              <>
                <StatusBadge
                  label={activeTab === "products" ? "商品主数据" : "供应商管理"}
                  variant="info"
                />
                <StatusBadge label={activeStatusLabel} variant="neutral" />
                {productData.filters.supplierId ? (
                  <StatusBadge label="已限定供应商" variant="neutral" />
                ) : null}
              </>
            }
            actions={
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {activeTab === "products" && canCreate ? (
                  <Link
                    href={buildProductsHref(productData.filters, { createProduct: "1" })}
                    className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                  >
                    新建商品
                  </Link>
                ) : null}
                {activeTab === "products" && canAccessSupplierTab ? (
                  <Link
                    href={buildSuppliersHref(
                      supplierData?.filters ?? {
                        supplierQ: "",
                        supplierStatus: "",
                      },
                    )}
                    className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                  >
                    供应商管理
                  </Link>
                ) : null}
                {activeTab === "suppliers" ? (
                  <Link
                    href={productWorkspaceHref}
                    className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                  >
                    返回商品列表
                  </Link>
                ) : null}
                {activeTab === "suppliers" && canManageSupplierData ? (
                  <Link
                    href={buildSuppliersHref(
                      supplierData?.filters ?? {
                        supplierQ: "",
                        supplierStatus: "",
                      },
                      { createSupplier: "1" },
                    )}
                    className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                  >
                    新增供应商
                  </Link>
                ) : null}
              </div>
            }
          />
        </div>
      }
      summary={
        activeTab === "products" ? (
          <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="当前结果"
              value={String(visibleProductCount)}
              note="基于当前筛选条件可见的商品条目"
              density="strip"
            />
            <MetricCard
              label="启用商品"
              value={String(enabledProductCount)}
              note="当前结果中仍可直接参与下单的商品"
              density="strip"
            />
            <MetricCard
              label="SKU 总量"
              value={String(totalSkuCount)}
              note="当前结果挂接的 SKU 总数"
              density="strip"
            />
            <MetricCard
              label="覆盖供应商"
              value={String(visibleSupplierCount)}
              note="当前结果涉及的供应商范围"
              density="strip"
            />
          </div>
        ) : undefined
      }
      toolbar={
        <div className="mb-5">
          <SectionCard
            density="compact"
            title="域内切换"
            description="保持 /products 为商品域唯一一级入口，供应商管理继续作为域内次级视图。"
          >
            <div className="space-y-3">
              <RecordTabs activeValue={activeTab} items={viewTabs} />
              {activeTab === "products" ? (
                <div className="rounded-[0.95rem] border border-black/8 bg-[rgba(247,248,250,0.72)] px-3.5 py-3 text-sm leading-6 text-black/62">
                  搜索、状态和供应商筛选集中留在商品主列表内，避免把 supplier tab 做成平行一级页面。
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      }
    >
      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      {activeTab === "products" ? (
        <ProductsSection
          items={productData.items}
          suppliers={productData.suppliers}
          filters={productData.filters}
          canCreate={canCreate}
          canManage={canManage}
          canAccessSupplierTab={canAccessSupplierTab}
          currentHref={productWorkspaceHref}
          manageSuppliersHref={supplierWorkspaceHref}
          initialCreateOpen={initialCreateProduct}
          upsertAction={upsertProductInlineAction}
          toggleAction={toggleProductInlineAction}
          createInlineSupplierAction={createInlineSupplierAction}
        />
      ) : supplierData ? (
        <SuppliersSection
          items={supplierData.items}
          filters={supplierData.filters}
          canManage={canManageSupplierData}
          redirectTo={supplierWorkspaceHref}
          currentHref={supplierWorkspaceHref}
          initialCreateOpen={initialCreateSupplier}
          upsertAction={upsertSupplierInlineAction}
          toggleAction={toggleSupplierInlineAction}
        />
      ) : null}
    </WorkbenchLayout>
  );
}
