"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { ProductMainImage } from "@/components/products/product-main-image";
import {
  ProductSupplierField,
  type SupplierOption,
} from "@/components/products/product-supplier-field";
import { ActionBanner } from "@/components/shared/action-banner";
import type { ProductCenterDictionaryOption } from "@/lib/products/metadata";

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
};

type ProductDraft = {
  id: string;
  supplierId: string;
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
};

const drawerOverlayClassName =
  "absolute inset-0 bg-[rgba(15,23,42,0.14)] backdrop-blur-[3px]";

const drawerPanelClassName =
  "absolute inset-y-0 right-0 flex w-full max-w-[44rem] flex-col border-l border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[-18px_0_48px_rgba(15,23,42,0.12)]";

const drawerSectionClassName =
  "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)]";

const drawerInsetClassName =
  "rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-3.5";

function isSuspiciousDictionaryLabel(label: string) {
  const normalized = label.trim();
  return (
    !normalized || /^[?]+$/.test(normalized) || normalized.includes("\ufffd")
  );
}

function getDictionaryDisplayLabel(option: ProductCenterDictionaryOption) {
  return isSuspiciousDictionaryLabel(option.label)
    ? option.code
    : option.label.trim();
}

function renderDictionaryOption(option: ProductCenterDictionaryOption) {
  const label = getDictionaryDisplayLabel(option);
  return option.isActive ? label : `${label} / 停用`;
}

