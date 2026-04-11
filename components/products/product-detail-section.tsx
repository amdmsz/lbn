"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import { ProductSkuDrawer } from "@/components/products/product-sku-drawer";
import { type SupplierOption } from "@/components/products/product-supplier-field";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";

type ProductActionResult = {
  status: "success" | "error";
  message: string;
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

type ProductDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  supplierId: string;
  supplier: {
    id: string;
    name: string;
    code: string;
    enabled: boolean;
  };
  _count: {
    skus: number;
    salesOrderItems: number;
  };
  skus: Array<{
    id: string;
    skuCode: string;
    skuName: string;
    specText: string;
    unit: string;
    defaultUnitPrice: { toString(): string };
    codSupported: boolean;
    insuranceSupported: boolean;
    defaultInsuranceAmount: { toString(): string };
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      salesOrderItems: number;
    };
  }>;
};

export function ProductDetailSection({
  product,
  suppliers,
  canManage,
  canQuickCreateSupplier,
  currentHref,
  initialOpenProductEditor,
  initialOpenSkuCreator,
  upsertProductAction,
  toggleProductAction,
  upsertProductSkuAction,
  toggleProductSkuAction,
  createInlineSupplierAction,
}: Readonly<{
  product: ProductDetail;
  suppliers: SupplierOption[];
  canManage: boolean;
  canQuickCreateSupplier: boolean;
  currentHref: string;
  initialOpenProductEditor: boolean;
  initialOpenSkuCreator: boolean;
  upsertProductAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductAction: (formData: FormData) => Promise<ProductActionResult>;
  upsertProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [productDrawerOpen, setProductDrawerOpen] = useState(initialOpenProductEditor);
  const [skuDrawerMode, setSkuDrawerMode] = useState<"create" | "edit" | null>(
    initialOpenSkuCreator ? "create" : null,
  );
  const [editingSkuId, setEditingSkuId] = useState<string | null>(null);
  const [dismissInitialProductDrawer, setDismissInitialProductDrawer] = useState(
    initialOpenProductEditor,
  );
  const [dismissInitialSkuDrawer, setDismissInitialSkuDrawer] = useState(initialOpenSkuCreator);
  const [pendingToggle, startToggleTransition] = useTransition();
  const router = useRouter();

  const editingSku =
    editingSkuId ? product.skus.find((sku) => sku.id === editingSkuId) ?? null : null;
  const activeSkuCount = product.skus.filter((sku) => sku.enabled).length;

  function closeProductDrawer() {
    setProductDrawerOpen(false);
    if (dismissInitialProductDrawer) {
      setDismissInitialProductDrawer(false);
      router.replace(currentHref);
    }
  }

  function closeSkuDrawer() {
    setSkuDrawerMode(null);
    setEditingSkuId(null);
    if (dismissInitialSkuDrawer) {
      setDismissInitialSkuDrawer(false);
      router.replace(currentHref);
    }
  }

  function handleToggleProduct() {
    const formData = new FormData();
    formData.set("id", product.id);
    formData.set("redirectTo", currentHref);

    startToggleTransition(async () => {
      const result = await toggleProductAction(formData);
      setNotice(result);
      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  function handleToggleSku(skuId: string) {
    const formData = new FormData();
    formData.set("id", skuId);
    formData.set("redirectTo", currentHref);

    startToggleTransition(async () => {
      const result = await toggleProductSkuAction(formData);
      setNotice(result);
      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <SectionCard
        density="compact"
        title="商品概览"
        description="商品摘要、供应商挂接和维护状态集中留在这一层，避免详情页继续堆成长名片。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MasterDataStatusBadge isActive={product.enabled} />
            {canManage ? (
              <button
                type="button"
                onClick={handleToggleProduct}
                disabled={pendingToggle}
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                {product.enabled ? "停用商品" : "启用商品"}
              </button>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,320px)]">
          <div className="space-y-3.5">
            <div className="rounded-[0.95rem] border border-black/8 bg-[rgba(248,249,251,0.72)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
                商品说明
              </p>
              <p className="mt-2 text-sm leading-6 text-black/62">
                {product.description || "当前未填写商品说明，详情页默认仍以 SKU 工作区为主。"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[0.95rem] border border-black/8 bg-white/82 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
                  默认供应商
                </p>
                <p className="mt-2 text-sm font-semibold text-black/84">{product.supplier.name}</p>
                <p className="mt-1 text-[13px] leading-5 text-black/56">
                  {product.supplier.code}
                  {product.supplier.enabled ? "" : " / 已停用"}
                </p>
              </div>

              <div className="rounded-[0.95rem] border border-black/8 bg-white/82 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
                  主数据覆盖
                </p>
                <p className="mt-2 text-sm font-semibold text-black/84">
                  {product._count.skus} 个 SKU
                </p>
                <p className="mt-1 text-[13px] leading-5 text-black/56">
                  成交引用 {product._count.salesOrderItems} 次
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[0.95rem] border border-black/8 bg-[rgba(255,255,255,0.9)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
              档案信息
            </p>
            <dl className="mt-3 divide-y divide-black/6 text-sm">
              <div className="flex items-start justify-between gap-3 py-2.5">
                <dt className="text-black/48">商品编码</dt>
                <dd className="text-right font-medium text-black/78">{product.code}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2.5">
                <dt className="text-black/48">创建时间</dt>
                <dd className="text-right font-medium text-black/78">
                  {formatDateTime(product.createdAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2.5">
                <dt className="text-black/48">最近更新</dt>
                <dd className="text-right font-medium text-black/78">
                  {formatDateTime(product.updatedAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 py-2.5">
                <dt className="text-black/48">启用 SKU</dt>
                <dd className="text-right font-medium text-black/78">
                  {activeSkuCount} / {product.skus.length}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        density="compact"
        title="SKU 工作区"
        description="规格、默认单价、保价能力和成交引用集中在这一层，创建与编辑继续走现有抽屉。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`启用 ${activeSkuCount}`} variant="neutral" />
            {canManage ? (
              <button
                type="button"
                onClick={() => setSkuDrawerMode("create")}
                className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
              >
                新建 SKU
              </button>
            ) : null}
          </div>
        }
        contentClassName="p-0"
      >
        {product.skus.length > 0 ? (
          <div className="divide-y divide-black/6">
            {product.skus.map((sku) => (
              <article
                key={sku.id}
                className="flex flex-col gap-3 px-4 py-3.5 md:px-5 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={sku.enabled} />
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-black/55">
                      {sku.skuCode}
                    </span>
                    {sku.codSupported ? <StatusBadge label="COD" variant="info" /> : null}
                    {sku.insuranceSupported ? (
                      <StatusBadge label="保价" variant="warning" />
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <div className="truncate text-[15px] font-semibold text-black/84">
                      {sku.skuName}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-black/56">
                      <span>{sku.specText}</span>
                      <span className="text-black/24">/</span>
                      <span>{sku.unit}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-5 text-black/48">
                    <span>默认单价 {formatCurrency(sku.defaultUnitPrice)}</span>
                    <span>
                      默认保价{" "}
                      {sku.insuranceSupported
                        ? formatCurrency(sku.defaultInsuranceAmount)
                        : "未开启"}
                    </span>
                    <span>成交引用 {sku._count.salesOrderItems}</span>
                    <span>最近更新 {formatDateTime(sku.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSkuId(sku.id);
                        setSkuDrawerMode("edit");
                      }}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                    >
                      编辑
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => handleToggleSku(sku.id)}
                      disabled={pendingToggle}
                      className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sku.enabled ? "停用" : "启用"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-4 md:p-5">
            <EmptyState
              title="当前商品还没有 SKU"
              description="先补充规格、默认单价和履约能力，再让详情页进入稳定的 SKU 工作区节奏。"
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => setSkuDrawerMode("create")}
                    className="crm-button crm-button-primary"
                  >
                    新建 SKU
                  </button>
                ) : undefined
              }
            />
          </div>
        )}
      </SectionCard>

      <SectionCard
        density="compact"
        title="次级说明"
        description="低频扩展信息后置，不抢占商品摘要和 SKU 工作区。"
        className="border-black/6 bg-[rgba(249,250,252,0.76)] shadow-[0_8px_18px_rgba(18,24,31,0.03)]"
      >
        <p className="text-sm leading-6 text-black/58">
          直播商品绑定仍保留为后续扩展边界，这一轮不新增业务能力，也不让它打断当前主数据维护流程。
        </p>
      </SectionCard>

      <ProductFormDrawer
        open={productDrawerOpen}
        mode="edit"
        product={{
          id: product.id,
          supplierId: product.supplierId,
          code: product.code,
          name: product.name,
          description: product.description,
        }}
        suppliers={suppliers}
        redirectTo={currentHref}
        canQuickCreateSupplier={canQuickCreateSupplier}
        upsertAction={upsertProductAction}
        createInlineSupplierAction={createInlineSupplierAction}
        onClose={closeProductDrawer}
        onSaved={(message) => {
          setNotice({ status: "success", message });
          closeProductDrawer();
          router.refresh();
        }}
      />

      <ProductSkuDrawer
        open={skuDrawerMode !== null}
        mode={skuDrawerMode ?? "create"}
        productId={product.id}
        sku={
          skuDrawerMode === "edit" && editingSku
            ? {
                id: editingSku.id,
                skuCode: editingSku.skuCode,
                skuName: editingSku.skuName,
                specText: editingSku.specText,
                unit: editingSku.unit,
                defaultUnitPrice: editingSku.defaultUnitPrice.toString(),
                codSupported: editingSku.codSupported,
                insuranceSupported: editingSku.insuranceSupported,
                defaultInsuranceAmount: editingSku.defaultInsuranceAmount.toString(),
                enabled: editingSku.enabled,
              }
            : null
        }
        redirectTo={currentHref}
        upsertAction={upsertProductSkuAction}
        onClose={closeSkuDrawer}
        onSaved={(message) => {
          setNotice({ status: "success", message });
          closeSkuDrawer();
          router.refresh();
        }}
      />
    </div>
  );
}
