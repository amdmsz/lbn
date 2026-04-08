import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductsSection } from "@/components/products/products-section";
import { SuppliersSection } from "@/components/suppliers/suppliers-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { PageHeader } from "@/components/shared/page-header";
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
  const initialCreateProduct = activeTab === "products" && getParamValue(resolvedSearchParams?.createProduct) === "1";
  const initialCreateSupplier = activeTab === "suppliers" && getParamValue(resolvedSearchParams?.createSupplier) === "1";

  return (
    <div className="crm-page">
      <PageHeader
        title="商品中心"
        description="统一管理商品、SKU 与供货商。"
        actions={
          <div className="crm-toolbar-cluster">
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
                供货商管理
              </Link>
            ) : null}
            {activeTab === "suppliers" ? (
              <Link
                href={productWorkspaceHref}
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                商品列表
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
                新增供货商
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="rounded-[1.35rem] border border-black/7 bg-white/92 p-2 shadow-[0_18px_36px_rgba(16,24,40,0.04)]">
        <div className="flex flex-col gap-2 md:flex-row">
          <Link
            href="/products"
            className={
              activeTab === "products"
                ? "flex-1 rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-800"
                : "flex-1 rounded-[1rem] border border-transparent px-4 py-3 text-sm font-medium text-black/62 hover:border-black/8 hover:bg-black/[0.03]"
            }
          >
            商品列表
          </Link>

          {canAccessSupplierTab ? (
            <Link
              href="/products?tab=suppliers"
              className={
                activeTab === "suppliers"
                  ? "flex-1 rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-800"
                  : "flex-1 rounded-[1rem] border border-transparent px-4 py-3 text-sm font-medium text-black/62 hover:border-black/8 hover:bg-black/[0.03]"
              }
            >
              供货商管理
            </Link>
          ) : null}
        </div>
      </div>

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
    </div>
  );
}
