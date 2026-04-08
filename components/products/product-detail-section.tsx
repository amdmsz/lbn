"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import { ProductSkuDrawer } from "@/components/products/product-sku-drawer";
import { type SupplierOption } from "@/components/products/product-supplier-field";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
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
    <div className="space-y-5">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <section className="crm-section-card space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <MasterDataStatusBadge isActive={product.enabled} />
              <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                {product.code}
              </span>
              <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                SKU {product._count.skus}
              </span>
              <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                引用 {product._count.salesOrderItems}
              </span>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-black/84">商品基础摘要</h3>
              <p className="text-sm text-black/56">默认先看摘要，再决定是否编辑商品或进入 SKU 维护。</p>
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setProductDrawerOpen(true)}
                className="crm-button crm-button-secondary"
              >
                编辑商品
              </button>
              <button
                type="button"
                onClick={() => setSkuDrawerMode("create")}
                className="crm-button crm-button-primary"
              >
                新建 SKU
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">商品名称</div>
            <div className="mt-2 text-sm font-medium text-black/84">{product.name}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">商品编码</div>
            <div className="mt-2 text-sm font-medium text-black/84">{product.code}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">供货商</div>
            <div className="mt-2 text-sm font-medium text-black/84">
              {product.supplier.name} ({product.supplier.code})
            </div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">最近更新</div>
            <div className="mt-2 text-sm font-medium text-black/84">{formatDateTime(product.updatedAt)}</div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.8fr))]">
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">说明</div>
            <div className="mt-2 text-sm leading-7 text-black/62">{product.description || "暂无说明"}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">SKU 数</div>
            <div className="mt-2 text-2xl font-semibold text-black/84">{product._count.skus}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">引用次数</div>
            <div className="mt-2 text-2xl font-semibold text-black/84">{product._count.salesOrderItems}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">状态</div>
            <div className="mt-2 text-sm font-medium text-black/84">{product.enabled ? "启用中" : "已停用"}</div>
          </div>
        </div>

        {canManage ? (
          <div className="flex justify-end">
            <button type="button" onClick={handleToggleProduct} disabled={pendingToggle} className="crm-button crm-button-secondary">
              {product.enabled ? "停用商品" : "启用商品"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-black/8 bg-[rgba(249,250,252,0.72)] px-4 py-3.5 text-sm leading-7 text-black/58">
        直播商品绑定仍保持预留边界，本轮不扩新业务能力，也不让它抢走 SKU 管理主舞台。
      </section>

      <section className="crm-section-card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-black/84">SKU 管理</h3>
            <p className="mt-1 text-sm text-black/56">默认先看 SKU 列表，创建和编辑都走抽屉。</p>
          </div>
          {canManage ? (
            <button
              type="button"
              onClick={() => setSkuDrawerMode("create")}
              className="crm-button crm-button-primary"
            >
              新建 SKU
            </button>
          ) : null}
        </div>

        {product.skus.length > 0 ? (
          <div className="grid gap-3">
            {product.skus.map((sku) => (
              <div key={sku.id} className="crm-card-muted px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <MasterDataStatusBadge isActive={sku.enabled} />
                      <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                        {sku.skuCode}
                      </span>
                      <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                        引用 {sku._count.salesOrderItems}
                      </span>
                    </div>

                    <div>
                      <div className="text-base font-semibold text-black/84">{sku.skuName}</div>
                      <div className="mt-1 text-sm text-black/58">
                        {sku.specText} / {sku.unit}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-black/8 bg-white/72 px-3.5 py-3 text-sm text-black/62">
                        默认单价：{formatCurrency(sku.defaultUnitPrice)}
                      </div>
                      <div className="rounded-2xl border border-black/8 bg-white/72 px-3.5 py-3 text-sm text-black/62">
                        默认保价：{formatCurrency(sku.defaultInsuranceAmount)}
                      </div>
                      <div className="rounded-2xl border border-black/8 bg-white/72 px-3.5 py-3 text-sm text-black/62">
                        货到付款：{sku.codSupported ? "支持" : "不支持"}
                      </div>
                      <div className="rounded-2xl border border-black/8 bg-white/72 px-3.5 py-3 text-sm text-black/62">
                        保价：{sku.insuranceSupported ? "支持" : "不支持"}
                      </div>
                    </div>
                  </div>

                  <div className="w-full space-y-2 text-left sm:w-auto sm:min-w-[11rem] sm:text-right">
                    <div className="text-sm text-black/56">最近更新：{formatDateTime(sku.updatedAt)}</div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSkuId(sku.id);
                            setSkuDrawerMode("edit");
                          }}
                          className="crm-button crm-button-secondary"
                        >
                          编辑
                        </button>
                      ) : null}
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => handleToggleSku(sku.id)}
                          disabled={pendingToggle}
                          className="crm-button crm-button-secondary"
                        >
                          {sku.enabled ? "停用" : "启用"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title="暂无 SKU"
            description="当前商品还没有 SKU，先补充规格、价格与履约能力。"
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
        )}
      </section>

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
