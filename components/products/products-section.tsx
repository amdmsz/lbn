"use client";

import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductMainImage } from "@/components/products/product-main-image";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import { ProductWorkspaceDetailDrawer } from "@/components/products/product-workspace-detail-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  PRODUCT_CENTER_EMPTY_FILTERS,
  PRODUCT_CENTER_SYSTEM_VIEWS,
  type ProductCenterDictionaryOption,
  type ProductCenterFilters,
} from "@/lib/products/metadata";
import { buildProductCenterHref } from "@/lib/products/navigation";
import type { MasterDataRecycleGuard } from "@/lib/products/recycle-guards";
import { cn } from "@/lib/utils";

type DecimalLike = {
  toString(): string;
};

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
  mainImagePath: string | null;
  brandName: string | null;
  seriesName: string | null;
  categoryCode: string | null;
  primarySalesSceneCode: string | null;
  supplyGroupCode: string | null;
  financeCategoryCode: string | null;
  description: string | null;
  internalSupplyRemark: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  supplier: SupplierOption | null;
  skus: Array<{
    id: string;
    skuName: string;
    defaultUnitPrice: string;
    enabled: boolean;
    updatedAt: Date;
    _count: {
      salesOrderItems: number;
    };
  }>;
  _count: {
    skus: number;
    salesOrderItems: number;
  };
  recycleGuard: MasterDataRecycleGuard;
};

type ProductDetail = {
  id: string;
  code: string;
  name: string;
  mainImagePath: string | null;
  brandName: string | null;
  seriesName: string | null;
  categoryCode: string | null;
  primarySalesSceneCode: string | null;
  supplyGroupCode: string | null;
  financeCategoryCode: string | null;
  description: string | null;
  internalSupplyRemark: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  supplierId: string;
  supplier: SupplierOption | null;
  _count: {
    skus: number;
    salesOrderItems: number;
  };
  recycleGuard: MasterDataRecycleGuard;
  skus: Array<{
    id: string;
    skuName: string;
    defaultUnitPrice: DecimalLike;
    codSupported: boolean;
    insuranceSupported: boolean;
    defaultInsuranceAmount: DecimalLike;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      salesOrderItems: number;
    };
    recycleGuard: MasterDataRecycleGuard;
  }>;
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
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
};

const EMPTY_DICTIONARIES = {
  categoryOptions: [] as ProductCenterDictionaryOption[],
  primarySalesSceneOptions: [] as ProductCenterDictionaryOption[],
  supplyGroupOptions: [] as ProductCenterDictionaryOption[],
  financeCategoryOptions: [] as ProductCenterDictionaryOption[],
};

const productMetaPillClassName =
  "rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]";

const productCompactMetaClassName =
  "flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]";

const productQuietActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-transparent px-2.5 py-2 text-sm font-medium text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color] hover:border-[var(--color-border-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50";

const productControlSurfaceClassName =
  "rounded-[1.08rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3.5 py-3.5 shadow-[var(--color-shell-shadow-sm)]";

const productTableShellClassName =
  "crm-table-shell overflow-hidden rounded-[1.12rem]";

function resolveDictionaryLabel(
  options: ProductCenterDictionaryOption[],
  code: string | null,
) {
  if (!code) {
    return "";
  }

  return options.find((option) => option.code === code)?.label ?? code;
}

function hasAdvancedFilters(filters: ProductCenterFilters) {
  return Boolean(
    filters.brandName ||
    filters.seriesName ||
    filters.categoryCode ||
    filters.primarySalesSceneCode ||
    filters.supplyGroupCode ||
    filters.financeCategoryCode,
  );
}

function hasAnyFilters(filters: ProductCenterFilters) {
  return Boolean(
    filters.q ||
    filters.status ||
    filters.supplierId ||
    filters.brandName ||
    filters.seriesName ||
    filters.categoryCode ||
    filters.primarySalesSceneCode ||
    filters.supplyGroupCode ||
    filters.financeCategoryCode ||
    filters.preset,
  );
}

function joinReadableParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" / ");
}

