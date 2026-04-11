"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  ProductSupplierField,
  type SupplierOption,
} from "@/components/products/product-supplier-field";
import { ActionBanner } from "@/components/shared/action-banner";

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
  description: string | null;
};

export function ProductFormDrawer({
  open,
  mode,
  product,
  suppliers,
  redirectTo,
  canQuickCreateSupplier,
  upsertAction,
  createInlineSupplierAction,
  onClose,
  onSaved,
}: Readonly<{
  open: boolean;
  mode: "create" | "edit";
  product?: ProductDraft | null;
  suppliers: SupplierOption[];
  redirectTo: string;
  canQuickCreateSupplier: boolean;
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
  onClose: () => void;
  onSaved: (message: string) => void;
}>) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);

  if (!open) {
    return null;
  }

  const footerHint = pending
    ? "正在保存商品主数据，请保持当前抽屉打开。"
    : mode === "create"
      ? "先确认供应商与商品主体身份，SKU 继续在详情页下层维护。"
      : "这里只维护商品主数据，SKU 能力与价格仍在详情页工作区维护。";

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭商品抽屉"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,23,42,0.22)] backdrop-blur-[1.5px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "create" ? "新建商品" : "编辑商品"}
        className="absolute inset-y-0 right-0 flex w-full max-w-[43rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.985)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-5 py-4 sm:px-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                商品
              </p>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-2.5 py-1 text-[11px] font-medium text-black/52">
                {mode === "create" ? "创建" : "编辑"}
              </span>
            </div>
            <h3 className="text-[1.05rem] font-semibold text-black/84">
              {mode === "create" ? "新建商品" : "编辑商品"}
            </h3>
            <p className="max-w-[32rem] text-[13px] leading-5 text-black/56">
              这里仅维护商品主数据。供应商、编码和名称优先确认，SKU 仍保持在详情页的下层工作区管理。
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
          <input type="hidden" name="id" value={product?.id ?? ""} />
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
                    先锁定供应商和商品身份，再进入后续 SKU 维护，避免主数据与执行层混在一起。
                  </p>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="xl:col-span-2 rounded-[0.95rem] border border-black/7 bg-white/84 p-4">
                    <div className="mb-3 space-y-1">
                      <p className="text-[12px] font-semibold text-black/72">供应商</p>
                      <p className="text-[12px] leading-5 text-black/50">
                        保持商品与供应商挂接清晰；如当前列表中没有，可继续使用现有的原地新增。
                      </p>
                    </div>
                    <ProductSupplierField
                      suppliers={suppliers}
                      initialSelectedSupplierId={product?.supplierId ?? ""}
                      disabled={pending}
                      canQuickCreateSupplier={canQuickCreateSupplier}
                      createInlineSupplierAction={createInlineSupplierAction}
                    />
                  </div>

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
                    <span className="crm-label">商品名称</span>
                    <input
                      name="name"
                      required
                      defaultValue={product?.name ?? ""}
                      className="crm-input"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-[1rem] border border-black/7 bg-[rgba(252,252,253,0.92)] p-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
                    补充说明
                  </p>
                  <p className="text-[13px] leading-5 text-black/56">
                    只补充必要说明，避免把商品抽屉写成长文档。低频信息继续后置到详情页。
                  </p>
                </div>

                <label className="mt-4 block space-y-2">
                  <span className="crm-label">说明</span>
                  <textarea
                    name="description"
                    rows={4}
                    defaultValue={product?.description ?? ""}
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
                {pending ? "保存中..." : mode === "create" ? "创建商品" : "保存商品"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
