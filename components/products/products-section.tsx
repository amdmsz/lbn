"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductMainImage } from "@/components/products/product-main-image";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import { ProductWorkspaceDetailDrawer } from "@/components/products/product-workspace-detail-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  PRODUCT_CENTER_EMPTY_FILTERS,
  type ProductCenterDictionaryOption,
  type ProductCenterFilters,
} from "@/lib/products/metadata";
import { buildProductCenterHref } from "@/lib/products/navigation";
import type {
  MasterDataRecycleGuard,
  MasterDataRecycleReasonCode,
} from "@/lib/products/recycle-guards";

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

function buildCategoryGroups(
  items: ProductItem[],
  categoryOptions: ProductCenterDictionaryOption[],
) {
  const categorySortOrder = new Map(
    categoryOptions.map((option, index) => [option.code, index] as const),
  );
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      sortOrder: number;
      items: ProductItem[];
    }
  >();

  for (const item of items) {
    const key = item.categoryCode || "__uncategorized__";
    const label =
      item.categoryCode
        ? resolveDictionaryLabel(categoryOptions, item.categoryCode) || item.categoryCode
        : "未分类";
    const sortOrder = item.categoryCode
      ? categorySortOrder.get(item.categoryCode) ?? categoryOptions.length + 1
      : Number.MAX_SAFE_INTEGER;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        sortOrder,
        items: [],
      });
    }

    groups.get(key)?.items.push(item);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.label.localeCompare(right.label, "zh-CN");
  });
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
  dictionaries:
    | {
        categoryOptions: ProductCenterDictionaryOption[];
        primarySalesSceneOptions: ProductCenterDictionaryOption[];
        supplyGroupOptions: ProductCenterDictionaryOption[];
        financeCategoryOptions: ProductCenterDictionaryOption[];
      }
    | null;
  canCreate: boolean;
  canManage: boolean;
  canViewSupplyIdentity: boolean;
  canViewSupplyGroup: boolean;
  canViewFinanceCategory: boolean;
  canAccessSupplierTab: boolean;
  manageSuppliersHref: string;
  initialCreateOpen: boolean;
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  createWithInitialSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleAction: (formData: FormData) => Promise<ProductActionResult>;
  moveToRecycleBinAction: (formData: FormData) => Promise<ProductActionResult>;
  upsertProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  moveProductSkuToRecycleBinAction: (formData: FormData) => Promise<ProductActionResult>;
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
  const [expandedProductIds, setExpandedProductIds] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters(filters));
  const [pendingAction, startActionTransition] = useTransition();

  const dictionaryOptions = dictionaries ?? EMPTY_DICTIONARIES;
  const workspaceHref = buildProductCenterHref(filters);
  const detailHref = detailProduct
    ? buildProductCenterHref(filters, { detail: detailProduct.id, detailSku: detailSkuId })
    : workspaceHref;
  const pageStart =
    pagination.totalCount > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const pageEnd =
    pagination.totalCount > 0
      ? Math.min(pagination.page * pagination.pageSize, pagination.totalCount)
      : 0;
  const activeFilters = hasAnyFilters(filters);
  const categoryGroups = buildCategoryGroups(items, dictionaryOptions.categoryOptions);

  function openCreateDrawer() {
    setDrawerProduct(null);
    setDrawerMode("create");
  }

  function openEditDrawer(product: ProductItem) {
    setDrawerProduct(product);
    setDrawerMode("edit");
  }

  function openDetail(productId: string) {
    router.push(buildProductCenterHref(filters, { detail: productId, detailSku: "" }));
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

  function handleRecycleConfirm() {
    if (!recycleTarget) {
      return;
    }

    const formData = new FormData();
    formData.set("id", recycleTarget.id);
    formData.set("redirectTo", workspaceHref);
    formData.set("reasonCode", recycleReason);

    startActionTransition(async () => {
      const result = await moveToRecycleBinAction(formData);
      setNotice(result);
      closeRecycleDialog();

      if (result.recycleStatus === "created" || result.recycleStatus === "already_in_recycle_bin") {
        router.refresh();
      }

      if (result.recycleStatus === "blocked") {
        router.refresh();
      }
    });
  }

  function closeRecycleDialog() {
    setRecycleTarget(null);
    setRecycleReason("mistaken_creation");
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
      <SectionCard
        density="compact"
        title="筛选"
        description="先按类目、品牌和供货归类缩小范围，再进入目录查看商品和规格。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`结果 ${summary.totalCount}`} variant="neutral" />
            <StatusBadge label={`启用 ${summary.enabledCount}`} variant="neutral" />
          </div>
        }
      >
        <div className="space-y-3">
          <form method="get" className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_12rem_12rem_auto]">
              <label className="min-w-0 space-y-2">
                <span className="crm-label">搜索</span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder={
                    canViewSupplyIdentity
                      ? "商品名、商品编码、品牌、系列、SKU 或供应商"
                      : "商品名、商品编码、品牌、系列或 SKU"
                  }
                  className="crm-input"
                />
              </label>

              <label className="space-y-2">
                <span className="crm-label">状态</span>
                <select name="status" defaultValue={filters.status} className="crm-select">
                  <option value="">全部</option>
                  <option value="enabled">仅启用</option>
                  <option value="disabled">仅停用</option>
                </select>
              </label>

              {canViewSupplyIdentity ? (
                <label className="space-y-2">
                  <span className="crm-label">供应商</span>
                  <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
                    <option value="">全部供应商</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.code})
                        {supplier.enabled ? "" : " / 停用"}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="hidden xl:block" />
              )}

              <div className="flex flex-wrap items-end justify-start gap-2 xl:justify-end">
                <button type="submit" className="crm-button crm-button-primary">
                  应用筛选
                </button>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((current) => !current)}
                  className="crm-button crm-button-secondary"
                >
                  {advancedOpen ? "收起高级筛选" : "高级筛选"}
                </button>
                <Link
                  href={buildProductCenterHref(PRODUCT_CENTER_EMPTY_FILTERS)}
                  className="crm-button crm-button-secondary"
                >
                  重置
                </Link>
              </div>
            </div>

            {advancedOpen ? (
              <div className="grid gap-3 rounded-[0.95rem] border border-black/8 bg-[rgba(247,248,250,0.7)] p-3.5 md:grid-cols-2 xl:grid-cols-3">
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
        </div>
      </SectionCard>

      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <SectionCard
        density="compact"
        title="商品目录"
        description="先看分类，再展开商品下的销售规格。supplier 只保留为次级执行摘要。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`商品 ${summary.totalCount}`} variant="neutral" />
            <StatusBadge label={`SKU ${summary.skuCount}`} variant="neutral" />
            <StatusBadge label={`历史引用 ${summary.salesOrderItemCount}`} variant="neutral" />
          </div>
        }
        contentClassName="p-4"
      >
        {items.length > 0 ? (
          <div className="space-y-3.5">
            <div className="rounded-[0.95rem] border border-black/8 bg-[rgba(247,248,250,0.74)] px-4 py-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge label={`本页 ${pageStart}-${pageEnd}`} variant="neutral" />
                  <StatusBadge label={`商品 ${pagination.totalCount}`} variant="neutral" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={openCreateDrawer}
                      className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                    >
                      新建商品
                    </button>
                  ) : null}
                  {canAccessSupplierTab ? (
                    <Link
                      href={manageSuppliersHref}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                    >
                      供应商目录
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {categoryGroups.map((group) => (
                <section
                  key={group.key}
                  className="rounded-[1rem] border border-black/8 bg-[rgba(255,255,255,0.96)]"
                >
                  <div className="border-b border-black/6 px-4 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                          类目分组
                        </p>
                        <h4 className="mt-1 text-[1rem] font-semibold text-black/86">
                          {group.label}
                        </h4>
                      </div>
                      <StatusBadge label={`商品 ${group.items.length}`} variant="neutral" />
                    </div>
                  </div>

                  <div className="space-y-3 p-3.5">
                    {group.items.map((item) => {
                      const isExpanded = expandedProductIds.includes(item.id);
                      const productSummaryLine = joinReadableParts([
                        item.brandName,
                        item.seriesName,
                        item.primarySalesSceneCode
                          ? resolveDictionaryLabel(
                              dictionaryOptions.primarySalesSceneOptions,
                              item.primarySalesSceneCode,
                            )
                          : null,
                      ]);
                      const executionSummary = canViewSupplyIdentity
                        ? joinReadableParts([
                            item.supplier?.name ?? null,
                            canViewSupplyGroup
                              ? resolveDictionaryLabel(
                                  dictionaryOptions.supplyGroupOptions,
                                  item.supplyGroupCode,
                                ) || null
                              : null,
                            canViewFinanceCategory
                              ? resolveDictionaryLabel(
                                  dictionaryOptions.financeCategoryOptions,
                                  item.financeCategoryCode,
                                ) || null
                              : null,
                          ])
                        : null;

                      return (
                        <article
                          key={item.id}
                          className="overflow-hidden rounded-[1rem] border border-black/8 bg-white/98"
                        >
                          <div className="grid gap-3 px-4 py-4 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-start">
                            <button
                              type="button"
                              onClick={() => toggleProductExpansion(item.id)}
                              className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-[rgba(247,248,250,0.76)] text-black/50 transition-colors hover:bg-white hover:text-black/76"
                              aria-label={isExpanded ? "收起 SKU" : "展开 SKU"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>

                            <div className="min-w-0 space-y-3">
                              <div className="flex min-w-0 gap-3">
                                <ProductMainImage
                                  mainImagePath={item.mainImagePath}
                                  name={item.name}
                                  brandName={item.brandName}
                                  size="list"
                                  className="shrink-0"
                                />

                                <div className="min-w-0 flex-1 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {item.brandName ? (
                                      <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1 text-[11px] font-medium text-black/56">
                                        {item.brandName}
                                      </span>
                                    ) : null}
                                    <span className="rounded-full border border-black/8 px-2 py-0.5 text-black/44">
                                      {item.code}
                                    </span>
                                  </div>

                                  <div className="space-y-1.5">
                                    <button
                                      type="button"
                                      onClick={() => openDetail(item.id)}
                                      className="block min-w-0 truncate text-left text-[1.02rem] font-semibold text-black/88 transition-colors hover:text-[var(--color-accent)]"
                                    >
                                      {item.name}
                                    </button>
                                    {productSummaryLine ? (
                                      <p className="text-[13px] leading-5 text-black/58">
                                        {productSummaryLine}
                                      </p>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap gap-2 text-[12px] leading-5 text-black/54">
                                    <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                                      {buildProductPriceCoverageLabel(item.skus)}
                                    </span>
                                    <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                                      SKU {item._count.skus}
                                    </span>
                                    <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                                      引用 {item._count.salesOrderItems}
                                    </span>
                                    <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                                      更新 {formatDateTime(item.updatedAt)}
                                    </span>
                                  </div>

                                  {executionSummary ? (
                                    <p className="text-[12px] leading-5 text-black/46">
                                      {executionSummary}
                                    </p>
                                  ) : null}

                                  {item.description ? (
                                    <p className="line-clamp-2 text-[12px] leading-5 text-black/40">
                                      {item.description}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-2.5 xl:items-end">
                              <MasterDataStatusBadge isActive={item.enabled} />

                              <div className="flex flex-wrap gap-2 xl:justify-end">
                                <button
                                  type="button"
                                  onClick={() => openDetail(item.id)}
                                  className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                                >
                                  预览
                                </button>
                                {canManage ? (
                                  <button
                                    type="button"
                                    onClick={() => openEditDrawer(item)}
                                    className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                                  >
                                    编辑
                                  </button>
                                ) : null}
                                <Link
                                  href={`/products/${item.id}`}
                                  className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                                >
                                  详情页
                                </Link>
                              </div>

                              {canManage ? (
                                <div className="flex flex-wrap gap-2 xl:justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleToggle(item)}
                                    disabled={pendingAction}
                                    className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {item.enabled ? "停用" : "启用"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRecycleTarget(item)}
                                    className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                                  >
                                    {item.recycleGuard.canMoveToRecycleBin ? "回收" : "查看引用"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          {isExpanded ? (
                            <div className="border-t border-black/6 bg-[rgba(249,250,252,0.92)] px-4 py-4">
                              <div className="flex flex-col gap-3 pb-3 md:flex-row md:items-center md:justify-between">
                                <div className="space-y-1">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                                    销售规格目录
                                  </p>
                                  <p className="text-[12px] leading-5 text-black/52">
                                    一行一个销售规格，已删除的规格参数字段不再显示。
                                  </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge label={`SKU ${item.skus.length}`} variant="neutral" />
                                  <StatusBadge
                                    label={buildProductPriceCoverageLabel(item.skus)}
                                    variant="neutral"
                                  />
                                </div>
                              </div>

                              {item.skus.length > 0 ? (
                                <div className="space-y-2.5">
                                  {item.skus.map((sku) => {
                                    const skuDetailHref = buildProductCenterHref(filters, {
                                      detail: item.id,
                                      detailSku: sku.id,
                                    });

                                    return (
                                      <div
                                        key={sku.id}
                                        className="grid gap-3 rounded-[0.95rem] border border-black/8 bg-white/96 px-3.5 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                                      >
                                        <div className="min-w-0 space-y-2">
                                          <button
                                            type="button"
                                            onClick={() => router.push(skuDetailHref)}
                                            className="min-w-0 truncate text-left text-sm font-semibold text-black/84 transition-colors hover:text-[var(--color-accent)]"
                                          >
                                            {sku.skuName}
                                          </button>

                                          <div className="flex flex-wrap gap-2 text-[12px] leading-5 text-black/48">
                                            <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                                              默认售价 {formatCurrency(sku.defaultUnitPrice)}
                                            </span>
                                            {executionSummary ? (
                                              <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                                                {executionSummary}
                                              </span>
                                            ) : null}
                                          </div>

                                          <p className="text-[12px] leading-5 text-black/46">
                                            订单引用 {sku._count.salesOrderItems} / 更新{" "}
                                            {formatDateTime(sku.updatedAt)}
                                          </p>
                                        </div>

                                        <div className="flex flex-col items-start gap-2 md:items-end">
                                          <MasterDataStatusBadge isActive={sku.enabled} />
                                          <button
                                            type="button"
                                            onClick={() => router.push(skuDetailHref)}
                                            className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                                          >
                                            查看规格
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="rounded-[0.9rem] border border-dashed border-black/10 bg-black/[0.02] px-3.5 py-3 text-sm leading-6 text-black/54">
                                  当前商品下还没有可见 SKU，可以继续进入详情抽屉补充销售规格。
                                </div>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
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
          <div className="rounded-[1rem] border border-dashed border-black/10 bg-[rgba(247,248,250,0.56)] p-4 md:p-5">
            <EmptyState
              title={activeFilters ? "当前筛选下没有商品" : "商品主数据还未建立"}
              description={
                activeFilters
                  ? "调整搜索词或高级筛选后继续定位商品。"
                  : "先创建商品和首个 SKU，再在右侧详情里继续扩展规格。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {activeFilters ? (
                    <Link
                      href={buildProductCenterHref(PRODUCT_CENTER_EMPTY_FILTERS)}
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
        key={detailProduct ? `${detailProduct.id}:${detailSkuId || "product"}` : "empty-product-detail"}
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

      <MasterDataRecycleDialog
        open={recycleTarget !== null}
        objectName={recycleTarget?.name ?? ""}
        objectTypeLabel="商品"
        secondaryLabel={recycleTarget?.code ?? ""}
        domainLabel="商品主数据"
        updatedAt={recycleTarget?.updatedAt ?? new Date()}
        guard={
          recycleTarget?.recycleGuard ?? {
            canMoveToRecycleBin: false,
            fallbackActionLabel: "改为停用商品",
            blockerSummary: "",
            blockers: [],
            futureRestoreBlockers: [],
          }
        }
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        onConfirm={handleRecycleConfirm}
        pending={pendingAction}
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
