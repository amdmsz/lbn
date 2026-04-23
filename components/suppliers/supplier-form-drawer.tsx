"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { ActionBanner } from "@/components/shared/action-banner";

type SupplierActionResult = {
  status: "success" | "error";
  message: string;
};

type SupplierDraft = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  remark: string | null;
};

const drawerOverlayClassName =
  "absolute inset-0 bg-[rgba(15,23,42,0.14)] backdrop-blur-[3px]";

const drawerPanelClassName =
  "absolute inset-y-0 right-0 flex w-full max-w-[42rem] flex-col border-l border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[-18px_0_48px_rgba(15,23,42,0.12)]";

const drawerSectionClassName =
  "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)]";

export function SupplierFormDrawer({
  open,
  mode,
  supplier,
  redirectTo,
  upsertAction,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  mode: "create" | "edit";
  supplier?: SupplierDraft | null;
  redirectTo: string;
  upsertAction: (formData: FormData) => Promise<SupplierActionResult>;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<SupplierActionResult | null>(null);

  if (!open) {
    return null;
  }

  const footerHint = pending
    ? "正在保存供应商。"
    : mode === "create"
      ? "先确认主体信息，再补联系补充。"
      : "当前只维护供应商主档。";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭供应商抽屉"
        onClick={onClose}
        className={drawerOverlayClassName}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "新建供应商" : "编辑供应商"}
        className={drawerPanelClassName}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-3.5 sm:px-6">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                Supplier
              </p>
              <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                {mode === "create" ? "创建" : "编辑"}
              </span>
            </div>
            <h3 className="text-[1.02rem] font-semibold text-[var(--foreground)]">
              {mode === "create" ? "新建供应商" : "编辑供应商"}
            </h3>
            <p className="text-[12.5px] leading-5 text-[var(--color-sidebar-muted)]">
              保持为商品域的轻量次级主数据。
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
          <input type="hidden" name="id" value={supplier?.id ?? ""} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <fieldset
              disabled={pending}
              className={`space-y-4 ${pending ? "opacity-80" : ""}`}
            >
              <section className={drawerSectionClassName}>
                <div className="space-y-1">
                  <p className="crm-detail-label text-[11px]">主体信息</p>
                  <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                    编码与名称
                  </h4>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">供应商编码</span>
                    <input
                      name="code"
                      required
                      defaultValue={supplier?.code ?? ""}
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">供应商名称</span>
                    <input
                      name="name"
                      required
                      defaultValue={supplier?.name ?? ""}
                      className="crm-input"
                    />
                  </label>
                </div>
              </section>

              <section className={drawerSectionClassName}>
                <div className="space-y-1">
                  <p className="crm-detail-label text-[11px]">联系补充</p>
                  <h4 className="text-[0.98rem] font-semibold text-[var(--foreground)]">
                    联系人与备注
                  </h4>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="crm-label">联系人</span>
                    <input
                      name="contactName"
                      defaultValue={supplier?.contactName ?? ""}
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">联系电话</span>
                    <input
                      name="contactPhone"
                      defaultValue={supplier?.contactPhone ?? ""}
                      className="crm-input"
                    />
                  </label>
                </div>

                <label className="mt-4 block space-y-2">
                  <span className="crm-label">备注</span>
                  <textarea
                    name="remark"
                    rows={4}
                    defaultValue={supplier?.remark ?? ""}
                    className="crm-textarea min-h-[7rem]"
                  />
                </label>
              </section>
            </fieldset>
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
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
                    ? "创建供应商"
                    : "保存供应商"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
