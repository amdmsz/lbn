"use client";

import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductMainImage } from "@/components/products/product-main-image";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
import { ProductWorkspaceDetailDrawer } from "@/components/products/product-workspace-detail-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
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

type ProductSkuItem = {
  id: string;
  skuName: string;
  defaultUnitPrice: DecimalLike;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: DecimalLike;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  product: {
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
    enabled: boolean;
    supplier: SupplierOption | null;
  };
  _count: {
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

const skuQuietActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-transparent px-2.5 py-2 text-sm font-medium text-muted-foreground transition-[border-color,background-color,color] hover:border-border/60 hover:bg-muted/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50";

const skuPrimaryButtonClassName =
  "inline-flex min-h-0 items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const skuSecondaryButtonClassName =
  "inline-flex min-h-0 items-center justify-center rounded-lg border border-border/60 bg-card text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60";

const skuControlSurfaceClassName =
  "rounded-2xl border border-border/50 bg-card px-3.5 py-3.5 shadow-sm";

const skuMetricPillClassName =
  "rounded-full border border-border/60 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground";

const skuSpatialTableClassName =
  "w-full min-w-[980px] border-separate border-spacing-0 text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/30 [&_td]:border-b [&_td]:border-border/40 [&_td]:px-4 [&_td]:py-4 [&_td]:align-top [&_th]:border-b [&_th]:border-border/40 [&_th]:bg-transparent [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground [&_thead]:bg-transparent";

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

export function ProductSkusSection({
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
  upsertProductAction,
  toggleProductAction,
  moveProductToRecycleBinAction,
  upsertProductSkuAction,
  toggleProductSkuAction,
  moveProductSkuToRecycleBinAction,
  createInlineSupplierAction,
}: Readonly<{
  items: ProductSkuItem[];
  suppliers: SupplierOption[];
  filters: ProductCenterFilters;
  summary: {
    totalCount: number;
    enabledCount: number;
    productCount: number;
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
  upsertProductAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductAction: (formData: FormData) => Promise<ProductActionResult>;
  moveProductToRecycleBinAction: (
    formData: FormData,
  ) => Promise<ProductActionResult>;
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
  const [recycleTarget, setRecycleTarget] = useState<ProductSkuItem | null>(
    null,
  );
  const [recycleReason, setRecycleReason] =
    useState<MasterDataRecycleReasonCode>("mistaken_creation");
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvancedFilters(filters));
  const [pendingAction, startActionTransition] = useTransition();

  const dictionaryOptions = dictionaries ?? EMPTY_DICTIONARIES;
  const workspaceHref = buildProductCenterHref(filters, { tab: "skus" });
  const detailHref = detailProduct
    ? buildProductCenterHref(filters, {
        tab: "skus",
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
  const visibleStatusLabel =
    filters.status === "enabled"
      ? "仅启用"
      : filters.status === "disabled"
        ? "仅停用"
        : "全部状态";

  function openDetail(item: ProductSkuItem) {
    router.push(
      buildProductCenterHref(filters, {
        tab: "skus",
        detail: item.product.id,
        detailSku: item.id,
      }),
    );
  }

  function handleToggle(item: ProductSkuItem) {
    const formData = new FormData();
    formData.set("id", item.id);
    formData.set("redirectTo", workspaceHref);

    startActionTransition(async () => {
      const result = await toggleProductSkuAction(formData);
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

  function handleRecycleConfirm() {
    if (!recycleTarget) {
      return;
    }

    const formData = new FormData();
    formData.set("id", recycleTarget.id);
    formData.set("redirectTo", workspaceHref);
    formData.set("reasonCode", recycleReason);

    startActionTransition(async () => {
      const result = await moveProductSkuToRecycleBinAction(formData);
      setNotice(result);
      closeRecycleDialog();

      if (
        result.recycleStatus === "created" ||
        result.recycleStatus === "already_in_recycle_bin"
      ) {
        router.refresh();
      }

      if (result.recycleStatus === "blocked") {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <form
        method="get"
        className={cn(skuControlSurfaceClassName, "space-y-3")}
      >
        <input type="hidden" name="tab" value="skus" />

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索 SKU</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder={
                canViewSupplyIdentity
                  ? "输入规格名、商品名、商品编码、品牌、系列或供应商"
                  : "输入规格名、商品名、商品编码、品牌或系列"
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
              <span className="sr-only">SKU 状态</span>
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
              className={cn(
                skuSecondaryButtonClassName,
                "min-h-[2.85rem] gap-2 px-3.5",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {advancedOpen ? "收起筛选" : "筛选"}
            </button>
            <button
              type="submit"
              className={cn(
                skuPrimaryButtonClassName,
                "min-h-[2.85rem] px-4",
              )}
            >
              查看结果
            </button>
            <Link
              href={buildProductCenterHref(PRODUCT_CENTER_EMPTY_FILTERS, {
                tab: "skus",
              })}
              className={cn(
                skuSecondaryButtonClassName,
                "min-h-[2.85rem] px-3.5",
              )}
            >
              清空
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <span className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
            当前范围
          </span>
          <span className={skuMetricPillClassName}>{visibleStatusLabel}</span>
          <span className={skuMetricPillClassName}>
            SKU {summary.totalCount}
          </span>
          <span className={skuMetricPillClassName}>
            商品 {summary.productCount}
          </span>
          <span className={skuMetricPillClassName}>
            启用 {summary.enabledCount}
          </span>
          <span className={skuMetricPillClassName}>
            引用 {summary.salesOrderItemCount}
          </span>
          {activeFilters ? (
            <span className={skuMetricPillClassName}>已应用筛选</span>
          ) : null}
        </div>

        {advancedOpen ? (
          <div className="grid gap-3 rounded-xl border border-border/50 bg-background/50 p-3.5 md:grid-cols-2 xl:grid-cols-3">
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

      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        {items.length > 0 ? (
          <div className="space-y-0 overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border/50 bg-card px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="crm-detail-label text-[11px]">SKU 工作台</p>
                <h3 className="text-[0.96rem] font-semibold text-foreground">
                  规格与商品母档的轻维护视图
                </h3>
              </div>
              <p className="text-[12px] text-muted-foreground">
                本页显示 {pageStart} - {pageEnd} 条，共 {pagination.totalCount}{" "}
                条
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className={skuSpatialTableClassName}>
                <thead>
                  <tr>
                    <th>规格</th>
                    <th>所属商品</th>
                    <th>默认售价</th>
                    <th>经营资料</th>
                    <th>状态</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const productIdentityLine = joinReadableParts([
                      item.product.brandName,
                      item.product.seriesName,
                      resolveDictionaryLabel(
                        dictionaryOptions.categoryOptions,
                        item.product.categoryCode,
                      ),
                    ]);
                    const businessLine = joinReadableParts([
                      resolveDictionaryLabel(
                        dictionaryOptions.primarySalesSceneOptions,
                        item.product.primarySalesSceneCode,
                      ),
                      canViewSupplyGroup
                        ? resolveDictionaryLabel(
                            dictionaryOptions.supplyGroupOptions,
                            item.product.supplyGroupCode,
                          )
                        : null,
                      canViewFinanceCategory
                        ? resolveDictionaryLabel(
                            dictionaryOptions.financeCategoryOptions,
                            item.product.financeCategoryCode,
                          )
                        : null,
                    ]);
                    const executionLine = joinReadableParts([
                      item.codSupported ? "COD" : null,
                      item.insuranceSupported
                        ? `保价 ${formatCurrency(item.defaultInsuranceAmount)}`
                        : null,
                    ]);

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="min-w-0 space-y-2">
                            <button
                              type="button"
                              onClick={() => openDetail(item)}
                              className="truncate text-left text-sm font-semibold text-foreground transition-colors hover:text-primary"
                            >
                              {item.skuName}
                            </button>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-5 text-muted-foreground">
                              <span>
                                订单引用 {item._count.salesOrderItems}
                              </span>
                              <span>创建 {formatDateTime(item.createdAt)}</span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="flex min-w-0 gap-3">
                            <ProductMainImage
                              mainImagePath={item.product.mainImagePath}
                              name={item.product.name}
                              brandName={item.product.brandName}
                              size="list"
                              className="shrink-0"
                            />
                            <div className="min-w-0 space-y-1.5">
                              <button
                                type="button"
                                onClick={() => openDetail(item)}
                                className="block min-w-0 truncate text-left text-sm font-semibold text-foreground transition-colors hover:text-primary"
                              >
                                {item.product.name}
                              </button>
                              <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] leading-5 text-muted-foreground">
                                <span>{item.product.code}</span>
                                {productIdentityLine ? (
                                  <span>{productIdentityLine}</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="space-y-1.5">
                            <p className="text-[0.95rem] font-semibold text-foreground">
                              {formatCurrency(item.defaultUnitPrice)}
                            </p>
                            <p className="text-[12px] leading-5 text-muted-foreground">
                              当前规格默认销售价
                            </p>
                          </div>
                        </td>

                        <td>
                          <div className="space-y-1.5 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {canViewSupplyIdentity
                                ? item.product.supplier?.name || "未绑定供应"
                                : businessLine || "轻维护规格"}
                            </p>
                            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] leading-5 text-muted-foreground">
                              {canViewSupplyIdentity &&
                              item.product.supplier ? (
                                <span>
                                  {item.product.supplier.code}
                                  {item.product.supplier.enabled
                                    ? ""
                                    : " / 停用"}
                                </span>
                              ) : null}
                              {!canViewSupplyIdentity && businessLine ? (
                                <span>{businessLine}</span>
                              ) : null}
                              {canViewSupplyIdentity && businessLine ? (
                                <span>{businessLine}</span>
                              ) : null}
                              {executionLine ? (
                                <span>{executionLine}</span>
                              ) : null}
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="flex min-w-[7rem] flex-col items-start gap-2">
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => handleToggle(item)}
                                disabled={pendingAction}
                                aria-label={
                                  item.enabled ? "停用规格" : "启用规格"
                                }
                                className={cn(
                                  "relative inline-flex h-7 w-11 items-center rounded-full border p-[3px] transition-[border-color,background-color]",
                                  item.enabled
                                    ? "border-primary/30 bg-primary/15"
                                    : "border-border/60 bg-muted",
                                  pendingAction &&
                                    "cursor-not-allowed opacity-70",
                                )}
                              >
                                <span
                                  className={cn(
                                    "h-5 w-5 rounded-full bg-card shadow-[0_2px_8px_rgba(18,24,31,0.14)] transition-transform duration-200",
                                    item.enabled
                                      ? "translate-x-4"
                                      : "translate-x-0",
                                  )}
                                />
                              </button>
                            ) : (
                              <MasterDataStatusBadge isActive={item.enabled} />
                            )}
                            <p className="text-[11px] font-medium text-muted-foreground">
                              {item.enabled ? "已上架" : "已停用"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              更新 {formatDateTime(item.updatedAt)}
                            </p>
                          </div>
                        </td>

                        <td>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openDetail(item)}
                              className={cn(
                                skuSecondaryButtonClassName,
                                "px-3 py-2",
                              )}
                            >
                              详情
                            </button>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => setRecycleTarget(item)}
                                className={skuQuietActionClassName}
                              >
                                {item.recycleGuard.canMoveToRecycleBin
                                  ? "回收"
                                  : "查看引用"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              summary={`本页显示 ${pageStart} - ${pageEnd} 条 SKU，共 ${pagination.totalCount} 条`}
              buildHref={(pageNumber) =>
                buildProductCenterHref(filters, {
                  tab: "skus",
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
                activeFilters ? "当前筛选下没有 SKU" : "还没有可经营的 SKU"
              }
              description={
                activeFilters
                  ? "调整筛选后继续定位 SKU。"
                  : "先创建商品，再在详情里继续补充规格。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {activeFilters ? (
                    <Link
                      href={buildProductCenterHref(
                        PRODUCT_CENTER_EMPTY_FILTERS,
                        { tab: "skus" },
                      )}
                      className={cn(skuSecondaryButtonClassName, "px-3 py-2")}
                    >
                      清空筛选
                    </Link>
                  ) : null}
                  {canCreate ? (
                    <Link
                      href={buildProductCenterHref(filters, {
                        createProduct: "1",
                      })}
                      className={cn(skuPrimaryButtonClassName, "px-3 py-2")}
                    >
                      新建商品
                    </Link>
                  ) : null}
                  {!activeFilters && canAccessSupplierTab ? (
                    <Link
                      href={manageSuppliersHref}
                      className={cn(skuSecondaryButtonClassName, "px-3 py-2")}
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

      <ProductWorkspaceDetailDrawer
        key={
          detailProduct
            ? `${detailProduct.id}:${detailSkuId || "product"}`
            : "empty-product-sku-detail"
        }
        open={detailProduct !== null}
        product={detailProduct}
        focusSkuId={detailSkuId}
        suppliers={suppliers}
        dictionaries={dictionaryOptions}
        currentHref={detailHref}
        buildSkuDetailHref={(skuId) =>
          buildProductCenterHref(filters, {
            tab: "skus",
            detail: detailProduct?.id ?? "",
            detailSku: skuId,
          })
        }
        canManage={canManage}
        canQuickCreateSupplier={canAccessSupplierTab}
        canViewSupplyIdentity={canViewSupplyIdentity}
        onClose={() => router.replace(workspaceHref)}
        upsertProductAction={upsertProductAction}
        toggleProductAction={toggleProductAction}
        moveProductToRecycleBinAction={moveProductToRecycleBinAction}
        upsertProductSkuAction={upsertProductSkuAction}
        toggleProductSkuAction={toggleProductSkuAction}
        moveProductSkuToRecycleBinAction={moveProductSkuToRecycleBinAction}
        createInlineSupplierAction={createInlineSupplierAction}
      />

      <MasterDataRecycleDialog
        open={recycleTarget !== null}
        objectName={recycleTarget?.skuName ?? ""}
        objectTypeLabel="SKU"
        secondaryLabel={recycleTarget?.skuName ?? ""}
        domainLabel="商品中心 / SKU"
        updatedAt={recycleTarget?.updatedAt ?? new Date()}
        guard={
          recycleTarget?.recycleGuard ?? {
            canMoveToRecycleBin: false,
            fallbackActionLabel: "改为停用 SKU",
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
