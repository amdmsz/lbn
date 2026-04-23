import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ProductMainImage } from "@/components/products/product-main-image";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import type { ProductCenterDictionaryOption } from "@/lib/products/metadata";
import type { MasterDataRecycleGuard } from "@/lib/products/recycle-guards";
import { cn } from "@/lib/utils";

type DecimalLike = {
  toString(): string;
};

export type ProductWorkbenchSkuRecord = {
  id: string;
  skuName: string;
  defaultUnitPrice: string | DecimalLike;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: string | DecimalLike;
  enabled: boolean;
  updatedAt: Date;
  _count: {
    salesOrderItems: number;
  };
  recycleGuard: MasterDataRecycleGuard;
};

export type ProductWorkbenchRecord = {
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
  supplier: {
    id: string;
    name: string;
    code: string;
    enabled: boolean;
  } | null;
  _count: {
    skus: number;
    salesOrderItems: number;
  };
  skus: ProductWorkbenchSkuRecord[];
};

export type ProductWorkbenchDictionaries = {
  categoryOptions: ProductCenterDictionaryOption[];
  primarySalesSceneOptions: ProductCenterDictionaryOption[];
  supplyGroupOptions: ProductCenterDictionaryOption[];
  financeCategoryOptions: ProductCenterDictionaryOption[];
};

function asDisplayString(
  value: string | number | DecimalLike | null | undefined,
) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return value.toString();
}

function asCurrencyNumber(
  value: string | number | DecimalLike | null | undefined,
) {
  const parsed = Number(asDisplayString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveDictionaryLabel(
  options: ProductCenterDictionaryOption[],
  code: string | null | undefined,
) {
  if (!code) {
    return "未设置";
  }

  return options.find((option) => option.code === code)?.label ?? code;
}

function joinReadableParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" / ");
}

function buildProductIdentityLine(
  product: ProductWorkbenchRecord,
  dictionaries: ProductWorkbenchDictionaries,
) {
  return joinReadableParts([
    product.brandName,
    product.seriesName,
    product.categoryCode
      ? resolveDictionaryLabel(
          dictionaries.categoryOptions,
          product.categoryCode,
        )
      : null,
    product.primarySalesSceneCode
      ? resolveDictionaryLabel(
          dictionaries.primarySalesSceneOptions,
          product.primarySalesSceneCode,
        )
      : null,
  ]);
}

const productWorkbenchCardClassName =
  "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)]";

const productWorkbenchInsetClassName =
  "rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]";

const productWorkbenchPillClassName =
  "rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]";

const productWorkbenchMetaLineClassName =
  "flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]";

