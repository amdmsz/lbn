"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { ActionBanner } from "@/components/shared/action-banner";

type ProductActionResult = {
  status: "success" | "error";
  message: string;
};

type ProductSkuDraft = {
  id: string;
  skuCode: string;
  skuName: string;
  specText: string;
  unit: string;
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
  redirectTo,
  upsertAction,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  mode: "create" | "edit";
  productId: string;
  sku?: ProductSkuDraft | null;
  redirectTo: string;
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);

  if (!open) {
    return null;
  }

  const footerHint = pending
    ? "正在保存 SKU 主数据，请保持当前抽屉打开。"
    : mode === "create"
      ? "先补齐 SKU 身份，再确认价格和履约能力，避免字段同权平铺。"
      : "这里维护的是 SKU 主数据，价格与能力配置继续附着在同一个 SKU 档案里。";

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
        aria-label={mode === "create" ? "新建 SKU" : "编辑 SKU"}
        className="absolute inset-y-0 right-0 flex w-full max-w-[43rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.985)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                SKU
              </p>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-black/52">
                {mode === "create" ? "创建" : "编辑"}
              </span>
            </div>
            <h3 className="text-[1.05rem] font-semibold text-black/84">
              {mode === "create" ? "新建 SKU" : "编辑 SKU"}
            </h3>
            <p className="max-w-[32rem] text-[13px] leading-5 text-black/56">
              这里集中维护 SKU 身份、价格与履约能力。默认先确认身份字段，再处理价格和低频能力配置。
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
          <input type="hidden" name="id" value={sku?.id ?? ""} />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <fieldset disabled={pending} className={`space-y-4 ${pending ? "opacity-80" : ""}`}>
              <section className="rounded-[1rem] border border-black/8 bg-[linear-gradient(180deg,rgba(248,249,251,0.88),rgba(255,255,255,0.94))] p-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                    SKU 身份
                  </p>
                  <p className="text-[13px] leading-5 text-black/56">
                    这组字段决定 SKU 的识别方式与销售侧呈现，优先级最高，先于价格和能力配置。
                  </p>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">SKU 编码</span>
                    <input name="skuCode" required defaultValue={sku?.skuCode ?? ""} className="crm-input" />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">SKU 名称</span>
                    <input name="skuName" required defaultValue={sku?.skuName ?? ""} className="crm-input" />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">规格</span>
                    <input name="specText" required defaultValue={sku?.specText ?? ""} className="crm-input" />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">单位</span>
                    <input name="unit" required defaultValue={sku?.unit ?? ""} className="crm-input" />
                  </label>
                </div>
              </section>

              <section className="rounded-[1rem] border border-black/7 bg-[rgba(252,252,253,0.92)] p-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                    价格
                  </p>
                  <p className="text-[13px] leading-5 text-black/56">
                    默认单价与保价金额属于二级配置，用于后续执行和报价，不需要与身份字段抢同一层级。
                  </p>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">默认单价</span>
                    <input
                      type="number"
                      name="defaultUnitPrice"
                      min="0"
                      step="0.01"
                      required
                      defaultValue={sku?.defaultUnitPrice ?? ""}
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
                      defaultValue={sku?.defaultInsuranceAmount ?? "0"}
                      className="crm-input"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-[1rem] border border-black/7 bg-[rgba(250,251,253,0.9)] p-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                    能力
                  </p>
                  <p className="text-[13px] leading-5 text-black/56">
                    货到付款与保价是履约侧能力开关，默认后置，避免和 SKU 主身份一起同时发声。
                  </p>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">支持货到付款</span>
                    <select
                      name="codSupported"
                      defaultValue={String(sku?.codSupported ?? false)}
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
                      defaultValue={String(sku?.insuranceSupported ?? false)}
                      className="crm-select"
                    >
                      <option value="false">否</option>
                      <option value="true">是</option>
                    </select>
                  </label>
                </div>
              </section>
            </fieldset>
          </div>

          <div className="flex flex-col gap-3 border-t border-black/6 bg-[rgba(250,250,252,0.92)] px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
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
                {pending ? "保存中..." : mode === "create" ? "创建 SKU" : "保存 SKU"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