function buildProductPriceCoverageLabel(
  skus: Array<{
    defaultUnitPrice: string;
  }>,
) {
  if (skus.length === 0) {
    return "未录售价";
  }

  const prices = skus
    .map((sku) => Number(sku.defaultUnitPrice))
    .filter((price) => Number.isFinite(price));

  if (prices.length === 0) {
    return "未录售价";
  }

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (minPrice === maxPrice) {
    return `售价 ${formatCurrency(minPrice)}`;
  }

  return `售价 ${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)}`;
}

function buildSkuPreviewLabel(
  skus: Array<{
    skuName: string;
  }>,
) {
  if (skus.length === 0) {
    return "尚未建立 SKU";
  }

  const visibleNames = skus
    .map((sku) => sku.skuName.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (visibleNames.length === 0) {
    return `SKU ${skus.length}`;
  }

  return skus.length > 2
    ? `${visibleNames.join(" · ")} +${skus.length - 2}`
    : visibleNames.join(" · ");
}

function buildReferenceFillPercentage(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }

  return Math.max(10, Math.round((value / maxValue) * 100));
}

function getReferenceSignal(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) {
    return {
      label: "低",
      barClassName: "bg-[rgba(209,91,118,0.55)]",
      textClassName: "text-[var(--color-danger)]",
    };
  }

  const ratio = value / maxValue;

  if (ratio >= 0.66) {
    return {
      label: "高",
      barClassName:
        "bg-[linear-gradient(90deg,rgba(111,141,255,0.64),rgba(79,125,247,0.92))]",
      textClassName: "text-[var(--color-info)]",
    };
  }

  if (ratio >= 0.33) {
    return {
      label: "中",
      barClassName:
        "bg-[linear-gradient(90deg,rgba(240,195,106,0.7),rgba(214,152,48,0.92))]",
      textClassName: "text-[var(--color-warning)]",
    };
  }

  return {
    label: "低",
    barClassName:
      "bg-[linear-gradient(90deg,rgba(209,91,118,0.66),rgba(209,91,118,0.9))]",
    textClassName: "text-[var(--color-danger)]",
  };
}

