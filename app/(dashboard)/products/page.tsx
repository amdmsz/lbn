import Link from "next/link";
import { redirect } from "next/navigation";
import { ProductsSection } from "@/components/products/products-section";
import { SuppliersSection } from "@/components/suppliers/suppliers-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { WorkspaceGuide } from "@/components/shared/workspace-guide";
import { getParamValue } from "@/lib/action-notice";
import {
  canAccessProductModule,
  canAccessSupplierModule,
  canManageProducts,
  canManageSuppliers,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getProductsPageData } from "@/lib/products/queries";
import { getSuppliersPageData } from "@/lib/suppliers/queries";
import {
  createInlineSupplierAction,
  toggleProductAction,
  upsertProductAction,
} from "./actions";
import { toggleSupplierAction, upsertSupplierAction } from "../suppliers/actions";

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
  const requestedTab = getParamValue(resolvedSearchParams?.tab);
  const canManage = canManageProducts(session.user.role);
  const canAccessSupplierTab = canAccessSupplierModule(session.user.role);
  const canManageSupplierData = canManageSuppliers(session.user.role);
  const activeTab = requestedTab === "suppliers" && canAccessSupplierTab ? "suppliers" : "products";

  const productData = await getProductsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  const supplierData =
    activeTab === "suppliers"
      ? await getSuppliersPageData(
          {
            id: session.user.id,
            role: session.user.role,
          },
          resolvedSearchParams,
        )
      : null;

  const notice = activeTab === "suppliers" ? supplierData?.notice : productData.notice;
  const totalProducts = productData.items.length;
  const totalSuppliers = supplierData?.items.length ?? 0;

  return (
    <div className="crm-page">
      <PageHeader
        title="商品中心"
        description="商品中心已成为商品域唯一一级入口。商品、SKU 与供货商管理都在这里收口，不再并列成两个独立工作台。"
        actions={
          <>
            <StatusBadge
              label={activeTab === "products" ? `商品 ${totalProducts}` : `供货商 ${totalSuppliers}`}
              variant="info"
            />
            <StatusBadge
              label={activeTab === "products" ? "商品视图" : "供货商视图"}
              variant={activeTab === "products" ? "success" : "warning"}
            />
            <StatusBadge
              label={canManage ? "可维护商品 / SKU" : "协作只读"}
              variant={canManage ? "success" : "neutral"}
            />
          </>
        }
      />

      <WorkspaceGuide
        title="商品域范围"
        description="本页将商品主数据与供货商管理放在同一商品域内，同时明确不扩展到采购、库存、结算等更重的下游域。"
        items={[
          {
            title: "商品仍是主入口",
            description:
              "默认视图仍是商品列表，先用商品、SKU、供货商搜索和筛选完成识别，再进入次级管理能力。",
            badgeLabel: "主入口",
            badgeVariant: "info",
          },
          {
            title: "供货商成为次级能力",
            description:
              "ADMIN 与 SUPERVISOR 现在在商品中心内切入供货商管理，而不是依赖独立的一级导航入口。",
            href: canAccessSupplierTab ? "/products?tab=suppliers" : undefined,
            hrefLabel: canAccessSupplierTab ? "打开供货商视图" : undefined,
            badgeLabel: "次级视图",
            badgeVariant: "success",
          },
          {
            title: "权限边界保持不变",
            description:
              "OPS 不会因为这次 IA 收口获得供货商维护权限，SALES 也不会因此获得商品中心入口。",
            badgeLabel: "权限",
            badgeVariant: "warning",
          },
        ]}
      />

      <div className="rounded-[1.35rem] border border-black/7 bg-white/92 p-2 shadow-[0_18px_36px_rgba(16,24,40,0.04)]">
        <div className="grid gap-2 md:grid-cols-2">
          <Link
            href="/products"
            className={
              activeTab === "products"
                ? "rounded-[1rem] border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm font-semibold text-emerald-800"
                : "rounded-[1rem] border border-transparent px-4 py-3 text-sm font-medium text-black/62 hover:border-black/8 hover:bg-black/[0.03]"
            }
          >
            商品列表
          </Link>

          {canAccessSupplierTab ? (
            <Link
              href="/products?tab=suppliers"
              className={
                activeTab === "suppliers"
                  ? "rounded-[1rem] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-semibold text-amber-800"
                  : "rounded-[1rem] border border-transparent px-4 py-3 text-sm font-medium text-black/62 hover:border-black/8 hover:bg-black/[0.03]"
              }
            >
              供货商管理
            </Link>
          ) : null}
        </div>
      </div>

      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      <DataTableWrapper
        title={activeTab === "products" ? "商品列表" : "供货商管理"}
        description={
          activeTab === "products"
            ? "在商品主视图中完成搜索、筛选、新建和维护；只有在需要时再进入 SKU 详情页或供货商管理。"
            : "供货商管理现在收进商品中心内部，保留新增、编辑、启停、关联商品数与最近使用等轻量能力，不扩展到采购或结算流程。"
        }
      >
        {activeTab === "products" ? (
          <ProductsSection
            items={productData.items}
            suppliers={productData.suppliers}
            filters={productData.filters}
            canManage={canManage}
            canAccessSupplierTab={canAccessSupplierTab}
            listHref="/products"
            manageSuppliersHref="/products?tab=suppliers"
            upsertAction={upsertProductAction}
            toggleAction={toggleProductAction}
            createInlineSupplierAction={createInlineSupplierAction}
          />
        ) : supplierData ? (
          <SuppliersSection
            items={supplierData.items}
            filters={supplierData.filters}
            canManage={canManageSupplierData}
            redirectTo="/products?tab=suppliers"
            upsertAction={upsertSupplierAction}
            toggleAction={toggleSupplierAction}
          />
        ) : null}
      </DataTableWrapper>
    </div>
  );
}
