"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import {
  ProductExecutionSummarySection,
  ProductSkuWorkspaceSection,
  ProductWorkbenchHero,
} from "@/components/products/product-workbench-sections";
import {
  ProductSkuDrawer,
  type ProductSkuDraft,
} from "@/components/products/product-sku-drawer";
import { type SupplierOption } from "@/components/products/product-supplier-field";
import { ActionBanner } from "@/components/shared/action-banner";
import type { ProductCenterDictionaryOption } from "@/lib/products/metadata";
import type {
  MasterDataRecycleGuard,
  MasterDataRecycleReasonCode,
} from "@/lib/products/recycle-guards";

type DecimalLike = {
  toString(): string;
};

type ProductActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
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

type ProductWorkspaceDetail = {
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

type RecycleTarget =
  | {
      kind: "product";
      name: string;
      secondaryLabel: string;
      updatedAt: Date;
      guard: MasterDataRecycleGuard;
    }
  | {
      kind: "sku";
      name: string;
      secondaryLabel: string;
      updatedAt: Date;
      guard: MasterDataRecycleGuard;
      skuId: string;
    };

export function ProductWorkspaceDetailDrawer({
  open,
  product,
  focusSkuId,
  suppliers,
  dictionaries,
  currentHref,
  buildSkuDetailHref,
  canManage,
  canQuickCreateSupplier,
  canViewSupplyIdentity,
  onClose,
  upsertProductAction,
  toggleProductAction,
  moveProductToRecycleBinAction,
  upsertProductSkuAction,
  toggleProductSkuAction,
  moveProductSkuToRecycleBinAction,
  createInlineSupplierAction,
}: Readonly<{
  open: boolean;
  product: ProductWorkspaceDetail | null;
  focusSkuId?: string;
  suppliers: SupplierOption[];
  dictionaries: {
    categoryOptions: ProductCenterDictionaryOption[];
    primarySalesSceneOptions: ProductCenterDictionaryOption[];
    supplyGroupOptions: ProductCenterDictionaryOption[];
    financeCategoryOptions: ProductCenterDictionaryOption[];
  };
  currentHref: string;
  buildSkuDetailHref?: (skuId: string) => string;
  canManage: boolean;
  canQuickCreateSupplier: boolean;
  canViewSupplyIdentity: boolean;
  onClose: () => void;
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
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [skuDrawerMode, setSkuDrawerMode] = useState<"create" | "edit" | null>(null);
  const [skuCreateMode, setSkuCreateMode] = useState<"quick" | "advanced">("quick");
  const [editingSkuId, setEditingSkuId] = useState<string | null>(null);
  const [templateSkuId, setTemplateSkuId] = useState<string | null>(null);
  const [recycleTarget, setRecycleTarget] = useState<RecycleTarget | null>(null);
  const [recycleReason, setRecycleReason] =
    useState<MasterDataRecycleReasonCode>("mistaken_creation");
  const [pendingAction, startActionTransition] = useTransition();

  if (!open || !product) {
    return null;
  }

  const currentProduct = product;
  const focusSku =
    focusSkuId ? currentProduct.skus.find((sku) => sku.id === focusSkuId) ?? null : null;
  const editingSku =
    editingSkuId ? currentProduct.skus.find((sku) => sku.id === editingSkuId) ?? null : null;
  const activeSkuCount = currentProduct.skus.filter((sku) => sku.enabled).length;
  const quickCreateButtonLabel =
    currentProduct.skus.length > 0 ? "复制为新规格" : "新增首个规格";
  const templateSourceSku = templateSkuId
    ? currentProduct.skus.find((sku) => sku.id === templateSkuId) ?? null
    : focusSku ?? currentProduct.skus[0] ?? null;

  function mapSkuToDraft(
    source:
      | ProductWorkspaceDetail["skus"][number]
      | null,
  ): ProductSkuDraft | null {
    if (!source) {
      return null;
    }

    return {
      id: source.id,
      skuName: source.skuName,
      defaultUnitPrice: source.defaultUnitPrice.toString(),
      codSupported: source.codSupported,
      insuranceSupported: source.insuranceSupported,
      defaultInsuranceAmount: source.defaultInsuranceAmount.toString(),
      enabled: source.enabled,
    };
  }

  function openQuickSkuCreate(sourceSkuId?: string | null) {
    setEditingSkuId(null);
    setTemplateSkuId(sourceSkuId ?? focusSku?.id ?? currentProduct.skus[0]?.id ?? null);
    setSkuCreateMode("quick");
    setSkuDrawerMode("create");
  }

  function openAdvancedSkuCreate(sourceSkuId?: string | null) {
    setEditingSkuId(null);
    setTemplateSkuId(sourceSkuId ?? focusSku?.id ?? currentProduct.skus[0]?.id ?? null);
    setSkuCreateMode("advanced");
    setSkuDrawerMode("create");
  }

  function handleToggleProduct() {
    const formData = new FormData();
    formData.set("id", currentProduct.id);
    formData.set("redirectTo", currentHref);

    startActionTransition(async () => {
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
    formData.set("redirectTo", currentHref);
    formData.set("reasonCode", recycleReason);

    if (recycleTarget.kind === "sku") {
      formData.set("id", recycleTarget.skuId);
    } else {
      formData.set("id", currentProduct.id);
    }

    startActionTransition(async () => {
      const result =
        recycleTarget.kind === "sku"
          ? await moveProductSkuToRecycleBinAction(formData)
          : await moveProductToRecycleBinAction(formData);

      setNotice(result);
      closeRecycleDialog();

      if (result.recycleStatus === "created" || result.recycleStatus === "already_in_recycle_bin") {
        if (recycleTarget.kind === "product") {
          onClose();
          return;
        }

        router.refresh();
        return;
      }

      if (result.recycleStatus === "blocked") {
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40">
        <button
          type="button"
          aria-label="关闭商品详情抽屉"
          onClick={onClose}
          className="absolute inset-0 bg-[rgba(15,23,42,0.22)] backdrop-blur-[1.5px]"
        />

        <aside className="absolute inset-y-0 right-0 flex w-full max-w-[60rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.988)] shadow-[-18px_0_40px_rgba(15,23,42,0.1)]">
          <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-3.5 sm:px-6">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                  商品中心
                </p>
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-black/52">
                  右侧工作台
                </span>
              </div>
              <h3 className="truncate text-[1.02rem] font-semibold text-black/86">
                {currentProduct.name}
              </h3>
              <p className="text-[13px] leading-5 text-black/56">
                {focusSku
                  ? `当前聚焦规格：${focusSku.skuName}`
                  : "围绕同一商品查看母档、规格目录和次级执行摘要。"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-white/92 text-black/50 transition-colors hover:bg-black/[0.03] hover:text-black/72"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {notice ? (
            <div className="border-b border-black/6 px-5 py-3 sm:px-6">
              <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
                {notice.message}
              </ActionBanner>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="space-y-3.5">
              <ProductWorkbenchHero
                product={currentProduct}
                dictionaries={dictionaries}
                focusSku={focusSku}
                activeSkuCount={activeSkuCount}
                primaryActions={
                  canManage ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openQuickSkuCreate()}
                        className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                      >
                        {quickCreateButtonLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAdvancedSkuCreate()}
                        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                      >
                        高级新增 SKU
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductDrawerOpen(true)}
                        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                      >
                        编辑商品
                      </button>
                    </>
                  ) : null
                }
                utilityActions={
                  <>
                    <Link
                      href={`/products/${currentProduct.id}`}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                    >
                      兼容详情页
                    </Link>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={handleToggleProduct}
                        disabled={pendingAction}
                        className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {currentProduct.enabled ? "停用商品" : "启用商品"}
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRecycleTarget({
                            kind: "product",
                            name: currentProduct.name,
                            secondaryLabel: currentProduct.code,
                            updatedAt: currentProduct.updatedAt,
                            guard: currentProduct.recycleGuard,
                          })
                        }
                        className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                      >
                        {currentProduct.recycleGuard.canMoveToRecycleBin ? "移入回收站" : "查看引用关系"}
                      </button>
                    ) : null}
                  </>
                }
              />

              <ProductSkuWorkspaceSection
                product={currentProduct}
                focusSkuId={focusSkuId}
                activeSkuCount={activeSkuCount}
                renderSkuActions={(sku, isFocused) => (
                  <>
                    {buildSkuDetailHref && !isFocused ? (
                      <button
                        type="button"
                        onClick={() => router.replace(buildSkuDetailHref(sku.id))}
                        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                      >
                        查看规格
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => openQuickSkuCreate(sku.id)}
                        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                      >
                        复制为新规格
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSkuId(sku.id);
                          setTemplateSkuId(null);
                          setSkuCreateMode("advanced");
                          setSkuDrawerMode("edit");
                        }}
                        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                      >
                        编辑规格
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => handleToggleSku(sku.id)}
                        disabled={pendingAction}
                        className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sku.enabled ? "停用" : "启用"}
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRecycleTarget({
                            kind: "sku",
                            name: sku.skuName,
                            secondaryLabel: sku.skuName,
                            updatedAt: sku.updatedAt,
                            guard: sku.recycleGuard,
                            skuId: sku.id,
                          })
                        }
                        className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                      >
                        {sku.recycleGuard.canMoveToRecycleBin ? "移入回收站" : "查看引用"}
                      </button>
                    ) : null}
                  </>
                )}
                emptyAction={
                  canManage ? (
                    <button
                      type="button"
                      onClick={() => openQuickSkuCreate()}
                      className="crm-button crm-button-primary"
                    >
                      {quickCreateButtonLabel}
                    </button>
                  ) : null
                }
              />

              <ProductExecutionSummarySection
                product={currentProduct}
                dictionaries={dictionaries}
                canViewSupplyIdentity={canViewSupplyIdentity}
              />
            </div>
          </div>
        </aside>
      </div>

      <ProductFormDrawer
        key={`${currentProduct.id}:${productDrawerOpen ? "open" : "closed"}`}
        open={productDrawerOpen}
        mode="edit"
        product={{
          id: currentProduct.id,
          supplierId: currentProduct.supplierId,
          code: currentProduct.code,
          name: currentProduct.name,
          mainImagePath: currentProduct.mainImagePath,
          brandName: currentProduct.brandName,
          seriesName: currentProduct.seriesName,
          categoryCode: currentProduct.categoryCode,
          primarySalesSceneCode: currentProduct.primarySalesSceneCode,
          supplyGroupCode: currentProduct.supplyGroupCode,
          financeCategoryCode: currentProduct.financeCategoryCode,
          description: currentProduct.description,
          internalSupplyRemark: currentProduct.internalSupplyRemark,
        }}
        suppliers={suppliers}
        dictionaries={dictionaries}
        redirectTo={currentHref}
        canQuickCreateSupplier={canQuickCreateSupplier}
        upsertAction={upsertProductAction}
        createInlineSupplierAction={createInlineSupplierAction}
        onClose={() => setProductDrawerOpen(false)}
        onSaved={(message) => {
          setNotice({ status: "success", message });
          setProductDrawerOpen(false);
          router.refresh();
        }}
      />

      <ProductSkuDrawer
        key={`${currentProduct.id}:${skuDrawerMode ?? "closed"}:${editingSkuId ?? "new"}:${templateSkuId ?? "none"}`}
        open={skuDrawerMode !== null}
        mode={skuDrawerMode ?? "create"}
        productId={currentProduct.id}
        productName={currentProduct.name}
        supplierName={currentProduct.supplier?.name ?? null}
        sku={skuDrawerMode === "edit" && editingSku ? mapSkuToDraft(editingSku) : null}
        templateSku={skuDrawerMode === "create" ? mapSkuToDraft(templateSourceSku) : null}
        redirectTo={currentHref}
        createMode={skuCreateMode}
        upsertAction={upsertProductSkuAction}
        onClose={() => {
          setSkuDrawerMode(null);
          setEditingSkuId(null);
          setTemplateSkuId(null);
        }}
        onSaved={(message) => {
          setNotice({ status: "success", message });
          setSkuDrawerMode(null);
          setEditingSkuId(null);
          setTemplateSkuId(null);
          router.refresh();
        }}
      />

      <MasterDataRecycleDialog
        open={recycleTarget !== null}
        objectName={recycleTarget?.name ?? ""}
        objectTypeLabel={recycleTarget?.kind === "sku" ? "SKU" : "商品"}
        secondaryLabel={recycleTarget?.secondaryLabel ?? ""}
        domainLabel={recycleTarget?.kind === "sku" ? "商品中心 / SKU" : "商品中心 / 商品"}
        updatedAt={recycleTarget?.updatedAt ?? new Date()}
        guard={
          recycleTarget?.guard ?? {
            canMoveToRecycleBin: false,
            fallbackActionLabel: "改为停用",
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
                if (recycleTarget.kind === "sku") {
                  handleToggleSku(recycleTarget.skuId);
                } else {
                  handleToggleProduct();
                }
                closeRecycleDialog();
              }
            : undefined
        }
      />
    </>
  );
}