export const productWorkbenchQuietActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-transparent px-2.5 py-2 text-sm font-medium text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color,transform] duration-200 hover:-translate-y-[1px] hover:border-[var(--color-border-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50";

export const productWorkbenchSoftActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium text-[var(--foreground)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-[1px] hover:border-[rgba(111,141,255,0.16)] hover:bg-[var(--color-shell-surface)] hover:shadow-[var(--color-shell-shadow-xs)]";

export function ProductWorkbenchHero({
  product,
  dictionaries,
  focusSku,
  activeSkuCount,
  primaryActions,
  utilityActions,
}: Readonly<{
  product: ProductWorkbenchRecord;
  dictionaries: ProductWorkbenchDictionaries;
  focusSku?: ProductWorkbenchSkuRecord | null;
  activeSkuCount: number;
  primaryActions?: ReactNode;
  utilityActions?: ReactNode;
}>) {
  const identityLine = buildProductIdentityLine(product, dictionaries);
  const shortDescription = product.description?.trim() || "";
  const portraitLine = joinReadableParts([
    product.brandName,
    product.seriesName,
  ]);

  return (
    <section className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-4 shadow-[var(--color-shell-shadow-sm)] sm:p-5">
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_16rem] xl:items-start">
        <div className="min-w-0 flex flex-1 flex-col gap-4 sm:flex-row">
          <div className="group shrink-0 rounded-[1.08rem] border border-[var(--color-border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(244,247,250,0.94))] p-3.5 shadow-[var(--color-shell-shadow-xs)]">
            <div className="flex h-full flex-col gap-3.5">
              <ProductMainImage
                mainImagePath={product.mainImagePath}
                name={product.name}
                brandName={product.brandName}
                size="hero"
                className="mx-auto shrink-0 group-hover:scale-[1.02]"
              />

              <div className="space-y-1 text-center sm:text-left">
                <p className="crm-detail-label text-[10px]">产品画像</p>
                <p className="max-w-[9rem] text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                  {portraitLine || "未补品牌 / 系列"}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="crm-detail-label text-[10px]">Product</p>
              {focusSku ? (
                <span className="rounded-full border border-[rgba(79,125,247,0.14)] bg-[rgba(79,125,247,0.08)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent-strong)]">
                  当前规格
                </span>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[1.08rem] font-semibold tracking-[-0.03em] text-[var(--foreground)] sm:text-[1.24rem]">
                  {product.name}
                </h3>
                <MasterDataStatusBadge isActive={product.enabled} />
                <span className={productWorkbenchPillClassName}>
                  {product.code}
                </span>
              </div>

              {identityLine ? (
                <p className="text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
                  {identityLine}
                </p>
              ) : (
                <p className="text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
                  当前还没有主档归类。
                </p>
              )}

              {shortDescription ? (
                <div className="rounded-[0.92rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5">
                  <p className="line-clamp-2 text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
                    {shortDescription}
                  </p>
                </div>
              ) : null}

              {focusSku ? (
                <div className="rounded-[0.98rem] border border-[rgba(79,125,247,0.14)] bg-[linear-gradient(180deg,rgba(247,250,255,0.94),rgba(255,255,255,0.98))] px-3 py-2.5 shadow-[var(--color-shell-shadow-xs)]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-sm font-semibold text-[var(--foreground)]">
                      {focusSku.skuName}
                    </span>
                    <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                      默认售价{" "}
                      {formatCurrency(
                        asCurrencyNumber(focusSku.defaultUnitPrice),
                      )}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {primaryActions || utilityActions ? (
          <div className="flex w-full flex-col gap-2 rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-3 xl:min-w-[16rem]">
            {primaryActions ? (
              <div className="flex w-full flex-wrap items-center gap-2">
                {primaryActions}
              </div>
            ) : null}
            {utilityActions ? (
              <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-[var(--color-border-soft)] pt-2.5">
                {utilityActions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={productWorkbenchPillClassName}>
          规格 {product._count.skus}
        </span>
        <span className={productWorkbenchPillClassName}>
          启用 {activeSkuCount}
        </span>
        <span className={productWorkbenchPillClassName}>
          引用 {product._count.salesOrderItems}
        </span>
        <span className={productWorkbenchPillClassName}>
          更新 {formatDateTime(product.updatedAt)}
        </span>
      </div>
    </section>
  );
}

export function ProductSkuWorkspaceSection({
  product,
  activeSkuCount,
  focusSkuId,
  renderSkuActions,
  emptyAction,
}: Readonly<{
  product: ProductWorkbenchRecord;
  activeSkuCount: number;
  focusSkuId?: string;
  renderSkuActions?: (
    sku: ProductWorkbenchSkuRecord,
    isFocused: boolean,
  ) => ReactNode;
  emptyAction?: ReactNode;
}>) {
  return (
    <section className={cn(productWorkbenchCardClassName, "overflow-hidden")}>
      <div className="flex flex-col gap-2 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="crm-detail-label text-[11px]">规格列表</p>
          <h4 className="text-[0.96rem] font-semibold text-[var(--foreground)]">
            {product.name} 的可售规格
          </h4>
        </div>

        <p className="text-[12px] text-[var(--color-sidebar-muted)]">
          规格 {product.skus.length} · 启用 {activeSkuCount}
          {focusSkuId ? " · 当前聚焦单个规格" : ""}
        </p>
      </div>

      {product.skus.length > 0 ? (
        <div className="space-y-2.5 px-4 py-4 sm:px-5">
          {product.skus.map((sku) => {
            const isFocused = focusSkuId === sku.id;
            const insuranceAmount = asCurrencyNumber(
              sku.defaultInsuranceAmount,
            );

            return (
              <article key={sku.id} className="group">
                <div
                  className={[
                    "rounded-[0.98rem] border px-3.5 py-3 transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-[1px]",
                    isFocused
                      ? "border-[rgba(122,154,255,0.18)] bg-[linear-gradient(180deg,rgba(247,250,255,0.94),rgba(255,255,255,0.98))] shadow-[var(--color-shell-shadow-xs)]"
                      : "border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-xs)] hover:border-[rgba(111,141,255,0.1)] hover:bg-[var(--color-shell-surface)]",
                  ].join(" ")}
                >
                  <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                          {sku.skuName}
                        </span>
                        {isFocused ? (
                          <span className="rounded-full border border-[var(--color-accent)]/14 bg-[var(--color-accent)]/6 px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]">
                            当前聚焦
                          </span>
                        ) : null}
                        <MasterDataStatusBadge isActive={sku.enabled} />
                      </div>

                      <div className={productWorkbenchMetaLineClassName}>
                        <span>
                          默认售价{" "}
                          {formatCurrency(
                            asCurrencyNumber(sku.defaultUnitPrice),
                          )}
                        </span>
                        {sku.codSupported ? <span>COD</span> : null}
                        {sku.insuranceSupported ? (
                          <span>保价 {formatCurrency(insuranceAmount)}</span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                        <span>订单引用 {sku._count.salesOrderItems}</span>
                        <span>更新于 {formatDateTime(sku.updatedAt)}</span>
                      </div>
                    </div>

                    {renderSkuActions ? (
                      <div className="flex flex-wrap items-center gap-1.5 transition-opacity duration-200 xl:max-w-[16rem] xl:justify-end xl:opacity-80 group-hover:opacity-100">
                        {renderSkuActions(sku, isFocused)}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-5 sm:px-5">
          <div className="rounded-[1rem] border border-dashed border-[var(--color-border-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(244,247,250,0.95))] px-5 py-6 text-center shadow-none">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] text-[1.1rem] font-medium text-[var(--color-sidebar-muted)] shadow-[var(--color-shell-shadow-xs)]">
              +
            </div>
            <h5 className="mt-4 text-[0.95rem] font-semibold tracking-[-0.02em] text-[var(--foreground)]">
              当前商品还没有销售规格
            </h5>
            <p className="mx-auto mt-2 max-w-[24rem] text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
              先补一个首个规格，后续再继续复制销售变体。
            </p>
            {emptyAction ? (
              <div className="mt-4 flex justify-center">{emptyAction}</div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

export function ProductExecutionSummarySection({
  product,
  dictionaries,
  canViewSupplyIdentity,
}: Readonly<{
  product: ProductWorkbenchRecord;
  dictionaries: ProductWorkbenchDictionaries;
  canViewSupplyIdentity: boolean;
}>) {
  return (
    <details className="group rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)] sm:p-5">
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="crm-detail-label text-[11px]">更多资料</p>
            <h4 className="text-[0.96rem] font-semibold text-[var(--foreground)]">
              执行供货、归类与内部备注
            </h4>
            <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
              默认收起，不打断“产品名 + 规格”的主工作流。
            </p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] text-[var(--color-sidebar-muted)] transition-transform duration-200 group-open:rotate-180">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      </summary>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className={productWorkbenchInsetClassName}>
          <p className="crm-detail-label text-[11px]">执行供货</p>
          {canViewSupplyIdentity && product.supplier ? (
            <div className="mt-2.5 space-y-1.5">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {product.supplier.name}
              </p>
              <p className="text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
                {product.supplier.code}
                {product.supplier.enabled ? "" : " / 停用"}
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
              当前角色默认隐藏 supplier identity。
            </p>
          )}
        </div>

        <div className={productWorkbenchInsetClassName}>
          <p className="crm-detail-label text-[11px]">经营归类</p>
          <dl className="mt-2.5 space-y-2 text-sm text-[var(--color-sidebar-muted)]">
            <div className="flex items-start justify-between gap-3">
              <dt>供货归类</dt>
              <dd className="text-right font-medium text-[var(--foreground)]">
                {resolveDictionaryLabel(
                  dictionaries.supplyGroupOptions,
                  product.supplyGroupCode,
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt>财务归类</dt>
              <dd className="text-right font-medium text-[var(--foreground)]">
                {resolveDictionaryLabel(
                  dictionaries.financeCategoryOptions,
                  product.financeCategoryCode,
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className={productWorkbenchInsetClassName}>
          <p className="crm-detail-label text-[11px]">备注与审计</p>
          <div className="mt-2.5 space-y-3">
            <p className="text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
              {product.internalSupplyRemark || "当前未填写内部供货备注。"}
            </p>
            <div className="space-y-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              <p>创建 {formatDateTime(product.createdAt)}</p>
              <p>更新 {formatDateTime(product.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
