"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function ShippingQuickFillDrawer({
  shippingTaskId,
  supplierName,
  subOrderNo,
  receiverName,
  shippingProvider,
  trackingNumber,
  redirectTo,
  updateShippingAction,
}: Readonly<{
  shippingTaskId: string;
  supplierName: string;
  subOrderNo: string;
  receiverName: string;
  shippingProvider: string | null;
  trackingNumber: string | null;
  redirectTo: string;
  updateShippingAction: (formData: FormData) => Promise<void>;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="crm-button crm-button-secondary"
      >
        回填物流
      </button>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="关闭物流回填抽屉"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/24"
          />

          <div className="absolute inset-y-0 right-0 flex w-full max-w-[34rem] flex-col border-l border-black/8 bg-[rgba(255,255,255,0.98)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]">
            <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                  物流回填
                </p>
                <h3 className="text-lg font-semibold text-black/84">{subOrderNo}</h3>
                <p className="text-sm text-black/56">
                  {supplierName} / {receiverName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-white/90 text-black/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form action={updateShippingAction} className="flex min-h-0 flex-1 flex-col">
              <input type="hidden" name="shippingTaskId" value={shippingTaskId} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <input type="hidden" name="shippingStatus" value="SHIPPED" />
              <input type="hidden" name="codCollectionStatus" value="" />
              <input type="hidden" name="codCollectedAmount" value="" />
              <input type="hidden" name="codRemark" value="" />

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-5">
                  <label className="space-y-2">
                    <span className="crm-label">承运商</span>
                    <input
                      name="shippingProvider"
                      defaultValue={shippingProvider ?? ""}
                      placeholder="例如：顺丰 / 京东"
                      className="crm-input"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="crm-label">物流单号</span>
                    <input
                      name="trackingNumber"
                      defaultValue={trackingNumber ?? ""}
                      placeholder="填写后将推进到已发货"
                      className="crm-input"
                    />
                  </label>

                  <div className="rounded-2xl border border-black/8 bg-white/72 px-4 py-3 text-sm text-black/58">
                    保存后，这个子单会从已报单待物流移入已发货。
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-black/6 px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="crm-button crm-button-secondary">
                  取消
                </button>
                <button type="submit" className="crm-button crm-button-primary">
                  保存并发货
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
