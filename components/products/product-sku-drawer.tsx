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

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭 SKU 抽屉"
        onClick={onClose}
        className="absolute inset-0 bg-black/24"
      />

      <div className="absolute inset-y-0 right-0 flex w-full max-w-[44rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.98)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
              SKU
            </p>
            <h3 className="text-lg font-semibold text-black/84">
              {mode === "create" ? "新建 SKU" : "编辑 SKU"}
            </h3>
            <p className="text-sm text-black/56">规格、价格、货到付款和保价能力都在这里维护。</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-white/90 text-black/50"
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
          className="flex min-h-0 flex-1 flex-col"
        >
          <input type="hidden" name="id" value={sku?.id ?? ""} />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
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

              {notice ? (
                <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
                  {notice.message}
                </ActionBanner>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/6 px-4 py-4 sm:px-6">
            <button type="button" onClick={onClose} className="crm-button crm-button-secondary w-full sm:w-auto">
              取消
            </button>
            <button type="submit" disabled={pending} className="crm-button crm-button-primary w-full sm:w-auto">
              {pending ? "保存中..." : mode === "create" ? "创建 SKU" : "保存 SKU"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
