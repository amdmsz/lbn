"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import {
  ProductExecutionSummarySection,
  productWorkbenchQuietActionClassName,
  productWorkbenchSoftActionClassName,
  ProductSkuWorkspaceSection,
  ProductWorkbenchHero,
} from "@/components/products/product-workbench-sections";
import {
  ProductSkuDrawer,
  type ProductSkuDraft,
} from "@/components/products/product-sku-drawer";
import { type SupplierOption } from "@/components/products/product-supplier-field";
import { ActionBanner } from "@/components/shared/action-banner";
import { ClientPortal } from "@/components/shared/client-portal";
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
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [skuDrawerMode, setSkuDrawerMode] = useState<"create" | "edit" | null>(
    null,
  );
  const [skuCreateMode, setSkuCreateMode] = useState<"quick" | "advanced">(
    "quick",
  );
  const [editingSkuId, setEditingSkuId] = useState<string | null>(null);
  const [templateSkuId, setTemplateSkuId] = useState<string | null>(null);
  const [recycleTarget, setRecycleTarget] = useState<RecycleTarget | null>(
    null,
  );
  const [recycleReason, setRecycleReason] =
    useState<MasterDataRecycleReasonCode>("mistaken_creation");
  const [pendingAction, startActionTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !product) {
    return null;
  }

  const currentProduct = product;
  const focusSku = focusSkuId
    ? (currentProduct.skus.find((sku) => sku.id === focusSkuId) ?? null)
    : null;
  const editingSku = editingSkuId
    ? (currentProduct.skus.find((sku) => sku.id === editingSkuId) ?? null)
    : null;
  const activeSkuCount = currentProduct.skus.filter(
    (sku) => sku.enabled,
  ).length;
  const quickCreateButtonLabel =
    currentProduct.skus.length > 0 ? "复制为新规格" : "新增首个规格";
  const templateSourceSku = templateSkuId
    ? (currentProduct.skus.find((sku) => sku.id === templateSkuId) ?? null)
    : (focusSku ?? currentProduct.skus[0] ?? null);

  function mapSkuToDraft(
    source: ProductWorkspaceDetail["skus"][number] | null,
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
    setTemplateSkuId(
      sourceSkuId ?? focusSku?.id ?? currentProduct.skus[0]?.id ?? null,
    );
    setSkuCreateMode("quick");
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

      if (
        result.recycleStatus === "created" ||
        result.recycleStatus === "already_in_recycle_bin"
      ) {
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
    <ClientPortal>
      <div className="fixed inset-0 z-[9999]">
        <button
          type="button"
          aria-label="关闭商品详情抽屉"
          onClick={onClose}
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm"
        />

        <aside className="fixed inset-y-0 right-0 z-[10000] flex h-[100dvh] max-h-[100dvh] w-full max-w-[56rem] flex-col overflow-hidden border-l border-border/60 bg-background shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border/50 bg-background px-5 py-3 sm:px-6">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                <span>商品</span>
                <span className="h-1 w-1 rounded-full bg-[var(--color-border)]" />
                <span>详情</span>
              </div>
              <h3 className="truncate text-[1rem] font-semibold text-[var(--foreground)]">
                {currentProduct.name}
              </h3>
              <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
                {focusSku
                  ? `当前聚焦规格：${focusSku.skuName}`
                  : "围绕产品名与销售规格做轻维护。"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {notice ? (
            <div className="border-b border-border/50 px-5 py-3 sm:px-6">
              <ActionBanner
                tone={notice.status === "success" ? "success" : "danger"}
              >
                {notice.message}
              </ActionBanner>
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 [scrollbar-width:none] [-ms-overflow-style:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
            <div className="space-y-3">
              <ProductWorkbenchHero
                product={currentProduct}
                dictionaries={dictionaries}
                focusSku={focusSku}
                activeSkuCount={activeSkuCount}
                primaryActions={
                  canManage ? (
                    <button
                      type="button"
                      onClick={() => openQuickSkuCreate()}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-4 py-2 rounded-md transition-colors"
                    >
                      添加规格
                    </button>
                  ) : null
                }
                utilityActions={
                  <>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => setProductDrawerOpen(true)}
                        className={productWorkbenchSoftActionClassName}
                      >
                        编辑商品
                      </button>
                    ) : null}
                    <Link
                      href={`/products/${currentProduct.id}`}
                      className={productWorkbenchQuietActionClassName}
                    >
                      页面详情
                    </Link>
                    {canManage ? (
                      <button
                        type="button"
                        onClick={handleToggleProduct}
                        disabled={pendingAction}
                        className={productWorkbenchQuietActionClassName}
                      >
                        {currentProduct.enabled ? "停用" : "启用"}
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
                        className={productWorkbenchQuietActionClassName}
                      >
                        {currentProduct.recycleGuard.canMoveToRecycleBin
                          ? "回收"
                          : "查看引用"}
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
                        onClick={() =>
                          router.replace(buildSkuDetailHref(sku.id))
                        }
                        className={productWorkbenchSoftActionClassName}
                      >
                        查看规格
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => openQuickSkuCreate(sku.id)}
                        className={productWorkbenchQuietActionClassName}
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
                        className={productWorkbenchQuietActionClassName}
                      >
                        编辑规格
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => handleToggleSku(sku.id)}
                        disabled={pendingAction}
                        className={productWorkbenchQuietActionClassName}
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
                        className={productWorkbenchQuietActionClassName}
                      >
                        {sku.recycleGuard.canMoveToRecycleBin
                          ? "回收"
                          : "查看引用"}
                      </button>
                    ) : null}
                  </>
                )}
                emptyAction={
                  canManage ? (
                    <button
                      type="button"
                      onClick={() => openQuickSkuCreate()}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium px-4 py-2 rounded-md transition-colors"
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
        sku={
          skuDrawerMode === "edit" && editingSku
            ? mapSkuToDraft(editingSku)
            : null
        }
        templateSku={
          skuDrawerMode === "create" ? mapSkuToDraft(templateSourceSku) : null
        }
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
        domainLabel={
          recycleTarget?.kind === "sku" ? "商品中心 / SKU" : "商品中心 / 商品"
        }
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
    </ClientPortal>
  );
}
