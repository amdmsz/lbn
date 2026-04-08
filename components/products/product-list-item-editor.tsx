"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionBanner } from "@/components/shared/action-banner";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";

type SupplierOption = {
  id: string;
  name: string;
  code: string;
  enabled: boolean;
};

type ProductItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: Date;
  supplier: SupplierOption;
  _count: {
    skus: number;
    salesOrderItems: number;
  };
};

type ProductActionResult = {
  status: "success" | "error";
  message: string;
};

export function ProductListItemEditor({
  item,
  suppliers,
  canManage,
  listHref,
  upsertAction,
  toggleAction,
}: Readonly<{
  item: ProductItem;
  suppliers: SupplierOption[];
  canManage: boolean;
  listHref: string;
  upsertAction: (formData: FormData) => Promise<ProductActionResult>;
  toggleAction: (formData: FormData) => Promise<ProductActionResult>;
}>) {
  const router = useRouter();
  const [pendingSave, startSaveTransition] = useTransition();
  const [pendingToggle, startToggleTransition] = useTransition();
  const [notice, setNotice] = useState<ProductActionResult | null>(null);

  return (
    <div className="crm-card-muted p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <MasterDataStatusBadge isActive={item.enabled} />
            <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
              {item.code}
            </span>
          </div>
          <div>
            <div className="text-base font-semibold text-black/84">{item.name}</div>
            <div className="mt-1 text-sm text-black/58">
              {item.supplier.name} ({item.supplier.code})
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-black/55">
            <span className="rounded-full border border-black/10 px-2.5 py-1">
              SKU {item._count.skus}
            </span>
            <span className="rounded-full border border-black/10 px-2.5 py-1">
              成交引用 {item._count.salesOrderItems}
            </span>
          </div>
        </div>

        <Link href={`/products/${item.id}`} className="crm-button crm-button-secondary">
          商品详情 / SKU
        </Link>
      </div>

      <form
        action={async (formData) => {
          startSaveTransition(async () => {
            const result = await upsertAction(formData);
            setNotice(result);

            if (result.status === "success") {
              router.refresh();
            }
          });
        }}
        className="mt-4 space-y-4"
      >
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="redirectTo" value={listHref} />

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-2">
            <span className="crm-label">供货商</span>
            <select
              name="supplierId"
              required
              className="crm-select"
              defaultValue={item.supplier.id}
              disabled={!canManage || pendingSave}
            >
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name} ({supplier.code}){supplier.enabled ? "" : " - 已停用"}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">商品编码</span>
            <input
              name="code"
              defaultValue={item.code}
              required
              className="crm-input"
              disabled={!canManage || pendingSave}
            />
          </label>

          <label className="space-y-2 xl:col-span-2">
            <span className="crm-label">商品名称</span>
            <input
              name="name"
              defaultValue={item.name}
              required
              className="crm-input"
              disabled={!canManage || pendingSave}
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="crm-label">说明</span>
          <textarea
            name="description"
            rows={3}
            defaultValue={item.description ?? ""}
            className="crm-textarea"
            disabled={!canManage || pendingSave}
          />
        </label>

        {notice ? (
          <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
            {notice.message}
          </ActionBanner>
        ) : null}

        {canManage ? (
          <div className="flex justify-end">
            <button type="submit" disabled={pendingSave} className="crm-button crm-button-primary">
              {pendingSave ? "保存中..." : "保存商品"}
            </button>
          </div>
        ) : null}
      </form>

      {canManage ? (
        <form
          action={async (formData) => {
            startToggleTransition(async () => {
              const result = await toggleAction(formData);
              setNotice(result);

              if (result.status === "success") {
                router.refresh();
              }
            });
          }}
          className="mt-3 flex justify-end"
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="redirectTo" value={listHref} />
          <button type="submit" disabled={pendingToggle} className="crm-button crm-button-secondary">
            {pendingToggle ? "处理中..." : item.enabled ? "停用商品" : "启用商品"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
