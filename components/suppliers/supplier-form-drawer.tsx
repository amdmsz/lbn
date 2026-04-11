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

  const footerHint = pending
    ? "正在保存供应商主数据，请保持当前抽屉打开。"
    : mode === "create"
      ? "先确认供应商主体身份，再补充联系人与备注，保持产品域次级面足够轻。"
      : "这里只维护供应商主数据，不把 supplier 扩成独立一级工作台。";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭供应商抽屉"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,23,42,0.22)] backdrop-blur-[1.5px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "新建供应商" : "编辑供应商"}
        className="absolute inset-y-0 right-0 flex w-full max-w-[42rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.985)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                Supplier
              </p>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-black/52">
                {mode === "create" ? "创建" : "编辑"}
              </span>
            </div>
            <h3 className="text-[1.05rem] font-semibold text-black/84">
              {mode === "create" ? "新建供应商" : "编辑供应商"}
            </h3>
            <p className="max-w-[30rem] text-[13px] leading-5 text-black/56">
              这里只维护产品域的供应商主数据。主体身份优先确认，联系人和备注作为后置补充信息。
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
          <input type="hidden" name="id" value={supplier?.id ?? ""} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <fieldset
              disabled={pending}
              className={`space-y-4 ${pending ? "opacity-80" : ""}`}
            >
              <section className="rounded-[1rem] border border-black/8 bg-[linear-gradient(180deg,rgba(248,249,251,0.88),rgba(255,255,255,0.94))] p-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                    主体身份
                  </p>
                  <p className="text-[13px] leading-5 text-black/56">
                    先锁定供应商编码和名称，保证商品域的供应商引用关系清晰稳定。
                  </p>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
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

              <section className="rounded-[1rem] border border-black/7 bg-[rgba(252,252,253,0.92)] p-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                    联系与备注
                  </p>
                  <p className="text-[13px] leading-5 text-black/56">
                    联系人、电话和备注属于次级补充信息，默认保持克制，不让轻量表单变成说明页。
                  </p>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
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
                {pending ? "保存中..." : mode === "create" ? "创建供应商" : "保存供应商"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
