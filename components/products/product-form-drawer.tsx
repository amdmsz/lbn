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
import { cn } from "@/lib/utils";

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
  "absolute inset-0 bg-[rgba(15,23,42,0.14)] backdrop-blur-[6px]";

const drawerPanelClassName =
  "absolute inset-y-0 right-0 flex w-full flex-col border-l border-[var(--color-border-soft)] bg-[rgba(255,255,255,0.96)] shadow-[-18px_0_48px_rgba(15,23,42,0.12)] backdrop-blur-xl";

const drawerSectionClassName =
  "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-4 shadow-[var(--color-shell-shadow-sm)]";

const drawerFeatureSectionClassName =
  "rounded-[1.05rem] border border-[rgba(37,99,235,0.10)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,255,0.98))] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]";

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
  const [selectedCreateSupplier, setSelectedCreateSupplier] =
    useState<SupplierOption | null>(() => {
      if (!product?.supplierId) {
        return null;
      }

      return (
        suppliers.find((supplier) => supplier.id === product.supplierId) ?? null
      );
    });

  const submitAction =
    isCreateMode && createWithInitialSkuAction
      ? createWithInitialSkuAction
      : upsertAction;

  const createChecklist = [
    { label: "商品名称", done: createProductName.trim().length > 0 },
    { label: "商品编码", done: createProductCode.trim().length > 0 },
    { label: "首个规格", done: createSkuName.trim().length > 0 },
    { label: "默认售价", done: createDefaultUnitPrice.trim().length > 0 },
    { label: "供应商", done: Boolean(selectedCreateSupplier) },
  ];
  const createCompletedCount = createChecklist.filter((item) => item.done).length;
  const createCompletionPercent =
    (createCompletedCount / createChecklist.length) * 100;
  const createPreviewName = createProductName.trim() || "未命名商品";
  const createPreviewCode = createProductCode.trim() || "待填写编码";
  const createPreviewSkuName = createSkuName.trim() || "待填写首个规格";
  const createPreviewSupplier =
    selectedCreateSupplier?.name ?? "待绑定供应商";
  const createPreviewUnitPrice = createDefaultUnitPrice.trim()
    ? `¥${createDefaultUnitPrice.trim()}`
    : "待填写售价";

  const footerHint = pending
    ? isCreateMode
      ? "正在创建商品。"
      : "正在保存商品。"
    : isCreateMode
      ? "先建立商品骨架，图片、归类和更多规格可在详情继续完善。"
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
        className={cn(
          drawerPanelClassName,
          isCreateMode ? "max-w-[52rem]" : "max-w-[44rem]",
        )}
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
                ? "先建立商品骨架，再在详情里继续补图、归类与更多规格。"
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
              {isCreateMode ? (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
                  <div className="space-y-4">
                    <section className={drawerFeatureSectionClassName}>
                      <div className="space-y-1">
                        <p className="crm-detail-label text-[11px]">最小建档</p>
                        <h4 className="text-[1rem] font-semibold text-[var(--foreground)]">
                          先把商品骨架建起来
                        </h4>
                        <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                          当前只保留名称、编码、首个规格和供货关系。品牌、系列、主图与归类都降到补充资料里，避免第一次录入被表单淹没。
                        </p>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                        <label className="space-y-2">
                          <span className="crm-label">商品名称</span>
                          <input
                            name="name"
                            value={createProductName}
                            onChange={(event) =>
                              setCreateProductName(event.target.value)
                            }
                            required
                            className="crm-input h-12 text-[15px]"
                            placeholder="例如：五粮液·国杯纪念酒"
                          />
                        </label>

                        <label className="space-y-2">
                          <span className="crm-label">商品编码</span>
                          <input
                            name="code"
                            value={createProductCode}
                            onChange={(event) =>
                              setCreateProductCode(event.target.value)
                            }
                            required
                            className="crm-input h-12"
                            placeholder="例如：WL-GBJNJ-001"
                          />
                        </label>
                      </div>
                    </section>

                    <section className={drawerSectionClassName}>
                      <div className="space-y-1">
                        <p className="crm-detail-label text-[11px]">首个规格</p>
                        <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                          最小可卖单元
                        </h4>
                        <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                          先放一个最常卖的规格，后续再在详情里扩更多 SKU。
                        </p>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_12rem]">
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

                    <section className={drawerSectionClassName}>
                      <div className="space-y-1">
                        <p className="crm-detail-label text-[11px]">供货关系</p>
                        <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                          绑定当前执行供应商
                        </h4>
                        <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                          保持创建入口尽量短，找不到时可直接内联新建供应商。
                        </p>
                      </div>

                      <div className="mt-4">
                        <ProductSupplierField
                          suppliers={suppliers}
                          initialSelectedSupplierId={product?.supplierId ?? ""}
                          disabled={pending}
                          canQuickCreateSupplier={canQuickCreateSupplier}
                          createInlineSupplierAction={createInlineSupplierAction}
                          embedded
                          onSelectedSupplierChange={setSelectedCreateSupplier}
                        />
                      </div>
                    </section>

                    <details className={drawerSectionClassName}>
                      <summary className="cursor-pointer list-none">
                        <div className="space-y-1">
                          <p className="crm-detail-label text-[11px]">补充资料</p>
                          <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                            品牌、主图与归类
                          </h4>
                          <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                            这些字段不会阻塞首轮创建，但可以顺手一起补。
                          </p>
                        </div>
                      </summary>

                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="crm-label">品牌</span>
                            <input
                              name="brandName"
                              value={createBrandName}
                              onChange={(event) =>
                                setCreateBrandName(event.target.value)
                              }
                              className="crm-input"
                              placeholder="例如：五粮液"
                            />
                          </label>

                          <label className="space-y-2">
                            <span className="crm-label">系列</span>
                            <input
                              name="seriesName"
                              value={createSeriesName}
                              onChange={(event) =>
                                setCreateSeriesName(event.target.value)
                              }
                              className="crm-input"
                              placeholder="例如：纪念酒"
                            />
                          </label>

                          <label className="space-y-2">
                            <span className="crm-label">类目</span>
                            <select name="categoryCode" className="crm-select" defaultValue="">
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
                              className="crm-select"
                              defaultValue=""
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
                              className="crm-select"
                              defaultValue=""
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
                              className="crm-select"
                              defaultValue=""
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

                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_13rem]">
                          <div className="space-y-3">
                            <label className="block space-y-2">
                              <span className="crm-label">商品说明</span>
                              <textarea
                                name="description"
                                rows={3}
                                className="crm-textarea min-h-[5.5rem]"
                              />
                            </label>

                            <label className="block space-y-2">
                              <span className="crm-label">供货备注</span>
                              <textarea
                                name="internalSupplyRemark"
                                rows={3}
                                className="crm-textarea min-h-[5.5rem]"
                              />
                            </label>
                          </div>

                          <div className={drawerInsetClassName}>
                            <div className="flex items-start gap-3">
                              <ProductMainImage
                                mainImagePath={null}
                                name={createPreviewName}
                                brandName={createBrandName}
                                size="form"
                                className="shrink-0"
                              />
                              <div className="min-w-0 space-y-1">
                                <p className="text-[12px] font-medium text-[var(--foreground)]">
                                  主图可选
                                </p>
                                <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                                  创建时上传，或先跳过，后面在详情里再补。
                                </p>
                              </div>
                            </div>

                            <input
                              name="mainImage"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="crm-input mt-3 file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-shell-surface-soft)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--foreground)]"
                            />
                          </div>
                        </div>
                      </div>
                    </details>
                  </div>

                  <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
                    <section className={drawerSectionClassName}>
                      <div className="flex items-start gap-3">
                        <ProductMainImage
                          mainImagePath={null}
                          name={createPreviewName}
                          brandName={createBrandName}
                          size="form"
                          className="h-16 w-16 shrink-0"
                        />
                        <div className="min-w-0 space-y-1">
                          <p className="crm-detail-label text-[11px]">创建预览</p>
                          <h4 className="truncate text-[0.98rem] font-semibold text-[var(--foreground)]">
                            {createPreviewName}
                          </h4>
                          <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                            {createPreviewCode}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-shell-surface-soft)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-accent-primary)] transition-[width] duration-300"
                            style={{ width: `${createCompletionPercent}%` }}
                          />
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                          已完成 {createCompletedCount}/{createChecklist.length} 个必要项
                        </p>
                      </div>

                      <div className="mt-4 space-y-2">
                        {createChecklist.map((item) => (
                          <div
                            key={item.label}
                            className="flex items-center justify-between gap-3 rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5"
                          >
                            <span className="text-[12px] font-medium text-[var(--foreground)]">
                              {item.label}
                            </span>
                            <span
                              className={cn(
                                "inline-flex h-2.5 w-2.5 rounded-full",
                                item.done
                                  ? "bg-[var(--color-success)]"
                                  : "bg-[var(--color-border-strong)]",
                              )}
                            />
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className={drawerSectionClassName}>
                      <p className="crm-detail-label text-[11px]">创建后下一步</p>
                      <div className="mt-3 space-y-2.5 text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
                        <div className="rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5">
                          1. 进入商品详情补主图、类目和经营说明。
                        </div>
                        <div className="rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5">
                          2. 在 SKU 区继续扩更多包装、默认价和供货能力。
                        </div>
                        <div className="rounded-[0.85rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5">
                          3. 如果供应商还不完整，可回到详情里继续轻维护。
                        </div>
                      </div>

                      <div className="mt-4 rounded-[0.85rem] border border-dashed border-[rgba(37,99,235,0.16)] bg-[rgba(37,99,235,0.04)] px-3 py-2.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                        当前预览：{createPreviewSkuName} / {createPreviewUnitPrice} / {createPreviewSupplier}
                      </div>
                    </section>
                  </aside>
                </div>
              ) : (
                <>
                  <section className={drawerSectionClassName}>
                    <div className="space-y-1">
                      <p className="crm-detail-label text-[11px]">商品主档</p>
                      <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                        当前保留字段
                      </h4>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="crm-label">商品名称</span>
                        <input
                          name="name"
                          required
                          defaultValue={product?.name ?? ""}
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">商品编码</span>
                        <input
                          name="code"
                          required
                          defaultValue={product?.code ?? ""}
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">品牌</span>
                        <input
                          name="brandName"
                          defaultValue={product?.brandName ?? ""}
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">系列</span>
                        <input
                          name="seriesName"
                          defaultValue={product?.seriesName ?? ""}
                          className="crm-input"
                        />
                      </label>
                    </div>
                  </section>

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
                        mainImagePath={removeMainImage ? null : product?.mainImagePath}
                        name={product?.name ?? "商品"}
                        brandName={product?.brandName}
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

                        {product?.mainImagePath ? (
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
                </>
              )}

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
