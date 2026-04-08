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

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭供货商抽屉"
        onClick={onClose}
        className="absolute inset-0 bg-black/24"
      />

      <div className="absolute inset-y-0 right-0 flex w-full max-w-[42rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.98)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
              供货商
            </p>
            <h3 className="text-lg font-semibold text-black/84">
              {mode === "create" ? "新增供货商" : "编辑供货商"}
            </h3>
            <p className="text-sm text-black/56">供货商是商品域次级能力，默认保持轻维护即可。</p>
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
          <input type="hidden" name="id" value={supplier?.id ?? ""} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="crm-label">编码</span>
                <input name="code" required defaultValue={supplier?.code ?? ""} className="crm-input" />
              </label>

              <label className="space-y-2">
                <span className="crm-label">名称</span>
                <input name="name" required defaultValue={supplier?.name ?? ""} className="crm-input" />
              </label>

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

            <label className="mt-5 block space-y-2">
              <span className="crm-label">备注</span>
              <textarea
                name="remark"
                rows={4}
                defaultValue={supplier?.remark ?? ""}
                className="crm-textarea"
              />
            </label>

            {notice ? (
              <div className="mt-5">
                <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
                  {notice.message}
                </ActionBanner>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/6 px-4 py-4 sm:px-6">
            <button type="button" onClick={onClose} className="crm-button crm-button-secondary w-full sm:w-auto">
              取消
            </button>
            <button type="submit" disabled={pending} className="crm-button crm-button-primary w-full sm:w-auto">
              {pending ? "保存中..." : mode === "create" ? "创建供货商" : "保存供货商"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
