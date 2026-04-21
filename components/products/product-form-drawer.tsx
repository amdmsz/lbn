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

function isSuspiciousDictionaryLabel(label: string) {
  const normalized = label.trim();
  return !normalized || /^[?]+$/.test(normalized) || normalized.includes("\ufffd");
}

function getDictionaryDisplayLabel(option: ProductCenterDictionaryOption) {
  return isSuspiciousDictionaryLabel(option.label) ? option.code : option.label.trim();
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
  createWithInitialSkuAction?: (formData: FormData) => Promise<ProductActionResult>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [removeMainImage, setRemoveMainImage] = useState(false);
  const isCreateMode = mode === "create";

  const [createProductName, setCreateProductName] = useState(product?.name ?? "");
  const [createProductCode, setCreateProductCode] = useState(product?.code ?? "");
  const [createBrandName, setCreateBrandName] = useState(product?.brandName ?? "");
  const [createSeriesName, setCreateSeriesName] = useState(product?.seriesName ?? "");
  const [createSkuName, setCreateSkuName] = useState("");
  const [createDefaultUnitPrice, setCreateDefaultUnitPrice] = useState("");

  const submitAction =
    isCreateMode && createWithInitialSkuAction ? createWithInitialSkuAction : upsertAction;

  const footerHint = pending
    ? isCreateMode
      ? "正在创建商品与首个规格。"
      : "正在保存商品。"
    : isCreateMode
      ? "保存后会直接得到一个可卖商品，后续规格再在详情里继续扩展。"
      : "商品母档优先维护高频字段，其余信息继续放在折叠区。";

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label={isCreateMode ? "关闭新建商品抽屉" : "关闭编辑商品抽屉"}
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,23,42,0.22)] backdrop-blur-[1.5px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={isCreateMode ? "新建商品" : "编辑商品"}
        className="absolute inset-y-0 right-0 flex w-full max-w-[44rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.988)] shadow-[-18px_0_40px_rgba(15,23,42,0.1)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-3.5 sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                商品
              </p>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-black/52">
                {isCreateMode ? "创建" : "编辑"}
              </span>
            </div>
            <h3 className="text-[1.05rem] font-semibold text-black/84">
              {isCreateMode ? "新建商品并录入首个规格" : "编辑商品"}
            </h3>
            <p className="text-[13px] leading-5 text-black/56">
              {isCreateMode
                ? "先建商品母档，再补一个最小可卖规格。"
                : "这里只维护商品母档，不再承载已删除的规格参数字段。"}
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
          encType="multipart/form-data"
          aria-busy={pending}
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="id" value={product?.id ?? ""} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          {isCreateMode ? (
            <>
              <input type="hidden" name="categoryCode" value={product?.categoryCode ?? ""} />
              <input
                type="hidden"
                name="primarySalesSceneCode"
                value={product?.primarySalesSceneCode ?? ""}
              />
              <input type="hidden" name="supplyGroupCode" value={product?.supplyGroupCode ?? ""} />
              <input
                type="hidden"
                name="financeCategoryCode"
                value={product?.financeCategoryCode ?? ""}
              />
              <input type="hidden" name="description" value={product?.description ?? ""} />
              <input
                type="hidden"
                name="internalSupplyRemark"
                value={product?.internalSupplyRemark ?? ""}
              />
              <input type="hidden" name="codSupported" value="false" />
              <input type="hidden" name="insuranceSupported" value="false" />
              <input type="hidden" name="defaultInsuranceAmount" value="0" />
              <input type="hidden" name="name" value={createProductName} />
              <input type="hidden" name="code" value={createProductCode} />
              <input type="hidden" name="brandName" value={createBrandName} />
              <input type="hidden" name="seriesName" value={createSeriesName} />
              <input type="hidden" name="skuName" value={createSkuName} />
              <input type="hidden" name="defaultUnitPrice" value={createDefaultUnitPrice} />
            </>
          ) : null}

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <fieldset disabled={pending} className={`space-y-3.5 ${pending ? "opacity-80" : ""}`}>
              <section className="rounded-[1rem] border border-black/8 bg-[linear-gradient(180deg,rgba(248,249,251,0.84),rgba(255,255,255,0.94))] p-3.5">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                    {isCreateMode ? "商品主档" : "商品基础"}
                  </p>
                  <p className="text-[12px] leading-5 text-black/52">
                    先维护商品识别信息，supplier 继续保留为执行真相，但不再抢首屏。
                  </p>
                </div>

                <div className="mt-3.5 grid gap-3.5 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">商品名称</span>
                    {isCreateMode ? (
                      <input
                        value={createProductName}
                        onChange={(event) => setCreateProductName(event.target.value)}
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
                        value={createProductCode}
                        onChange={(event) => setCreateProductCode(event.target.value)}
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
                        value={createBrandName}
                        onChange={(event) => setCreateBrandName(event.target.value)}
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
                        value={createSeriesName}
                        onChange={(event) => setCreateSeriesName(event.target.value)}
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

                  <div className="space-y-2.5 xl:col-span-2">
                    <span className="crm-label">商品主图</span>
                    <div className="rounded-[0.95rem] border border-black/7 bg-white/88 p-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <ProductMainImage
                          mainImagePath={removeMainImage ? null : product?.mainImagePath}
                          name={
                            isCreateMode
                              ? createProductName || "新建商品"
                              : product?.name ?? "商品"
                          }
                          brandName={isCreateMode ? createBrandName : product?.brandName}
                          size="form"
                        />

                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div className="space-y-1.5">
                            <input
                              name="mainImage"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="crm-input file:mr-3 file:rounded-full file:border-0 file:bg-black/[0.05] file:px-3 file:py-2 file:text-sm file:font-medium file:text-black/72"
                            />
                            <p className="text-[12px] leading-5 text-black/48">
                              单张主图会显示在首页与详情头部，支持 JPG、PNG、WEBP。
                            </p>
                          </div>

                          {!isCreateMode && product?.mainImagePath ? (
                            <label className="flex items-center gap-2 text-[13px] text-black/58">
                              <input
                                type="checkbox"
                                name="removeMainImage"
                                value="true"
                                checked={removeMainImage}
                                onChange={(event) => setRemoveMainImage(event.target.checked)}
                                className="h-4 w-4 rounded border-black/20"
                              />
                              清空当前主图
                            </label>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="xl:col-span-2">
                    <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(250,251,253,0.88)] p-3">
                      <div className="space-y-1">
                        <p className="text-[12px] font-semibold text-black/76">执行供货</p>
                        <p className="text-[12px] leading-5 text-black/50">
                          supplierId 继续保留为执行真相，这里只做轻绑定。
                        </p>
                      </div>
                      <div className="mt-3">
                        <ProductSupplierField
                          suppliers={suppliers}
                          initialSelectedSupplierId={product?.supplierId ?? ""}
                          disabled={pending}
                          canQuickCreateSupplier={canQuickCreateSupplier}
                          createInlineSupplierAction={createInlineSupplierAction}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {isCreateMode ? (
                <section className="rounded-[1rem] border border-black/7 bg-[rgba(252,252,253,0.92)] p-3.5">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                      首个销售规格
                    </p>
                    <p className="text-[12px] leading-5 text-black/52">
                      只保留最小可卖信息，已删除的规格编码、规格摘要、单位、容量、度数、包装形式不再录入。
                    </p>
                  </div>

                  <div className="mt-3.5 grid gap-3.5 xl:grid-cols-2">
                    <label className="space-y-2">
                      <span className="crm-label">规格名称</span>
                      <input
                        value={createSkuName}
                        onChange={(event) => setCreateSkuName(event.target.value)}
                        required
                        className="crm-input"
                        placeholder="例如：国杯纪念酒 2箱装"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="crm-label">默认售价</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={createDefaultUnitPrice}
                        onChange={(event) => setCreateDefaultUnitPrice(event.target.value)}
                        required
                        className="crm-input"
                        placeholder="例如：1299"
                      />
                    </label>
                  </div>
                </section>
              ) : (
                <details className="rounded-[1rem] border border-black/7 bg-[rgba(252,252,253,0.92)] p-3.5">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-black/78">
                    更多资料
                  </summary>
                  <p className="mt-2 text-[12px] leading-5 text-black/52">
                    分类与备注继续后置维护，但不再包含已删除的 SKU 规格参数字段。
                  </p>

                  <div className="mt-3.5 grid gap-3.5 xl:grid-cols-2">
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

                  <div className="mt-3.5 space-y-3.5">
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
                      <span className="crm-label">内部供货备注</span>
                      <textarea
                        name="internalSupplyRemark"
                        rows={3}
                        defaultValue={product?.internalSupplyRemark ?? ""}
                        className="crm-textarea min-h-[5.5rem]"
                      />
                    </label>
                  </div>
                </details>
              )}
            </fieldset>
          </div>

          <div className="flex flex-col gap-3 border-t border-black/6 bg-[rgba(250,250,252,0.92)] px-5 py-3.5 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              {notice ? (
                <ActionBanner
                  tone={notice.status === "success" ? "success" : "danger"}
                  className="max-w-[32rem]"
                >
                  {notice.message}
                </ActionBanner>
              ) : (
                <div className="flex items-start gap-2 text-[13px] leading-5 text-black/56">
                  <span
                    className={`mt-[0.42rem] h-1.5 w-1.5 shrink-0 rounded-full ${
                      pending ? "animate-pulse bg-[var(--color-accent)]" : "bg-black/20"
                    }`}
                  />
                  <span>{footerHint}</span>
                </div>
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
                {pending
                  ? "保存中..."
                  : isCreateMode
                    ? "创建商品与首个规格"
                    : "保存商品"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
