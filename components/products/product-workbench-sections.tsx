import type { ReactNode } from "react";
import { ProductMainImage } from "@/components/products/product-main-image";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import type { ProductCenterDictionaryOption } from "@/lib/products/metadata";
import type { MasterDataRecycleGuard } from "@/lib/products/recycle-guards";

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

function asDisplayString(value: string | number | DecimalLike | null | undefined) {
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

function asCurrencyNumber(value: string | number | DecimalLike | null | undefined) {
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
      ? resolveDictionaryLabel(dictionaries.categoryOptions, product.categoryCode)
      : null,
    product.primarySalesSceneCode
      ? resolveDictionaryLabel(
          dictionaries.primarySalesSceneOptions,
          product.primarySalesSceneCode,
        )
      : null,
  ]);
}

function renderCompactField(label: string, value: string, emphasized = false) {
  return (
    <div className="rounded-[0.95rem] border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,248,250,0.88))] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/36">
        {label}
      </p>
      <p
        className={[
          "mt-1.5 text-[13px] leading-5",
          emphasized ? "font-semibold text-black/86" : "font-medium text-black/68",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

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

  return (
    <section className="rounded-[1rem] border border-black/8 bg-[linear-gradient(180deg,rgba(251,251,252,0.98),rgba(244,246,248,0.94))] p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_17rem] xl:items-start">
        <div className="min-w-0 flex flex-1 gap-4">
          <ProductMainImage
            mainImagePath={product.mainImagePath}
            name={product.name}
            brandName={product.brandName}
            size="hero"
            className="shrink-0"
          />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/36">
                商品母档
              </p>
              {focusSku ? (
                <span className="rounded-full border border-[var(--color-accent)]/14 bg-[var(--color-accent)]/6 px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent)]">
                  当前规格
                </span>
              ) : null}
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[1.2rem] font-semibold tracking-[-0.02em] text-black/88 sm:text-[1.35rem]">
                  {product.name}
                </h3>
                <MasterDataStatusBadge isActive={product.enabled} />
                <span className="rounded-full border border-black/10 bg-white/84 px-2.5 py-1 text-[11px] font-medium text-black/52">
                  {product.code}
                </span>
              </div>

              {identityLine ? (
                <p className="text-[13px] leading-5 text-black/56">{identityLine}</p>
              ) : (
                <p className="text-[13px] leading-5 text-black/44">
                  先识别商品，再往下看规格目录与执行摘要。
                </p>
              )}

              {shortDescription ? (
                <div className="rounded-[0.9rem] border border-black/7 bg-white/78 px-3.5 py-3">
                  <p className="line-clamp-2 text-[13px] leading-6 text-black/60">
                    {shortDescription}
                  </p>
                </div>
              ) : null}

              {focusSku ? (
                <div className="rounded-[0.9rem] border border-[var(--color-accent)]/12 bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(241,247,255,0.9))] px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-black/86">{focusSku.skuName}</span>
                    <span className="rounded-full border border-black/8 bg-white/84 px-2 py-0.5 text-[11px] font-medium text-black/52">
                      默认售价 {formatCurrency(asCurrencyNumber(focusSku.defaultUnitPrice))}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {(primaryActions || utilityActions) ? (
          <div className="flex w-full flex-col gap-2 rounded-[0.95rem] border border-black/7 bg-white/84 p-3.5 xl:min-w-[17rem]">
            {primaryActions ? (
              <div className="flex w-full flex-wrap items-center gap-2">{primaryActions}</div>
            ) : null}
            {utilityActions ? (
              <div className="flex w-full flex-wrap items-center gap-2 border-t border-black/6 pt-2.5">
                {utilityActions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {renderCompactField("SKU 数量", String(product._count.skus), true)}
        {renderCompactField("启用规格", String(activeSkuCount), true)}
        {renderCompactField("历史引用", String(product._count.salesOrderItems), true)}
        {renderCompactField("最近更新", formatDateTime(product.updatedAt), true)}
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {renderCompactField("品牌", product.brandName || "未设置")}
        {renderCompactField("系列", product.seriesName || "未设置")}
        {renderCompactField(
          "类目",
          resolveDictionaryLabel(dictionaries.categoryOptions, product.categoryCode),
        )}
        {renderCompactField(
          "主销售场景",
          resolveDictionaryLabel(
            dictionaries.primarySalesSceneOptions,
            product.primarySalesSceneCode,
          ),
        )}
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
  renderSkuActions?: (sku: ProductWorkbenchSkuRecord, isFocused: boolean) => ReactNode;
  emptyAction?: ReactNode;
}>) {
  return (
    <section className="overflow-hidden rounded-[1rem] border border-black/8 bg-white/96">
      <div className="flex flex-col gap-3 border-b border-black/7 bg-[rgba(247,248,250,0.72)] px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
            SKU 规格目录
          </p>
          <h4 className="text-[0.98rem] font-semibold text-black/86">
            同一商品下的销售规格
          </h4>
          <p className="text-[13px] leading-5 text-black/54">
            当前工作区只展示保留下来的 SKU 核心字段，不再拼装已删除的规格参数。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={`规格 ${product.skus.length}`} variant="neutral" />
          <StatusBadge label={`启用 ${activeSkuCount}`} variant="neutral" />
          {focusSkuId ? <StatusBadge label="当前聚焦单个规格" variant="info" /> : null}
        </div>
      </div>

      {product.skus.length > 0 ? (
        <div className="space-y-2.5 px-4 py-4 sm:px-5">
          {product.skus.map((sku) => {
            const isFocused = focusSkuId === sku.id;
            const insuranceAmount = asCurrencyNumber(sku.defaultInsuranceAmount);

            return (
              <article
                key={sku.id}
                className={[
                  "rounded-[0.95rem] border px-3.5 py-3.5 transition-colors",
                  isFocused
                    ? "border-[var(--color-accent)]/16 bg-[linear-gradient(180deg,rgba(248,251,255,0.96),rgba(243,248,255,0.9))]"
                    : "border-black/7 bg-[rgba(252,252,253,0.94)]",
                ].join(" ")}
              >
                <div className="flex flex-col gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                  <div className="min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-black/86">
                        {sku.skuName}
                      </span>
                      {isFocused ? (
                        <span className="rounded-full border border-[var(--color-accent)]/14 bg-[var(--color-accent)]/6 px-2 py-0.5 text-[11px] font-medium text-[var(--color-accent)]">
                          当前聚焦
                        </span>
                      ) : null}
                      <MasterDataStatusBadge isActive={sku.enabled} />
                    </div>

                    <div className="flex flex-wrap gap-2 text-[12px] leading-5 text-black/50">
                      <span className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.82)] px-2.5 py-1">
                        默认售价 {formatCurrency(asCurrencyNumber(sku.defaultUnitPrice))}
                      </span>
                      {sku.codSupported ? <StatusBadge label="COD" variant="info" /> : null}
                      {sku.insuranceSupported ? (
                        <StatusBadge
                          label={`保价 ${formatCurrency(insuranceAmount)}`}
                          variant="warning"
                        />
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-5 text-black/46">
                      <span>订单引用 {sku._count.salesOrderItems}</span>
                      <span>更新于 {formatDateTime(sku.updatedAt)}</span>
                    </div>
                  </div>

                  {renderSkuActions ? (
                    <div className="flex flex-wrap items-center gap-2 xl:max-w-[16rem] xl:justify-end">
                      {renderSkuActions(sku, isFocused)}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="px-4 py-5 sm:px-5">
          <EmptyState
            title="当前商品还没有销售规格"
            description="先补一个首个规格，后续再继续复制销售变体。"
            action={emptyAction}
          />
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
    <section className="rounded-[1rem] border border-black/8 bg-[rgba(255,255,255,0.96)] p-4 sm:p-5">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
          次级执行摘要
        </p>
        <h4 className="text-[0.98rem] font-semibold text-black/86">供货执行与内部维护信息</h4>
        <p className="text-[13px] leading-5 text-black/54">
          supplier 与归类信息继续保留，但只放在工作台下层，不再抢商品和规格目录主视觉。
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.68)] p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
            执行供货
          </p>
          {canViewSupplyIdentity && product.supplier ? (
            <div className="mt-2.5 space-y-1.5">
              <p className="text-sm font-semibold text-black/84">{product.supplier.name}</p>
              <p className="text-[13px] leading-5 text-black/56">
                {product.supplier.code}
                {product.supplier.enabled ? "" : " / 停用"}
              </p>
              <p className="text-[12px] leading-5 text-black/46">
                supplierId 继续作为执行真相，仅在详情下层表达。
              </p>
            </div>
          ) : (
            <p className="mt-2.5 text-[13px] leading-5 text-black/50">
              当前角色默认隐藏 supplier identity，这里只保留商品与规格工作区。
            </p>
          )}
        </div>

        <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.68)] p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
            执行归类
          </p>
          <dl className="mt-2.5 space-y-2 text-sm text-black/72">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-black/48">供货归类</dt>
              <dd className="text-right font-medium text-black/84">
                {resolveDictionaryLabel(dictionaries.supplyGroupOptions, product.supplyGroupCode)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-black/48">财务归类</dt>
              <dd className="text-right font-medium text-black/84">
                {resolveDictionaryLabel(
                  dictionaries.financeCategoryOptions,
                  product.financeCategoryCode,
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.68)] p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
            内部备注与审计
          </p>
          <div className="mt-2.5 space-y-3">
            <p className="text-[13px] leading-5 text-black/56">
              {product.internalSupplyRemark || "当前未填写内部供货备注。"}
            </p>
            <div className="space-y-1 text-[12px] leading-5 text-black/46">
              <p>创建时间 {formatDateTime(product.createdAt)}</p>
              <p>最近更新 {formatDateTime(product.updatedAt)}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
