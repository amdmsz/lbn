"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

export function ProductDetailSection({
  product,
  suppliers,
  dictionaries,
  canManage,
  canQuickCreateSupplier,
  canViewSupplyIdentity,
  currentHref,
  initialOpenProductEditor,
  initialOpenSkuCreator,
  upsertProductAction,
  toggleProductAction,
  moveProductToRecycleBinAction,
  upsertProductSkuAction,
  toggleProductSkuAction,
  moveProductSkuToRecycleBinAction,
  createInlineSupplierAction,
}: Readonly<{
  product: ProductDetail;
  suppliers: SupplierOption[];
  dictionaries: {
    categoryOptions: ProductCenterDictionaryOption[];
    primarySalesSceneOptions: ProductCenterDictionaryOption[];
    supplyGroupOptions: ProductCenterDictionaryOption[];
    financeCategoryOptions: ProductCenterDictionaryOption[];
  };
  canManage: boolean;
  canQuickCreateSupplier: boolean;
  canViewSupplyIdentity: boolean;
  currentHref: string;
  initialOpenProductEditor: boolean;
  initialOpenSkuCreator: boolean;
  upsertProductAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductAction: (formData: FormData) => Promise<ProductActionResult>;
  moveProductToRecycleBinAction: (formData: FormData) => Promise<ProductActionResult>;
  upsertProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleProductSkuAction: (formData: FormData) => Promise<ProductActionResult>;
  moveProductSkuToRecycleBinAction: (formData: FormData) => Promise<ProductActionResult>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [productDrawerOpen, setProductDrawerOpen] = useState(initialOpenProductEditor);
  const [skuDrawerMode, setSkuDrawerMode] = useState<"create" | "edit" | null>(
    initialOpenSkuCreator ? "create" : null,
  );
  const [skuCreateMode, setSkuCreateMode] = useState<"quick" | "advanced">("quick");
  const [editingSkuId, setEditingSkuId] = useState<string | null>(null);
  const [templateSkuId, setTemplateSkuId] = useState<string | null>(null);
  const [dismissInitialProductDrawer, setDismissInitialProductDrawer] = useState(
    initialOpenProductEditor,
  );
  const [dismissInitialSkuDrawer, setDismissInitialSkuDrawer] = useState(initialOpenSkuCreator);
  const [recycleTarget, setRecycleTarget] = useState<RecycleTarget | null>(null);
  const [recycleReason, setRecycleReason] =
    useState<MasterDataRecycleReasonCode>("mistaken_creation");
  const [pendingAction, startActionTransition] = useTransition();
  const router = useRouter();

  const editingSku =
    editingSkuId ? product.skus.find((sku) => sku.id === editingSkuId) ?? null : null;
  const activeSkuCount = product.skus.filter((sku) => sku.enabled).length;
  const quickCreateButtonLabel =
    product.skus.length > 0 ? "复制为新规格" : "新增首个规格";
  const templateSourceSku = templateSkuId
    ? product.skus.find((sku) => sku.id === templateSkuId) ?? null
    : product.skus[0] ?? null;

  function mapSkuToDraft(source: ProductDetail["skus"][number] | null): ProductSkuDraft | null {
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
    setTemplateSkuId(sourceSkuId ?? product.skus[0]?.id ?? null);
    setSkuCreateMode("quick");
    setSkuDrawerMode("create");
  }

  function openAdvancedSkuCreate(sourceSkuId?: string | null) {
    setEditingSkuId(null);
    setTemplateSkuId(sourceSkuId ?? product.skus[0]?.id ?? null);
    setSkuCreateMode("advanced");
    setSkuDrawerMode("create");
  }

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
    setTemplateSkuId(null);
    if (dismissInitialSkuDrawer) {
      setDismissInitialSkuDrawer(false);
      router.replace(currentHref);
    }
  }

  function handleToggleProduct() {
    const formData = new FormData();
    formData.set("id", product.id);
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
      formData.set("id", product.id);
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
          router.push("/products");
          return;
        }

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

  return (
    <div className="space-y-3.5">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <ProductWorkbenchHero
        product={product}
        dictionaries={dictionaries}
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
          canManage ? (
            <>
              <button
                type="button"
                onClick={handleToggleProduct}
                disabled={pendingAction}
                className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {product.enabled ? "停用商品" : "启用商品"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setRecycleTarget({
                    kind: "product",
                    name: product.name,
                    secondaryLabel: product.code,
                    updatedAt: product.updatedAt,
                    guard: product.recycleGuard,
                  })
                }
                className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
              >
                {product.recycleGuard.canMoveToRecycleBin ? "移入回收站" : "查看引用关系"}
              </button>
            </>
          ) : null
        }
      />

      <ProductSkuWorkspaceSection
        product={product}
        activeSkuCount={activeSkuCount}
        renderSkuActions={(sku) => (
          <>
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
        product={product}
        dictionaries={dictionaries}
        canViewSupplyIdentity={canViewSupplyIdentity}
      />

      <ProductFormDrawer
        key={`${product.id}:${productDrawerOpen ? "open" : "closed"}`}
        open={productDrawerOpen}
        mode="edit"
        product={{
          id: product.id,
          supplierId: product.supplierId,
          code: product.code,
          name: product.name,
          mainImagePath: product.mainImagePath,
          brandName: product.brandName,
          seriesName: product.seriesName,
          categoryCode: product.categoryCode,
          primarySalesSceneCode: product.primarySalesSceneCode,
          supplyGroupCode: product.supplyGroupCode,
          financeCategoryCode: product.financeCategoryCode,
          description: product.description,
          internalSupplyRemark: product.internalSupplyRemark,
        }}
        suppliers={suppliers}
        dictionaries={dictionaries}
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
        key={`${product.id}:${skuDrawerMode ?? "closed"}:${editingSkuId ?? "new"}:${templateSkuId ?? "none"}`}
        open={skuDrawerMode !== null}
        mode={skuDrawerMode ?? "create"}
        productId={product.id}
        productName={product.name}
        supplierName={product.supplier?.name ?? null}
        sku={skuDrawerMode === "edit" && editingSku ? mapSkuToDraft(editingSku) : null}
        templateSku={skuDrawerMode === "create" ? mapSkuToDraft(templateSourceSku) : null}
        redirectTo={currentHref}
        createMode={skuCreateMode}
        upsertAction={upsertProductSkuAction}
        onClose={closeSkuDrawer}
        onSaved={(message) => {
          setNotice({ status: "success", message });
          closeSkuDrawer();
          router.refresh();
        }}
      />

      <MasterDataRecycleDialog
        open={recycleTarget !== null}
        objectName={recycleTarget?.name ?? ""}
        objectTypeLabel={recycleTarget?.kind === "sku" ? "SKU" : "商品"}
        secondaryLabel={recycleTarget?.secondaryLabel ?? ""}
        domainLabel={recycleTarget?.kind === "sku" ? "商品主数据 / SKU" : "商品主数据"}
        updatedAt={recycleTarget?.updatedAt ?? new Date()}
        guard={
          recycleTarget?.guard ?? {
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
    </div>
  );
}
