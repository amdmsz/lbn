"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { ActionBanner } from "@/components/shared/action-banner";

type ProductActionResult = {
  status: "success" | "error";
  message: string;
};

export type ProductSkuDraft = {
  id: string;
  skuName: string;
  defaultUnitPrice: string;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: string;
  enabled: boolean;
};

export function ProductSkuDrawer({
  open,
  mode,
  productId,
  sku,
  templateSku = null,
  productName = "",
  supplierName = null,
  redirectTo,
  createMode = "quick",
  upsertAction,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  mode: "create" | "edit";
  productId: string;
  sku?: ProductSkuDraft | null;
  templateSku?: ProductSkuDraft | null;
  productName?: string;
  supplierName?: string | null;
  redirectTo: string;
  createMode?: "quick" | "advanced";
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(false);
  const hasQuickTemplate = Boolean(templateSku);
  const initialMode =
    mode === "edit" ? "advanced" : hasQuickTemplate ? createMode : "advanced";
  const [activeCreateMode, setActiveCreateMode] = useState<"quick" | "advanced">(initialMode);
  const baseSku = mode === "edit" ? sku ?? null : templateSku;

  const [quickSkuName, setQuickSkuName] = useState(baseSku?.skuName ?? "");
  const [quickDefaultUnitPrice, setQuickDefaultUnitPrice] = useState(
    baseSku?.defaultUnitPrice ?? "",
  );
  const [quickCodSupported, setQuickCodSupported] = useState(
    String(baseSku?.codSupported ?? false),
  );
  const [quickInsuranceSupported, setQuickInsuranceSupported] = useState(
    String(baseSku?.insuranceSupported ?? false),
  );
  const [quickDefaultInsuranceAmount, setQuickDefaultInsuranceAmount] = useState(
    baseSku?.defaultInsuranceAmount ?? "0",
  );

  const fullFormDraft = mode === "edit" ? sku ?? null : baseSku;
  const isQuickCreate = mode === "create" && activeCreateMode === "quick" && hasQuickTemplate;
  const quickCreateLabel = hasQuickTemplate ? "复制为新规格" : "新增首个规格";
  const advancedCreateLabel = "高级新增 SKU";
  const footerHint = pending
    ? "正在保存规格，请保持抽屉打开。"
    : isQuickCreate
      ? "快捷模式只保留高频字段，低频配置后置到更多设置。"
      : mode === "create"
        ? "高级新增 SKU 继续保留完整的剩余经营字段。"
        : "这里只维护当前保留的 SKU 主字段。";

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭 SKU 抽屉"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,23,42,0.22)] backdrop-blur-[1.5px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "新增规格" : "编辑规格"}
        className="absolute inset-y-0 right-0 flex w-full max-w-[42rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.988)] shadow-[-18px_0_40px_rgba(15,23,42,0.1)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-3.5 sm:px-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                SKU
              </p>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-black/52">
                {mode === "create"
                  ? isQuickCreate
                    ? quickCreateLabel
                    : advancedCreateLabel
                  : "编辑"}
              </span>
            </div>
            <h3 className="text-[1.05rem] font-semibold text-black/84">
              {mode === "create"
                ? isQuickCreate
                  ? quickCreateLabel
                  : advancedCreateLabel
                : "编辑规格"}
            </h3>
            <p className="max-w-[32rem] text-[13px] leading-5 text-black/56">
              {isQuickCreate
                ? "以当前规格为模板复制销售变体，已删除的规格参数字段不再出现。"
                : "当前 SKU 只保留名称、售价和履约相关字段。"}
            </p>
            {mode === "create" && hasQuickTemplate ? (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[12px] leading-5">
                <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 font-medium text-black/58">
                  {activeCreateMode === "quick" ? "默认高频录入" : "完整剩余字段"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setActiveCreateMode((current) =>
                      current === "quick" ? "advanced" : "quick",
                    )
                  }
                  className="font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-strong)]"
                >
                  {activeCreateMode === "quick" ? advancedCreateLabel : quickCreateLabel}
                </button>
              </div>
            ) : null}
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
              const result = await upsertAction(formData);
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
          <input type="hidden" name="id" value={mode === "edit" ? sku?.id ?? "" : ""} />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <fieldset disabled={pending} className={`space-y-3.5 ${pending ? "opacity-80" : ""}`}>
              {isQuickCreate ? (
                <>
                  <input type="hidden" name="skuName" value={quickSkuName} />
                  <input type="hidden" name="defaultUnitPrice" value={quickDefaultUnitPrice} />
                  <input type="hidden" name="codSupported" value={quickCodSupported} />
                  <input
                    type="hidden"
                    name="insuranceSupported"
                    value={quickInsuranceSupported}
                  />
                  <input
                    type="hidden"
                    name="defaultInsuranceAmount"
                    value={quickDefaultInsuranceAmount}
                  />

                  <section className="rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.72)] px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-5 text-black/58">
                      <span className="font-medium text-black/76">{productName || "当前商品"}</span>
                      {templateSku ? (
                        <>
                          <span className="text-black/24">·</span>
                          <span>模板 {templateSku.skuName}</span>
                        </>
                      ) : null}
                      {supplierName ? (
                        <>
                          <span className="text-black/24">·</span>
                          <span>执行供货 {supplierName}</span>
                        </>
                      ) : null}
                    </div>
                  </section>

                  <section className="rounded-[1rem] border border-black/7 bg-[rgba(252,252,253,0.92)] p-3.5">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                        新规格内容
                      </p>
                      <p className="text-[13px] leading-5 text-black/56">
                        复制模式只保留高频销售字段，不再维护已删除的规格参数。
                      </p>
                    </div>

                    <div className="mt-3.5 grid gap-3.5">
                      <label className="space-y-2">
                        <span className="crm-label">规格名称</span>
                        <input
                          value={quickSkuName}
                          onChange={(event) => setQuickSkuName(event.target.value)}
                          className="crm-input"
                          placeholder="例如：国杯纪念酒 2箱装"
                          required
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">默认售价</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={quickDefaultUnitPrice}
                          onChange={(event) => setQuickDefaultUnitPrice(event.target.value)}
                          className="crm-input"
                          required
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[1rem] border border-black/7 bg-[rgba(250,251,253,0.9)] p-3.5">
                    <button
                      type="button"
                      onClick={() => setMoreSettingsOpen((current) => !current)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                          更多设置
                        </p>
                        <p className="text-[13px] leading-5 text-black/56">
                          只在需要时调整 COD、保价与默认保价金额。
                        </p>
                      </div>
                      {moreSettingsOpen ? (
                        <ChevronUp className="h-4 w-4 text-black/44" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-black/44" />
                      )}
                    </button>

                    {moreSettingsOpen ? (
                      <div className="mt-3.5 grid gap-3.5 xl:grid-cols-2">
                        <label className="space-y-2">
                          <span className="crm-label">支持货到付款</span>
                          <select
                            value={quickCodSupported}
                            onChange={(event) => setQuickCodSupported(event.target.value)}
                            className="crm-select"
                          >
                            <option value="false">否</option>
                            <option value="true">是</option>
                          </select>
                        </label>

                        <label className="space-y-2">
                          <span className="crm-label">支持保价</span>
                          <select
                            value={quickInsuranceSupported}
                            onChange={(event) => setQuickInsuranceSupported(event.target.value)}
                            className="crm-select"
                          >
                            <option value="false">否</option>
                            <option value="true">是</option>
                          </select>
                        </label>

                        <label className="space-y-2 xl:col-span-2">
                          <span className="crm-label">默认保价金额</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={quickDefaultInsuranceAmount}
                            onChange={(event) => setQuickDefaultInsuranceAmount(event.target.value)}
                            className="crm-input"
                          />
                        </label>
                      </div>
                    ) : null}
                  </section>
                </>
              ) : (
                <>
                  <section className="rounded-[1rem] border border-black/8 bg-[linear-gradient(180deg,rgba(248,249,251,0.84),rgba(255,255,255,0.94))] p-3.5">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                        规格基础
                      </p>
                      <p className="text-[13px] leading-5 text-black/56">
                        已删除的编码、摘要、单位、容量、度数、包装字段不会再出现。
                      </p>
                    </div>

                    <div className="mt-3.5 grid gap-3.5 xl:grid-cols-2">
                      <label className="space-y-2 xl:col-span-2">
                        <span className="crm-label">规格名称</span>
                        <input
                          name="skuName"
                          required
                          defaultValue={fullFormDraft?.skuName ?? ""}
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">默认售价</span>
                        <input
                          type="number"
                          name="defaultUnitPrice"
                          min="0"
                          step="0.01"
                          required
                          defaultValue={fullFormDraft?.defaultUnitPrice ?? ""}
                          className="crm-input"
                        />
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">默认保价金额</span>
                        <input
                          type="number"
                          name="defaultInsuranceAmount"
                          min="0"
                          step="0.01"
                          defaultValue={fullFormDraft?.defaultInsuranceAmount ?? "0"}
                          className="crm-input"
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[1rem] border border-black/7 bg-[rgba(250,251,253,0.9)] p-3.5">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                        履约能力
                      </p>
                      <p className="text-[13px] leading-5 text-black/56">
                        仅保留 COD 与保价相关的剩余经营字段。
                      </p>
                    </div>

                    <div className="mt-3.5 grid gap-3.5 xl:grid-cols-2">
                      <label className="space-y-2">
                        <span className="crm-label">支持货到付款</span>
                        <select
                          name="codSupported"
                          defaultValue={String(fullFormDraft?.codSupported ?? false)}
                          className="crm-select"
                        >
                          <option value="false">否</option>
                          <option value="true">是</option>
                        </select>
                      </label>

                      <label className="space-y-2">
                        <span className="crm-label">支持保价</span>
                        <select
                          name="insuranceSupported"
                          defaultValue={String(fullFormDraft?.insuranceSupported ?? false)}
                          className="crm-select"
                        >
                          <option value="false">否</option>
                          <option value="true">是</option>
                        </select>
                      </label>
                    </div>
                  </section>
                </>
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
                {pending ? "保存中..." : mode === "create" ? "创建规格" : "保存规格"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
