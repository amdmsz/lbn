"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import type {
  MasterDataRecycleGuard,
  MasterDataRecycleReasonCode,
} from "@/lib/products/recycle-guards";

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
  recycleGuard: MasterDataRecycleGuard;
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
  const [recycleTarget, setRecycleTarget] = useState<ProductItem | null>(null);
  const [recycleReason, setRecycleReason] =
    useState<MasterDataRecycleReasonCode>("mistaken_creation");
  const [pendingToggleId, startToggleTransition] = useTransition();

  const hasActiveFilters = Boolean(filters.q || filters.status || filters.supplierId || filters.category);

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

  function closeRecycleDialog() {
    setRecycleTarget(null);
    setRecycleReason("mistaken_creation");
  }

  return (
    <div className="space-y-4">
      <SectionCard
        density="compact"
        title="筛选与控制"
        description="先按商品名缩小范围，再结合状态与供应商定位需要维护的主数据。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`当前结果 ${items.length}`} variant="neutral" />
            {filters.category ? (
              <StatusBadge label={`保留分类 ${filters.category}`} variant="neutral" />
            ) : null}
          </div>
        }
      >
        <form method="get" className="flex flex-col gap-3 xl:flex-row xl:items-end">
          {filters.category ? <input type="hidden" name="category" value={filters.category} /> : null}

          <label className="min-w-0 flex-1 space-y-2">
            <span className="crm-label">搜索</span>
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="商品名、编码、SKU 或供应商"
              className="crm-input"
            />
          </label>

          <label className="space-y-2 xl:w-[10rem]">
            <span className="crm-label">状态</span>
            <select name="status" defaultValue={filters.status} className="crm-select">
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <label className="space-y-2 xl:w-[14rem]">
            <span className="crm-label">供应商</span>
            <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
              <option value="">全部供应商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code}){supplier.enabled ? "" : " - 已停用"}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              应用筛选
            </button>
            <Link
              href={buildProductsHref({ q: "", status: "", category: "", supplierId: "" })}
              className="crm-button crm-button-secondary"
            >
              重置
            </Link>
          </div>
        </form>

        {filters.category ? (
          <p className="mt-3 text-[12px] leading-5 text-black/48">
            当前仍保留旧链接带入的分类参数，主工具条不再单独展示该占位控件。
          </p>
        ) : null}
      </SectionCard>

      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <SectionCard
        density="compact"
        title="商品列表"
        description={
          hasActiveFilters
            ? "优先扫描商品名、供应商和更新时间，再进入详情或编辑。"
            : "聚焦商品主数据、SKU 覆盖和引用情况，默认保持列表扫描效率。"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`SKU ${items.reduce((sum, item) => sum + item._count.skus, 0)}`} variant="neutral" />
            <StatusBadge
              label={`引用 ${items.reduce((sum, item) => sum + item._count.salesOrderItems, 0)}`}
              variant="neutral"
            />
          </div>
        }
        contentClassName="p-0"
      >
        {items.length > 0 ? (
          <div className="divide-y divide-black/6">
            {items.map((item) => (
              <article
                key={item.id}
                className="group flex flex-col gap-3 px-4 py-3.5 md:px-5 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.enabled} />
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-black/55">
                      {item.code}
                    </span>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <Link
                      href={`/products/${item.id}`}
                      className="block truncate text-[15px] font-semibold text-black/86 transition-colors hover:text-[var(--color-accent)]"
                    >
                      {item.name}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-black/58">
                      <span>{item.supplier.name}</span>
                      <span className="text-black/24">•</span>
                      <span>{item.supplier.code}</span>
                    </div>
                    {item.description ? (
                      <p className="line-clamp-1 text-[13px] leading-5 text-black/50">
                        {item.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-5 text-black/48">
                    <span>SKU {item._count.skus}</span>
                    <span>成交引用 {item._count.salesOrderItems}</span>
                    <span>最近更新 {formatDateTime(item.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Link href={`/products/${item.id}`} className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm">
                    查看详情
                  </Link>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => openEditDrawer(item)}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                    >
                      编辑商品
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      disabled={pendingToggleId}
                      className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {item.enabled ? "停用" : "启用"}
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setRecycleTarget(item)}
                      className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                    >
                      {item.recycleGuard.canMoveToRecycleBin
                        ? "\u79fb\u5165\u56de\u6536\u7ad9"
                        : "\u67e5\u770b\u5f15\u7528\u5173\u7cfb"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-4 md:p-5">
            <EmptyState
              title={hasActiveFilters ? "当前筛选下没有商品" : "商品主数据还未建立"}
              description={
                hasActiveFilters
                  ? "调整搜索、状态或供应商条件后再继续扫描当前工作台。"
                  : "先建立商品主数据，再进入详情维护 SKU 和供应商挂接。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {hasActiveFilters ? (
                    <Link
                      href={buildProductsHref({ q: "", status: "", category: "", supplierId: "" })}
                      className="crm-button crm-button-secondary"
                    >
                      清空筛选
                    </Link>
                  ) : null}
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={openCreateDrawer}
                      className="crm-button crm-button-primary"
                    >
                      新建商品
                    </button>
                  ) : null}
                  {!hasActiveFilters && canAccessSupplierTab ? (
                    <Link href={manageSuppliersHref} className="crm-button crm-button-secondary">
                      查看供应商
                    </Link>
                  ) : null}
                </div>
              }
            />
          </div>
        )}
      </SectionCard>

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

      <MasterDataRecycleDialog
        open={recycleTarget !== null}
        objectName={recycleTarget?.name ?? ""}
        objectTypeLabel="\u5546\u54c1"
        secondaryLabel={recycleTarget?.code ?? ""}
        domainLabel="\u5546\u54c1\u4e3b\u6570\u636e"
        updatedAt={recycleTarget?.updatedAt ?? new Date()}
        guard={
          recycleTarget?.recycleGuard ?? {
            canMoveToRecycleBin: false,
            fallbackActionLabel: "\u6539\u4e3a\u505c\u7528\u5546\u54c1",
            blockerSummary: "",
            blockers: [],
            futureRestoreBlockers: [],
          }
        }
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        pending={pendingToggleId}
        onFallbackAction={
          recycleTarget
            ? () => {
                handleToggle(recycleTarget);
                closeRecycleDialog();
              }
            : undefined
        }
      />
    </div>
  );
}
