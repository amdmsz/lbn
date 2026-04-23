"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { ActionBanner } from "@/components/shared/action-banner";
import { cn } from "@/lib/utils";

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

const drawerOverlayClassName =
  "absolute inset-0 bg-[rgba(15,23,42,0.14)] backdrop-blur-[3px]";

const drawerPanelClassName =
  "absolute inset-y-0 right-0 flex w-full max-w-[42rem] flex-col border-l border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[-18px_0_48px_rgba(15,23,42,0.12)]";

const drawerSectionClassName =
  "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)]";

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
  const baseDraft = mode === "edit" ? (sku ?? null) : templateSku;
  const [moreSettingsOpen, setMoreSettingsOpen] = useState(
    mode === "edit" || createMode === "advanced" || !templateSku,
  );

  const footerHint = pending
    ? "正在保存规格。"
    : mode === "create"
      ? "先保存规格，其他设置按需展开。"
      : "当前只维护规格主字段。";

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭 SKU 抽屉"
        onClick={onClose}
        className={drawerOverlayClassName}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "新增规格" : "编辑规格"}
        className={drawerPanelClassName}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-3.5 sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                SKU
              </p>
              <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                {mode === "create" ? "创建" : "编辑"}
              </span>
              {mode === "create" && templateSku ? (
                <span className="rounded-full border border-[rgba(79,125,247,0.14)] bg-[rgba(79,125,247,0.08)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-accent-strong)]">
                  基于模板
                </span>
              ) : null}
            </div>
            <h3 className="text-[1.02rem] font-semibold text-[var(--foreground)]">
              {mode === "create" ? "新增规格" : "编辑规格"}
            </h3>
            <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
              {mode === "create"
                ? "围绕规格名与售价完成录入。"
                : "围绕当前规格做轻维护。"}
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
          <input
            type="hidden"
            name="id"
            value={mode === "edit" ? (sku?.id ?? "") : ""}
          />
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <fieldset
              disabled={pending}
              className={`space-y-4 ${pending ? "opacity-80" : ""}`}
            >
              <section className={drawerSectionClassName}>
                <div className="space-y-1">
                  <p className="crm-detail-label text-[11px]">规格基础</p>
                  <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                    当前可售规格
                  </h4>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                    {productName || "当前商品"}
                  </span>
                  {templateSku ? (
                    <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                      模板 {templateSku.skuName}
                    </span>
                  ) : null}
                  {supplierName ? (
                    <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                      {supplierName}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-2 md:col-span-2">
                    <span className="crm-label">规格名称</span>
                    <input
                      name="skuName"
                      required
                      defaultValue={baseDraft?.skuName ?? ""}
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
                      required
                      defaultValue={baseDraft?.defaultUnitPrice ?? ""}
                      className="crm-input"
                      placeholder="例如：1299"
                    />
                  </label>
                </div>
              </section>

              <section className={drawerSectionClassName}>
                <button
                  type="button"
                  onClick={() => setMoreSettingsOpen((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div className="space-y-1">
                    <p className="crm-detail-label text-[11px]">更多设置</p>
                    <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                      COD 与保价
                    </h4>
                  </div>
                  {moreSettingsOpen ? (
                    <ChevronUp className="h-4 w-4 text-[var(--color-sidebar-muted)]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--color-sidebar-muted)]" />
                  )}
                </button>

                <div
                  className={cn(
                    "mt-4 grid gap-3 md:grid-cols-2",
                    !moreSettingsOpen && "hidden",
                  )}
                >
                  <label className="space-y-2">
                    <span className="crm-label">支持货到付款</span>
                    <select
                      name="codSupported"
                      defaultValue={String(baseDraft?.codSupported ?? false)}
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
                      defaultValue={String(
                        baseDraft?.insuranceSupported ?? false,
                      )}
                      className="crm-select"
                    >
                      <option value="false">否</option>
                      <option value="true">是</option>
                    </select>
                  </label>

                  <label className="space-y-2 md:col-span-2">
                    <span className="crm-label">默认保价金额</span>
                    <input
                      type="number"
                      name="defaultInsuranceAmount"
                      min="0"
                      step="0.01"
                      defaultValue={baseDraft?.defaultInsuranceAmount ?? "0"}
                      className="crm-input"
                    />
                  </label>
                </div>
              </section>
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
                {pending
                  ? "保存中..."
                  : mode === "create"
                    ? "创建规格"
                    : "保存规格"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
