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

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭商品抽屉"
        onClick={onClose}
        className="absolute inset-0 bg-black/24"
      />

      <div className="absolute inset-y-0 right-0 flex w-full max-w-[44rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.98)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
              商品
            </p>
            <h3 className="text-lg font-semibold text-black/84">
              {mode === "create" ? "新建商品" : "编辑商品"}
            </h3>
            <p className="text-sm text-black/56">只维护商品层信息，SKU 能力继续留在下层管理。</p>
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
          <input type="hidden" name="id" value={product?.id ?? ""} />
          <input type="hidden" name="redirectTo" value={redirectTo} />

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              <div className="grid gap-5">
                <ProductSupplierField
                  suppliers={suppliers}
                  initialSelectedSupplierId={product?.supplierId ?? ""}
                  canQuickCreateSupplier={canQuickCreateSupplier}
                  createInlineSupplierAction={createInlineSupplierAction}
                />

                <div className="grid gap-5 lg:grid-cols-2">
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
              </div>

              <label className="block space-y-2">
                <span className="crm-label">说明</span>
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={product?.description ?? ""}
                  className="crm-textarea"
                />
              </label>

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
              {pending ? "保存中..." : mode === "create" ? "创建商品" : "保存商品"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
