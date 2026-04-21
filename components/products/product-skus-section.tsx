"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductMainImage } from "@/components/products/product-main-image";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
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
  upsertProductAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductAction: (formData: FormData) => Promise<ProductActionResult>;
  moveProductToRecycleBinAction: (formData: FormData) => Promise<ProductActionResult>;
  upsertProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  moveProductSkuToRecycleBinAction: (formData: FormData) => Promise<ProductActionResult>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  const router = useRouter();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [recycleTarget, setRecycleTarget] = useState<ProductSkuItem | null>(null);
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
    pagination.totalCount > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0;
  const pageEnd =
    pagination.totalCount > 0
      ? Math.min(pagination.page * pagination.pageSize, pagination.totalCount)
      : 0;
  const activeFilters = hasAnyFilters(filters);

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

      if (result.recycleStatus === "created" || result.recycleStatus === "already_in_recycle_bin") {
        router.refresh();
      }

      if (result.recycleStatus === "blocked") {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <SectionCard
        density="compact"
        title="筛选"
        description="SKU 视图只保留当前仍有效的经营字段，用来跨商品扫描销售规格、价格和执行能力。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`结果 ${summary.totalCount}`} variant="neutral" />
            <StatusBadge label={`启用 ${summary.enabledCount}`} variant="neutral" />
          </div>
        }
      >
        <div className="space-y-3">
          <form method="get" className="space-y-3">
            <input type="hidden" name="tab" value="skus" />

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_12rem_12rem_auto]">
              <label className="min-w-0 space-y-2">
                <span className="crm-label">搜索</span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder={
                    canViewSupplyIdentity
                      ? "商品名、商品编码、SKU 名、品牌、系列或供应商"
                      : "商品名、商品编码、SKU 名、品牌或系列"
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
                  href={buildProductCenterHref(PRODUCT_CENTER_EMPTY_FILTERS, { tab: "skus" })}
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
        title="SKU 目录"
        description="每一行只表达一个销售规格，不再拼接已删除的规格参数字段。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`商品 ${summary.productCount}`} variant="neutral" />
            <StatusBadge label={`订单引用 ${summary.salesOrderItemCount}`} variant="neutral" />
          </div>
        }
        contentClassName="p-0"
      >
        {items.length > 0 ? (
          <>
            <div className="crm-table-shell rounded-none border-0 shadow-none">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>所属商品</th>
                    {canViewSupplyIdentity ? <th>执行供应</th> : null}
                    <th>价格 / 履约</th>
                    <th>引用 / 状态</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const productSummary = joinReadableParts([
                      item.product.brandName,
                      item.product.seriesName,
                      resolveDictionaryLabel(
                        dictionaryOptions.categoryOptions,
                        item.product.categoryCode,
                      ),
                    ]);
                    const supplyGroupLabel = resolveDictionaryLabel(
                      dictionaryOptions.supplyGroupOptions,
                      item.product.supplyGroupCode,
                    );
                    const financeCategoryLabel = resolveDictionaryLabel(
                      dictionaryOptions.financeCategoryOptions,
                      item.product.financeCategoryCode,
                    );

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="min-w-0 space-y-2">
                            <button
                              type="button"
                              onClick={() => openDetail(item)}
                              className="truncate text-left text-sm font-semibold text-black/84 transition-colors hover:text-[var(--color-accent)]"
                            >
                              {item.skuName}
                            </button>
                            <div className="flex flex-wrap gap-2 text-[12px] leading-5 text-black/48">
                              <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                                默认售价 {formatCurrency(item.defaultUnitPrice)}
                              </span>
                              {item.codSupported ? <StatusBadge label="COD" variant="info" /> : null}
                              {item.insuranceSupported ? (
                                <StatusBadge
                                  label={`保价 ${formatCurrency(item.defaultInsuranceAmount)}`}
                                  variant="warning"
                                />
                              ) : null}
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
                                className="block min-w-0 truncate text-left text-sm font-semibold text-black/84 transition-colors hover:text-[var(--color-accent)]"
                              >
                                {item.product.name}
                              </button>
                              <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] leading-5 text-black/48">
                                <span>{item.product.code}</span>
                                {productSummary ? <span>{productSummary}</span> : null}
                              </div>
                            </div>
                          </div>
                        </td>
                        {canViewSupplyIdentity ? (
                          <td>
                            {item.product.supplier ? (
                              <div className="space-y-1 text-sm text-black/72">
                                <p className="font-medium text-black/84">{item.product.supplier.name}</p>
                                <p className="text-[12px] text-black/48">
                                  {item.product.supplier.code}
                                  {item.product.supplier.enabled ? "" : " / 停用"}
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-black/40">未绑定</span>
                            )}
                          </td>
                        ) : null}
                        <td>
                          <div className="space-y-1 text-sm text-black/72">
                            <p className="font-medium text-black/84">
                              默认售价 {formatCurrency(item.defaultUnitPrice)}
                            </p>
                            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] text-black/48">
                              {canViewSupplyGroup && supplyGroupLabel ? (
                                <span>供货归类 {supplyGroupLabel}</span>
                              ) : null}
                              {canViewFinanceCategory && financeCategoryLabel ? (
                                <span>财务归类 {financeCategoryLabel}</span>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="space-y-1 text-sm text-black/72">
                            <p className="text-[12px] text-black/48">
                              订单引用 {item._count.salesOrderItems}
                            </p>
                            <p className="text-[12px] text-black/48">
                              最近更新 {formatDateTime(item.updatedAt)}
                            </p>
                            <div className="pt-1">
                              <MasterDataStatusBadge isActive={item.enabled} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openDetail(item)}
                              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                            >
                              预览
                            </button>
                            <Link
                              href={`/products/${item.product.id}`}
                              className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                            >
                              详情页
                            </Link>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => handleToggle(item)}
                                disabled={pendingAction}
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
                                {item.recycleGuard.canMoveToRecycleBin ? "回收" : "查看引用"}
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

            <div className="border-t border-black/6 px-4 py-4">
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
          </>
        ) : (
          <div className="p-4 md:p-5">
            <EmptyState
              title={activeFilters ? "当前筛选下没有 SKU" : "还没有可经营的 SKU"}
              description={
                activeFilters
                  ? "调整搜索词或高级筛选后继续定位 SKU。"
                  : "新建商品会直接录入首个 SKU，后续再在详情工作台里继续复制销售变体。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {activeFilters ? (
                    <Link
                      href={buildProductCenterHref(PRODUCT_CENTER_EMPTY_FILTERS, { tab: "skus" })}
                      className="crm-button crm-button-secondary"
                    >
                      清空筛选
                    </Link>
                  ) : null}
                  {canCreate ? (
                    <Link
                      href={buildProductCenterHref(filters, { createProduct: "1" })}
                      className="crm-button crm-button-primary"
                    >
                      新建商品
                    </Link>
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
