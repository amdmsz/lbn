"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

export function ProductCreateForm({
  suppliers,
  redirectTo,
  canQuickCreateSupplier,
  upsertAction,
  createInlineSupplierAction,
}: Readonly<{
  suppliers: SupplierOption[];
  redirectTo: string;
  canQuickCreateSupplier: boolean;
  upsertAction: (formData: FormData) => Promise<{
    status: "success" | "error";
    message: string;
  }>;
  createInlineSupplierAction: (formData: FormData) => Promise<InlineSupplierResult>;
}>) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  return (
    <section id="create-product" className="crm-section-card">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-black/85">新建商品</h3>
        <p className="text-sm leading-7 text-black/60">
          商品表单保持精简。供货商归属留在商品层，SKU、价格、货到付款和保价能力继续在下层维护。
        </p>
      </div>

      <form
        ref={formRef}
        action={async (formData) => {
          startTransition(async () => {
            const result = await upsertAction(formData);
            setNotice(result);

            if (result.status === "success") {
              formRef.current?.reset();
              router.refresh();
            }
          });
        }}
        className="mt-6 space-y-4"
      >
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <div className="grid gap-4 xl:grid-cols-2">
          <ProductSupplierField
            suppliers={suppliers}
            initialSelectedSupplierId=""
            canQuickCreateSupplier={canQuickCreateSupplier}
            createInlineSupplierAction={createInlineSupplierAction}
          />

          <label className="space-y-2">
            <span className="crm-label">商品编码</span>
            <input name="code" required className="crm-input" />
          </label>

          <label className="space-y-2">
            <span className="crm-label">商品名称</span>
            <input name="name" required className="crm-input" />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="crm-label">说明</span>
          <textarea name="description" rows={3} className="crm-textarea" />
        </label>

        {notice ? (
          <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
            {notice.message}
          </ActionBanner>
        ) : null}

        <div className="flex justify-end">
          <button type="submit" disabled={pending} className="crm-button crm-button-primary">
            {pending ? "保存中..." : "新建商品"}
          </button>
        </div>
      </form>
    </section>
  );
}