export function ProductFormDrawer({
  open,
  mode,
  product,
  suppliers,
  dictionaries,
  redirectTo,
  canQuickCreateSupplier,
  upsertAction,
  createWithInitialSkuAction,
  createInlineSupplierAction,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  mode: "create" | "edit";
  product?: ProductDraft | null;
  suppliers: SupplierOption[];
  dictionaries: {
    categoryOptions: ProductCenterDictionaryOption[];
    primarySalesSceneOptions: ProductCenterDictionaryOption[];
    supplyGroupOptions: ProductCenterDictionaryOption[];
    financeCategoryOptions: ProductCenterDictionaryOption[];
  };
  redirectTo: string;
  canQuickCreateSupplier: boolean;
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  createWithInitialSkuAction?: (
    formData: FormData,
  ) => Promise<ProductActionResult>;
  createInlineSupplierAction: (
    formData: FormData,
  ) => Promise<InlineSupplierResult>;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [removeMainImage, setRemoveMainImage] = useState(false);
  const isCreateMode = mode === "create";

  const [createProductName, setCreateProductName] = useState(
    product?.name ?? "",
  );
  const [createProductCode, setCreateProductCode] = useState(
    product?.code ?? "",
  );
  const [createBrandName, setCreateBrandName] = useState(
    product?.brandName ?? "",
  );
  const [createSeriesName, setCreateSeriesName] = useState(
    product?.seriesName ?? "",
  );
  const [createSkuName, setCreateSkuName] = useState("");
  const [createDefaultUnitPrice, setCreateDefaultUnitPrice] = useState("");

  const submitAction =
    isCreateMode && createWithInitialSkuAction
      ? createWithInitialSkuAction
      : upsertAction;

  const footerHint = pending
    ? isCreateMode
      ? "正在创建商品。"
      : "正在保存商品。"
    : isCreateMode
      ? "保存后可继续补充更多资料。"
      : "当前只维护商品主档。";

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={isCreateMode ? "关闭新建商品抽屉" : "关闭编辑商品抽屉"}
        onClick={onClose}
        className={drawerOverlayClassName}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isCreateMode ? "新建商品" : "编辑商品"}
        className={drawerPanelClassName}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-3.5 sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                Product
              </p>
              <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                {isCreateMode ? "创建" : "编辑"}
              </span>
            </div>
            <h3 className="text-[1.02rem] font-semibold text-[var(--foreground)]">
              {isCreateMode ? "新建商品" : "编辑商品"}
            </h3>
            <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
              {isCreateMode
                ? "先录入商品名与首个规格。"
                : "围绕商品主档做轻维护。"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] text-[var(--color-sidebar-muted)] transition-colors hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          action={(formData) => {
            startTransition(async () => {
              const result = await submitAction(formData);

              if (result.status === "success") {
                setNotice(null);
                onSaved(result.message);
                return;
              }

              setNotice(result);
            });
          }}
          aria-busy={pending}
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="id" value={product?.id ?? ""} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <fieldset
              disabled={pending}
              className={`space-y-4 ${pending ? "opacity-80" : ""}`}
            >
              <section className={drawerSectionClassName}>
                <div className="space-y-1">
                  <p className="crm-detail-label text-[11px]">
                    {isCreateMode ? "商品基础" : "商品主档"}
                  </p>
                  <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                    {isCreateMode ? "识别信息" : "当前保留字段"}
                  </h4>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">商品名称</span>
                    {isCreateMode ? (
                      <input
                        name="name"
                        value={createProductName}
                        onChange={(event) =>
                          setCreateProductName(event.target.value)
                        }
                        required
                        className="crm-input"
                        placeholder="例如：五粮液·国杯纪念酒"
                      />
                    ) : (
                      <input
                        name="name"
                        required
                        defaultValue={product?.name ?? ""}
                        className="crm-input"
                      />
                    )}
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">商品编码</span>
                    {isCreateMode ? (
                      <input
                        name="code"
                        value={createProductCode}
                        onChange={(event) =>
                          setCreateProductCode(event.target.value)
                        }
                        required
                        className="crm-input"
                        placeholder="例如：WL-GBJNJ-001"
                      />
                    ) : (
                      <input
                        name="code"
                        required
                        defaultValue={product?.code ?? ""}
                        className="crm-input"
                      />
                    )}
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">品牌</span>
                    {isCreateMode ? (
                      <input
                        name="brandName"
                        value={createBrandName}
                        onChange={(event) =>
                          setCreateBrandName(event.target.value)
                        }
                        className="crm-input"
                        placeholder="例如：五粮液"
                      />
                    ) : (
                      <input
                        name="brandName"
                        defaultValue={product?.brandName ?? ""}
                        className="crm-input"
                      />
                    )}
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">系列</span>
                    {isCreateMode ? (
                      <input
                        name="seriesName"
                        value={createSeriesName}
                        onChange={(event) =>
                          setCreateSeriesName(event.target.value)
                        }
                        className="crm-input"
                        placeholder="例如：纪念酒"
                      />
                    ) : (
                      <input
                        name="seriesName"
                        defaultValue={product?.seriesName ?? ""}
                        className="crm-input"
                      />
                    )}
                  </label>
                </div>
              </section>

              {isCreateMode ? (
                <section className={drawerSectionClassName}>
                  <div className="space-y-1">
                    <p className="crm-detail-label text-[11px]">首个规格</p>
                    <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                      先建立最小可卖规格
                    </h4>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="crm-label">规格名称</span>
                      <input
                        name="skuName"
                        value={createSkuName}
                        onChange={(event) =>
                          setCreateSkuName(event.target.value)
                        }
                        required
                        className="crm-input"
                        placeholder="例如：国杯纪念酒 2箱装"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="crm-label">默认售价</span>
                      <input
                        type="number"
                        name="defaultUnitPrice"
                        min="0"
                        step="0.01"
                        value={createDefaultUnitPrice}
                        onChange={(event) =>
                          setCreateDefaultUnitPrice(event.target.value)
                        }
                        required
                        className="crm-input"
                        placeholder="例如：1299"
                      />
                    </label>
                  </div>
                </section>
              ) : null}

              <section className={drawerSectionClassName}>
                <div className="space-y-1">
                  <p className="crm-detail-label text-[11px]">执行供货</p>
                  <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                    轻绑定供应商
                  </h4>
                </div>

                <div className="mt-4">
                  <ProductSupplierField
                    suppliers={suppliers}
                    initialSelectedSupplierId={product?.supplierId ?? ""}
                    disabled={pending}
                    canQuickCreateSupplier={canQuickCreateSupplier}
                    createInlineSupplierAction={createInlineSupplierAction}
                  />
                </div>
              </section>

              <section className={drawerSectionClassName}>
                <div className="space-y-1">
                  <p className="crm-detail-label text-[11px]">商品主图</p>
                  <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                    可选视觉资料
                  </h4>
                </div>

                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
                  <ProductMainImage
                    mainImagePath={
                      removeMainImage ? null : product?.mainImagePath
                    }
                    name={
                      isCreateMode
                        ? createProductName || "新建商品"
                        : (product?.name ?? "商品")
                    }
                    brandName={
                      isCreateMode ? createBrandName : product?.brandName
                    }
                    size="form"
                    className="shrink-0"
                  />

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className={drawerInsetClassName}>
                      <input
                        name="mainImage"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="crm-input file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-shell-surface-soft)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--foreground)]"
                      />
                      <p className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                        支持 JPG、PNG、WEBP。
                      </p>
                    </div>

                    {!isCreateMode && product?.mainImagePath ? (
                      <label className="flex items-center gap-2 text-[13px] text-[var(--color-sidebar-muted)]">
                        <input
                          type="checkbox"
                          name="removeMainImage"
                          value="true"
                          checked={removeMainImage}
                          onChange={(event) =>
                            setRemoveMainImage(event.target.checked)
                          }
                          className="h-4 w-4 rounded border-[var(--color-border)]"
                        />
                        清空当前主图
                      </label>
                    ) : null}
                  </div>
                </div>
              </section>

              {!isCreateMode ? (
                <details className={drawerSectionClassName}>
                  <summary className="cursor-pointer list-none">
                    <div className="space-y-1">
                      <p className="crm-detail-label text-[11px]">更多资料</p>
                      <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                        归类与备注
                      </h4>
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="crm-label">类目</span>
                      <select
                        name="categoryCode"
                        defaultValue={product?.categoryCode ?? ""}
                        className="crm-select"
                      >
                        <option value="">未设置</option>
                        {dictionaries.categoryOptions.map((option) => (
                          <option key={option.code} value={option.code}>
                            {renderDictionaryOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="crm-label">主销售场景</span>
                      <select
                        name="primarySalesSceneCode"
                        defaultValue={product?.primarySalesSceneCode ?? ""}
                        className="crm-select"
                      >
                        <option value="">未设置</option>
                        {dictionaries.primarySalesSceneOptions.map((option) => (
                          <option key={option.code} value={option.code}>
                            {renderDictionaryOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="crm-label">供货归类</span>
                      <select
                        name="supplyGroupCode"
                        defaultValue={product?.supplyGroupCode ?? ""}
                        className="crm-select"
                      >
                        <option value="">未设置</option>
                        {dictionaries.supplyGroupOptions.map((option) => (
                          <option key={option.code} value={option.code}>
                            {renderDictionaryOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2">
                      <span className="crm-label">财务归类</span>
                      <select
                        name="financeCategoryCode"
                        defaultValue={product?.financeCategoryCode ?? ""}
                        className="crm-select"
                      >
                        <option value="">未设置</option>
                        {dictionaries.financeCategoryOptions.map((option) => (
                          <option key={option.code} value={option.code}>
                            {renderDictionaryOption(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="block space-y-2">
                      <span className="crm-label">商品说明</span>
                      <textarea
                        name="description"
                        rows={3}
                        defaultValue={product?.description ?? ""}
                        className="crm-textarea min-h-[5.5rem]"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="crm-label">供货备注</span>
                      <textarea
                        name="internalSupplyRemark"
                        rows={3}
                        defaultValue={product?.internalSupplyRemark ?? ""}
                        className="crm-textarea min-h-[5.5rem]"
                      />
                    </label>
                  </div>
                </details>
              ) : null}
            </fieldset>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-3.5 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              {notice ? (
                <ActionBanner
                  tone={notice.status === "success" ? "success" : "danger"}
                  className="max-w-[32rem]"
                >
                  {notice.message}
                </ActionBanner>
              ) : (
                <p className="text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
                  {footerHint}
                </p>
              )}
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="crm-button crm-button-secondary w-full sm:w-auto"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={pending}
                className="crm-button crm-button-primary w-full sm:w-auto"
              >
                {pending ? "保存中..." : isCreateMode ? "创建商品" : "保存商品"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
