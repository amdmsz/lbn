"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/customers/metadata";

type SupplierOption = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
};

type ProductItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  supplier: SupplierOption;
  _count: {
    skus: number;
    salesOrderItems: number;
  };
};

type InlineSupplierResult =
  | {
      success: true;
      supplier: {
        id: string;
        name: string;
        code: string;
      };
      message: string;
    }
  | {
      success: false;
      errorMessage: string;
    };

type ProductActionResult = {
  status: "success" | "error";
  message: string;
};

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
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.q) params.set("q", next.q);
  if (next.status) params.set("status", next.status);
  if (next.category) params.set("category", next.category);
  if (next.supplierId) params.set("supplierId", next.supplierId);
  if (next.createProduct) params.set("createProduct", next.createProduct);

  const query = params.toString();
  return query ? `/products?${query}` : "/products";
}

export function ProductsSection({
  items,
  suppliers,
  filters,
  canCreate,
  canManage,
  canAccessSupplierTab,
  currentHref,
  manageSuppliersHref,
  initialCreateOpen,
  upsertAction,
  toggleAction,
  createInlineSupplierAction,
}: Readonly<{
  items: ProductItem[];
  suppliers: SupplierOption[];
  filters: {
    q: string;
    status: string;
    category: string;
    supplierId: string;
  };
  canCreate: boolean;
  canManage: boolean;
  canAccessSupplierTab: boolean;
  currentHref: string;
  manageSuppliersHref: string;
  initialCreateOpen: boolean;
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleAction: (formData: FormData) => Promise<ProductActionResult>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [drawerProduct, setDrawerProduct] = useState<ProductItem | null>(null);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(
    initialCreateOpen ? "create" : null,
  );
  const [initialDrawerPendingClose, setInitialDrawerPendingClose] = useState(initialCreateOpen);
  const [pendingToggleId, startToggleTransition] = useTransition();

  function openCreateDrawer() {
    setDrawerProduct(null);
    setDrawerMode("create");
  }

  function openEditDrawer(product: ProductItem) {
    setDrawerProduct(product);
    setDrawerMode("edit");
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDrawerProduct(null);

    if (initialDrawerPendingClose) {
      setInitialDrawerPendingClose(false);
      router.replace(currentHref);
    }
  }

  function handleSaved(message: string) {
    setNotice({
      status: "success",
      message,
    });
    closeDrawer();
    router.refresh();
  }

  function handleToggle(item: ProductItem) {
    const formData = new FormData();
    formData.set("id", item.id);
    formData.set("redirectTo", currentHref);

    startToggleTransition(async () => {
      const result = await toggleAction(formData);
      setNotice(result);

      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="crm-filter-panel space-y-4">
        <form
          method="get"
          className="crm-filter-grid md:grid-cols-2 2xl:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(0,0.82fr))_auto]"
        >
          <label className="space-y-2">
            <span className="crm-label">搜索</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="商品名 / SKU / 供货商"
              className="crm-input"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">状态</span>
            <select name="status" defaultValue={filters.status} className="crm-select">
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">类目</span>
            <select name="category" defaultValue={filters.category} className="crm-select" disabled>
              <option value="">类目待补充</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">供货商</span>
            <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
              <option value="">全部供货商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code}){supplier.enabled ? "" : " - 已停用"}
                </option>
              ))}
            </select>
          </label>

          <div className="crm-filter-actions md:col-span-2 2xl:col-span-1">
            <button type="submit" className="crm-button crm-button-primary">
              应用
            </button>
            <Link
              href={buildProductsHref({ q: "", status: "", category: "", supplierId: "" })}
              className="crm-button crm-button-secondary"
            >
              重置
            </Link>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/6 pt-4">
          <div className="text-sm text-black/58">
            默认先筛选和浏览商品，再决定是否新建或进入详情管理 SKU。
          </div>

          <div className="flex flex-wrap gap-2">
            {canCreate ? (
              <button type="button" onClick={openCreateDrawer} className="crm-button crm-button-primary">
                新建商品
              </button>
            ) : null}
            {canAccessSupplierTab ? (
              <Link href={manageSuppliersHref} className="crm-button crm-button-secondary">
                供货商管理
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <div key={item.id} className="crm-card-muted px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.enabled} />
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      {item.code}
                    </span>
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      SKU {item._count.skus}
                    </span>
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      成交引用 {item._count.salesOrderItems}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-black/84">{item.name}</div>
                    <div className="mt-1 text-sm text-black/58">
                      {item.supplier.name} ({item.supplier.code})
                    </div>
                    {item.description ? (
                      <div className="mt-1 line-clamp-2 text-sm text-black/52">{item.description}</div>
                    ) : null}
                  </div>
                </div>

                <div className="w-full space-y-1 text-left text-sm text-black/56 sm:w-auto sm:min-w-[11rem] sm:text-right">
                  <div>最近更新：{formatDateTime(item.updatedAt)}</div>
                  <div>创建时间：{formatDateTime(item.createdAt)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-black/6 pt-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-black/54">默认进入详情页管理 SKU 和查看商品摘要。</div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/products/${item.id}`} className="crm-button crm-button-secondary">
                    查看详情
                  </Link>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => openEditDrawer(item)}
                      className="crm-button crm-button-secondary"
                    >
                      编辑商品
                    </button>
                  ) : null}
                  <Link href={`/products/${item.id}`} className="crm-button crm-button-secondary">
                    管理 SKU
                  </Link>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      disabled={pendingToggleId}
                      className="crm-button crm-button-secondary"
                    >
                      {item.enabled ? "停用" : "启用"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无商品"
          description="先调整筛选，或直接新建商品。"
          action={
            canCreate ? (
              <button type="button" onClick={openCreateDrawer} className="crm-button crm-button-primary">
                新建商品
              </button>
            ) : undefined
          }
        />
      )}

      <ProductFormDrawer
        open={drawerMode !== null}
        mode={drawerMode ?? "create"}
        product={
          drawerMode === "edit" && drawerProduct
            ? {
                id: drawerProduct.id,
                supplierId: drawerProduct.supplier.id,
                code: drawerProduct.code,
                name: drawerProduct.name,
                description: drawerProduct.description,
              }
            : null
        }
        suppliers={suppliers}
        redirectTo={currentHref}
        canQuickCreateSupplier={canAccessSupplierTab}
        upsertAction={upsertAction}
        createInlineSupplierAction={createInlineSupplierAction}
        onClose={closeDrawer}
        onSaved={handleSaved}
      />
    </div>
  );
}