export function ProductsSection({
  items,
  suppliers,
  filters,
  summary,
  pagination,
  detailProduct,
  detailSkuId,
  dictionaries,
  canCreate,
  canManage,
  canViewSupplyIdentity,
  canViewSupplyGroup,
  canViewFinanceCategory,
  canAccessSupplierTab,
  manageSuppliersHref,
  initialCreateOpen,
  upsertAction,
  createWithInitialSkuAction,
  toggleAction,
  moveToRecycleBinAction,
  upsertProductSkuAction,
  toggleProductSkuAction,
  moveProductSkuToRecycleBinAction,
  createInlineSupplierAction,
}: Readonly<{
  items: ProductItem[];
  suppliers: SupplierOption[];
  filters: ProductCenterFilters;
  summary: {
    totalCount: number;
    enabledCount: number;
    skuCount: number;
    salesOrderItemCount: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  detailProduct: ProductDetail | null;
  detailSkuId: string;
  dictionaries: {
    categoryOptions: ProductCenterDictionaryOption[];
    primarySalesSceneOptions: ProductCenterDictionaryOption[];
    supplyGroupOptions: ProductCenterDictionaryOption[];
    financeCategoryOptions: ProductCenterDictionaryOption[];
  } | null;
  canCreate: boolean;
  canManage: boolean;
  canViewSupplyIdentity: boolean;
  canViewSupplyGroup: boolean;
  canViewFinanceCategory: boolean;
  canAccessSupplierTab: boolean;
  manageSuppliersHref: string;
  initialCreateOpen: boolean;
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  createWithInitialSkuAction: (
    formData: FormData,
  ) => Promise<ProductActionResult>;
  toggleAction: (formData: FormData) => Promise<ProductActionResult>;
  moveToRecycleBinAction: (formData: FormData) => Promise<ProductActionResult>;
  upsertProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  moveProductSkuToRecycleBinAction: (
    formData: FormData,
  ) => Promise<ProductActionResult>;
  createInlineSupplierAction: (
    formData: FormData,
  ) => Promise<InlineSupplierResult>;
}>) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [drawerProduct, setDrawerProduct] = useState<ProductItem | null>(null);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(
    initialCreateOpen ? "create" : null,
  );
  const [initialDrawerPendingClose, setInitialDrawerPendingClose] =
    useState(initialCreateOpen);
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters(filters));
  const [pendingAction, startActionTransition] = useTransition();

  const dictionaryOptions = dictionaries ?? EMPTY_DICTIONARIES;
  const workspaceHref = buildProductCenterHref(filters);
  const detailHref = detailProduct
    ? buildProductCenterHref(filters, {
        detail: detailProduct.id,
        detailSku: detailSkuId,
      })
    : workspaceHref;
  const pageStart =
    pagination.totalCount > 0
      ? (pagination.page - 1) * pagination.pageSize + 1
      : 0;
  const pageEnd =
    pagination.totalCount > 0
      ? Math.min(pagination.page * pagination.pageSize, pagination.totalCount)
      : 0;
  const activeFilters = hasAnyFilters(filters);
  const activePreset =
    PRODUCT_CENTER_SYSTEM_VIEWS.find(
      (preset) => preset.id === filters.preset,
    ) ?? null;
  const maxReferenceCount = items.reduce(
    (max, item) => Math.max(max, item._count.salesOrderItems),
    0,
  );
  const visibleStatusLabel =
    filters.status === "enabled"
      ? "仅启用"
      : filters.status === "disabled"
        ? "仅停用"
        : "全部商品";

  function openCreateDrawer() {
    setDrawerProduct(null);
    setDrawerMode("create");
  }

  function openDetail(productId: string) {
    router.push(
      buildProductCenterHref(filters, { detail: productId, detailSku: "" }),
    );
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDrawerProduct(null);

    if (initialDrawerPendingClose) {
      setInitialDrawerPendingClose(false);
      router.replace(workspaceHref);
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
    formData.set("redirectTo", workspaceHref);

    startActionTransition(async () => {
      const result = await toggleAction(formData);
      setNotice(result);

      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  function toggleProductExpansion(productId: string) {
    setExpandedProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  return (
    <div className="space-y-4">
      <form
        method="get"
        className={cn(productControlSurfaceClassName, "space-y-3")}
      >
        <input type="hidden" name="preset" value={filters.preset} />
        <input type="hidden" name="savedViewId" value={filters.savedViewId} />

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索商品</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-sidebar-muted)]" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder={
                canViewSupplyIdentity
                  ? "输入商品名、编码、品牌、系列、SKU 或供应商"
                  : "输入商品名、编码、品牌、系列或 SKU"
              }
              className="crm-input min-h-[2.85rem] pl-10"
            />
          </label>

          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              canViewSupplyIdentity ? "xl:w-[25rem]" : "xl:w-[11.5rem]",
            )}
          >
            <label className="space-y-1.5">
              <span className="sr-only">商品状态</span>
              <select
                name="status"
                defaultValue={filters.status}
                className="crm-select min-h-[2.85rem]"
              >
                <option value="">显示：全部状态</option>
                <option value="enabled">显示：仅启用</option>
                <option value="disabled">显示：仅停用</option>
              </select>
            </label>

            {canViewSupplyIdentity ? (
              <label className="space-y-1.5">
                <span className="sr-only">供应商</span>
                <select
                  name="supplierId"
                  defaultValue={filters.supplierId}
                  className="crm-select min-h-[2.85rem]"
                >
                  <option value="">供应商：全部</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} ({supplier.code})
                      {supplier.enabled ? "" : " / 停用"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:ml-auto xl:justify-end">
            <button
              type="button"
              onClick={() => setAdvancedOpen((current) => !current)}
              className="crm-button crm-button-secondary min-h-[2.85rem] gap-2 px-3.5"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {advancedOpen ? "收起筛选" : "筛选"}
            </button>
            <button
              type="submit"
              className="crm-button crm-button-primary min-h-[2.85rem] px-4"
            >
              查看结果
            </button>
            <Link
              href={buildProductCenterHref(PRODUCT_CENTER_EMPTY_FILTERS)}
              className="crm-button crm-button-secondary min-h-[2.85rem] px-3.5"
            >
              清空
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-soft)] pt-3">
          <span className="text-[11px] font-medium tracking-[0.08em] text-[var(--color-sidebar-muted)]">
            快速查看
          </span>
          {PRODUCT_CENTER_SYSTEM_VIEWS.map((preset) => {
            const active = filters.preset === preset.id;
            return (
              <Link
                key={preset.id}
                href={buildProductCenterHref(filters, {
                  preset: active ? "" : preset.id,
                  savedViewId: "",
                  page: 1,
                  detail: "",
                  detailSku: "",
                })}
                title={preset.description}
                className={cn(
                  productMetaPillClassName,
                  active
                    ? "border-[rgba(79,125,247,0.14)] bg-[rgba(79,125,247,0.08)] text-[var(--color-accent-strong)]"
                    : "",
                )}
              >
                {preset.label}
              </Link>
            );
          })}
        </div>

        {advancedOpen ? (
          <div className="grid gap-3 rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-3.5 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="crm-label">品牌</span>
              <input
                name="brandName"
                defaultValue={filters.brandName}
                className="crm-input"
                placeholder="按品牌模糊筛选"
              />
            </label>

            <label className="space-y-2">
              <span className="crm-label">系列</span>
              <input
                name="seriesName"
                defaultValue={filters.seriesName}
                className="crm-input"
                placeholder="按系列模糊筛选"
              />
            </label>

            <label className="space-y-2">
              <span className="crm-label">类目</span>
              <select
                name="categoryCode"
                defaultValue={filters.categoryCode}
                className="crm-select"
              >
                <option value="">全部类目</option>
                {dictionaryOptions.categoryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                    {option.isActive ? "" : " / 停用"}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="crm-label">主销售场景</span>
              <select
                name="primarySalesSceneCode"
                defaultValue={filters.primarySalesSceneCode}
                className="crm-select"
              >
                <option value="">全部场景</option>
                {dictionaryOptions.primarySalesSceneOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                    {option.isActive ? "" : " / 停用"}
                  </option>
                ))}
              </select>
            </label>

            {canViewSupplyGroup ? (
              <label className="space-y-2">
                <span className="crm-label">供货归类</span>
                <select
                  name="supplyGroupCode"
                  defaultValue={filters.supplyGroupCode}
                  className="crm-select"
                >
                  <option value="">全部供货归类</option>
                  {dictionaryOptions.supplyGroupOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                      {option.isActive ? "" : " / 停用"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {canViewFinanceCategory ? (
              <label className="space-y-2">
                <span className="crm-label">财务归类</span>
                <select
                  name="financeCategoryCode"
                  defaultValue={filters.financeCategoryCode}
                  className="crm-select"
                >
                  <option value="">全部财务归类</option>
                  {dictionaryOptions.financeCategoryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                      {option.isActive ? "" : " / 停用"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
      </form>

      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <div className={productTableShellClassName}>
        <div className="flex flex-col gap-3 border-b border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="crm-eyebrow">Product Catalog</p>
              {activePreset ? (
                <span className={productMetaPillClassName}>
                  {activePreset.label}
                </span>
              ) : null}
            </div>
            <h3 className="text-[1.02rem] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
              商品列表
            </h3>
            <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
              本页 {pageStart}-{pageEnd} · 共 {pagination.totalCount} 个商品
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={productMetaPillClassName}>
              显示 {visibleStatusLabel}
            </span>
            <span className={productMetaPillClassName}>排序 最新维护</span>
            <span className={productMetaPillClassName}>
              启用 {summary.enabledCount}
            </span>
            <span className={productMetaPillClassName}>
              SKU {summary.skuCount}
            </span>
            <span className={productMetaPillClassName}>
              引用 {summary.salesOrderItemCount}
            </span>
          </div>
        </div>

        {items.length > 0 ? (
          <div className="space-y-4 p-4">
            <div className="overflow-x-auto">
              <table className="crm-table min-w-[980px]">
                <thead>
                  <tr>
                    <th className="w-14">展开</th>
                    <th>商品名称</th>
                    <th>价格</th>
                    <th>规格</th>
                    <th>经营信息</th>
                    <th>引用情况</th>
                    <th>上架状态</th>
                    <th className="text-right">动作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isExpanded = expandedProductIds.includes(item.id);
                    const brandSeriesLine = joinReadableParts([
                      item.brandName,
                      item.seriesName,
                    ]);
                    const categoryLabel =
                      resolveDictionaryLabel(
                        dictionaryOptions.categoryOptions,
                        item.categoryCode,
                      ) || "";
                    const sceneLabel =
                      resolveDictionaryLabel(
                        dictionaryOptions.primarySalesSceneOptions,
                        item.primarySalesSceneCode,
                      ) || "";
                    const supplyGroupLabel =
                      resolveDictionaryLabel(
                        dictionaryOptions.supplyGroupOptions,
                        item.supplyGroupCode,
                      ) || "";
                    const financeCategoryLabel =
                      resolveDictionaryLabel(
                        dictionaryOptions.financeCategoryOptions,
                        item.financeCategoryCode,
                      ) || "";
                    const businessLine = joinReadableParts([
                      canViewSupplyIdentity ? item.supplier?.name : null,
                      canViewSupplyGroup ? supplyGroupLabel : null,
                      canViewFinanceCategory ? financeCategoryLabel : null,
                    ]);
                    const classificationLine = joinReadableParts([
                      categoryLabel,
                      sceneLabel,
                    ]);
                    const referenceFill = buildReferenceFillPercentage(
                      item._count.salesOrderItems,
                      maxReferenceCount,
                    );
                    const referenceSignal = getReferenceSignal(
                      item._count.salesOrderItems,
                      maxReferenceCount,
                    );

                    return (
                      <Fragment key={item.id}>
                        <tr key={item.id}>
                          <td>
                            <button
                              type="button"
                              onClick={() => toggleProductExpansion(item.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color] hover:border-[rgba(122,154,255,0.16)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]"
                              aria-label={isExpanded ? "收起 SKU" : "展开 SKU"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>

                          <td>
                            <div className="flex min-w-0 items-start gap-3">
                              <ProductMainImage
                                mainImagePath={item.mainImagePath}
                                name={item.name}
                                brandName={item.brandName}
                                size="list"
                                className="shrink-0"
                              />
                              <div className="min-w-0 space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => openDetail(item.id)}
                                  className="block min-w-0 truncate text-left text-[0.98rem] font-semibold tracking-[-0.02em] text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
                                >
                                  {item.name}
                                </button>
                                <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                  ID: {item.code} · 更新{" "}
                                  {formatDateTime(item.updatedAt)}
                                </p>
                                {brandSeriesLine ? (
                                  <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                    {brandSeriesLine}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="space-y-1.5">
                              <p className="text-[0.95rem] font-semibold text-[var(--foreground)]">
                                {buildProductPriceCoverageLabel(item.skus)}
                              </p>
                              <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                当前主档的默认销售价格范围
                              </p>
                            </div>
                          </td>

                          <td>
                            <div className="space-y-1.5">
                              <p className="text-[13px] font-medium text-[var(--foreground)]">
                                SKU {item._count.skus}
                              </p>
                              <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                {buildSkuPreviewLabel(item.skus)}
                              </p>
                            </div>
                          </td>

                          <td>
                            <div className="space-y-1.5">
                              {businessLine ? (
                                <p className="text-[13px] font-medium text-[var(--foreground)]">
                                  {businessLine}
                                </p>
                              ) : (
                                <p className="text-[13px] font-medium text-[var(--foreground)]">
                                  商品主档
                                </p>
                              )}
                              {classificationLine ? (
                                <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                  {classificationLine}
                                </p>
                              ) : (
                                <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                  未补充主档归类
                                </p>
                              )}
                            </div>
                          </td>

                          <td>
                            <div className="w-[10rem] space-y-2">
                              <div className="flex items-center justify-between gap-2 text-[12px]">
                                <span
                                  className={cn(
                                    "font-medium",
                                    referenceSignal.textClassName,
                                  )}
                                >
                                  {referenceSignal.label}
                                </span>
                                <span className="text-[var(--color-sidebar-muted)]">
                                  已引用 {item._count.salesOrderItems}
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-shell-active)]">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-[width] duration-300",
                                    referenceSignal.barClassName,
                                  )}
                                  style={{ width: `${referenceFill}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          <td>
                            <div className="flex min-w-[6.5rem] flex-col items-start gap-2">
                              <button
                                type="button"
                                onClick={() => handleToggle(item)}
                                disabled={!canManage || pendingAction}
                                aria-label={
                                  item.enabled ? "停用商品" : "启用商品"
                                }
                                className={cn(
                                  "relative inline-flex h-7 w-11 items-center rounded-full border p-[3px] transition-[border-color,background-color]",
                                  item.enabled
                                    ? "border-[rgba(79,125,247,0.18)] bg-[rgba(79,125,247,0.12)]"
                                    : "border-[var(--color-border-soft)] bg-[var(--color-shell-active)]",
                                  (!canManage || pendingAction) &&
                                    "cursor-not-allowed opacity-70",
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(18,24,31,0.14)] transition-transform duration-200",
                                    item.enabled
                                      ? "translate-x-4"
                                      : "translate-x-0",
                                  )}
                                />
                              </button>
                              <p className="text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                                {item.enabled ? "已上架" : "已停用"}
                              </p>
                            </div>
                          </td>

                          <td>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => openDetail(item.id)}
                                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                              >
                                详情
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExpanded ? (
                          <tr>
                            <td colSpan={8} className="!p-0">
                              <div className="border-t border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-4">
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
                                  <div className="space-y-3">
                                    <div className="space-y-1.5">
                                      <p className="crm-eyebrow">商品备注</p>
                                      <p className="text-sm leading-6 text-[var(--foreground)]">
                                        {item.description ||
                                          "当前还没有商品说明，可在详情中继续补充。"}
                                      </p>
                                    </div>
                                    {item.internalSupplyRemark &&
                                    (canViewSupplyIdentity ||
                                      canViewSupplyGroup) ? (
                                      <div className="space-y-1.5">
                                        <p className="crm-eyebrow">供货备注</p>
                                        <p className="text-sm leading-6 text-[var(--foreground)]">
                                          {item.internalSupplyRemark}
                                        </p>
                                      </div>
                                    ) : null}
                                    <div
                                      className={productCompactMetaClassName}
                                    >
                                      <span>
                                        商品创建{" "}
                                        {formatDateTime(item.createdAt)}
                                      </span>
                                      <span>
                                        最近更新{" "}
                                        {formatDateTime(item.updatedAt)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="space-y-3">
                                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                      <div>
                                        <p className="crm-eyebrow">销售规格</p>
                                        <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                          SKU {item.skus.length} ·{" "}
                                          {buildProductPriceCoverageLabel(
                                            item.skus,
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    {item.skus.length > 0 ? (
                                      <div className="space-y-2.5">
                                        {item.skus.map((sku) => {
                                          const skuDetailHref =
                                            buildProductCenterHref(filters, {
                                              detail: item.id,
                                              detailSku: sku.id,
                                            });

                                          return (
                                            <div
                                              key={sku.id}
                                              className="grid gap-3 rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3.5 py-3 shadow-[var(--color-shell-shadow-xs)] md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                                            >
                                              <div className="min-w-0 space-y-2">
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    router.push(skuDetailHref)
                                                  }
                                                  className="min-w-0 truncate text-left text-sm font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
                                                >
                                                  {sku.skuName}
                                                </button>
                                                <div
                                                  className={
                                                    productCompactMetaClassName
                                                  }
                                                >
                                                  <span>
                                                    默认售价{" "}
                                                    {formatCurrency(
                                                      sku.defaultUnitPrice,
                                                    )}
                                                  </span>
                                                  <span>
                                                    订单引用{" "}
                                                    {sku._count.salesOrderItems}
                                                  </span>
                                                  <span>
                                                    更新{" "}
                                                    {formatDateTime(
                                                      sku.updatedAt,
                                                    )}
                                                  </span>
                                                </div>
                                              </div>

                                              <div className="flex flex-col items-start gap-2 md:items-end">
                                                <MasterDataStatusBadge
                                                  isActive={sku.enabled}
                                                />
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    router.push(skuDetailHref)
                                                  }
                                                  className={
                                                    productQuietActionClassName
                                                  }
                                                >
                                                  查看规格
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="rounded-[0.92rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3.5 py-3 text-sm leading-6 text-[var(--color-sidebar-muted)]">
                                        当前商品下还没有可见
                                        SKU。进入详情抽屉后继续补充即可。
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              summary={`本页显示 ${pageStart} - ${pageEnd} 条商品，共 ${pagination.totalCount} 条`}
              buildHref={(pageNumber) =>
                buildProductCenterHref(filters, {
                  page: pageNumber,
                  detail: "",
                  detailSku: "",
                })
              }
            />
          </div>
        ) : (
          <div className="p-4 md:p-5">
            <EmptyState
              title={
                activeFilters ? "当前筛选下没有商品" : "商品主数据还未建立"
              }
              description={
                activeFilters
                  ? "调整筛选后继续定位商品。"
                  : "先创建商品，再在右侧详情里继续补充规格。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {activeFilters ? (
                    <Link
                      href={buildProductCenterHref(
                        PRODUCT_CENTER_EMPTY_FILTERS,
                      )}
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
                  {!activeFilters && canAccessSupplierTab ? (
                    <Link
                      href={manageSuppliersHref}
                      className="crm-button crm-button-secondary"
                    >
                      查看供应商
                    </Link>
                  ) : null}
                </div>
              }
            />
          </div>
        )}
      </div>

      <ProductFormDrawer
        key={
          drawerMode === "edit" && drawerProduct
            ? `product-form:${drawerProduct.id}`
            : `product-form:${drawerMode ?? "closed"}`
        }
        open={drawerMode !== null}
        mode={drawerMode ?? "create"}
        product={
          drawerMode === "edit" && drawerProduct
            ? {
                id: drawerProduct.id,
                supplierId: drawerProduct.supplier?.id ?? "",
                code: drawerProduct.code,
                name: drawerProduct.name,
                mainImagePath: drawerProduct.mainImagePath,
                brandName: drawerProduct.brandName,
                seriesName: drawerProduct.seriesName,
                categoryCode: drawerProduct.categoryCode,
                primarySalesSceneCode: drawerProduct.primarySalesSceneCode,
                supplyGroupCode: drawerProduct.supplyGroupCode,
                financeCategoryCode: drawerProduct.financeCategoryCode,
                description: drawerProduct.description,
                internalSupplyRemark: drawerProduct.internalSupplyRemark,
              }
            : null
        }
        suppliers={suppliers}
        dictionaries={dictionaryOptions}
        redirectTo={workspaceHref}
        canQuickCreateSupplier={canAccessSupplierTab}
        upsertAction={upsertAction}
        createWithInitialSkuAction={createWithInitialSkuAction}
        createInlineSupplierAction={createInlineSupplierAction}
        onClose={closeDrawer}
        onSaved={handleSaved}
      />

      <ProductWorkspaceDetailDrawer
        key={
          detailProduct
            ? `${detailProduct.id}:${detailSkuId || "product"}`
            : "empty-product-detail"
        }
        open={detailProduct !== null}
        product={detailProduct}
        focusSkuId={detailSkuId}
        suppliers={suppliers}
        dictionaries={dictionaryOptions}
        currentHref={detailHref}
        buildSkuDetailHref={(skuId) =>
          buildProductCenterHref(filters, {
            detail: detailProduct?.id ?? "",
            detailSku: skuId,
          })
        }
        canManage={canManage}
        canQuickCreateSupplier={canAccessSupplierTab}
        canViewSupplyIdentity={canViewSupplyIdentity}
        onClose={() => router.replace(workspaceHref)}
        upsertProductAction={upsertAction}
        toggleProductAction={toggleAction}
        moveProductToRecycleBinAction={moveToRecycleBinAction}
        upsertProductSkuAction={upsertProductSkuAction}
        toggleProductSkuAction={toggleProductSkuAction}
        moveProductSkuToRecycleBinAction={moveProductSkuToRecycleBinAction}
        createInlineSupplierAction={createInlineSupplierAction}
      />
    </div>
  );
}
