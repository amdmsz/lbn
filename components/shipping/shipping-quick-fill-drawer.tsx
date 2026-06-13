"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, X } from "lucide-react";

export function ShippingQuickFillDrawer({
  shippingTaskId,
  supplierName,
  subOrderNo,
  receiverName,
  shippingProvider,
  trackingNumber,
  shippingPackages,
  redirectTo,
  updateShippingAction,
}: Readonly<{
  shippingTaskId: string;
  supplierName: string;
  subOrderNo: string;
  receiverName: string;
  shippingProvider: string | null;
  trackingNumber: string | null;
  shippingPackages: Array<{
    label: string;
    shippingProvider: string;
    trackingNumber: string;
    remark: string;
  }>;
  redirectTo: string;
  updateShippingAction: (formData: FormData) => Promise<void>;
}>) {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState(() => {
    const initialPackages =
      shippingPackages.length > 0
        ? shippingPackages
        : [
            {
              label: "主包裹",
              shippingProvider: shippingProvider ?? "",
              trackingNumber: trackingNumber ?? "",
              remark: "",
            },
          ];

    return initialPackages.map((item, index) => ({
      id: `pkg-${index}-${Math.random().toString(36).slice(2, 8)}`,
      label: item.label || `包裹 ${index + 1}`,
      shippingProvider: item.shippingProvider || "",
      trackingNumber: item.trackingNumber || "",
      remark: item.remark || "",
    }));
  });

  const shippingPackagesJson = useMemo(
    () =>
      JSON.stringify(
        packages.map((item, index) => ({
          label: item.label || `包裹 ${index + 1}`,
          shippingProvider: item.shippingProvider,
          trackingNumber: item.trackingNumber,
          remark: item.remark,
        })),
      ),
    [packages],
  );

  function updatePackage(id: string, patch: Partial<(typeof packages)[number]>) {
    setPackages((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function addPackage() {
    setPackages((current) => [
      ...current,
      {
        id: `pkg-${Math.random().toString(36).slice(2, 10)}`,
        label: `包裹 ${current.length + 1}`,
        shippingProvider: "",
        trackingNumber: "",
        remark: "",
      },
    ]);
  }

  function removePackage(id: string) {
    setPackages((current) =>
      current.length > 1 ? current.filter((item) => item.id !== id) : current,
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="crm-button crm-button-secondary"
      >
        回填物流
      </button>

      {/* 关键: 用 Portal 把抽屉渲染到 document.body. 本组件渲染在列表的
        `pending-logistics-form` (批量回填 form) 内部, 抽屉自带 <form action=...>
        若留在原地就构成 HTML 非法嵌套 form, 浏览器丢弃内层 form, "保存并发货"
        会误提交到外层批量 action → 表现为"点了没反应". Portal 出 body 后,
        抽屉的 form 不再嵌套, 单子发货 action 才能正确触发. */}
      {open && typeof document !== "undefined"
        ? createPortal(
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="关闭物流回填抽屉"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/24"
          />

          <div className="absolute inset-y-0 right-0 flex w-full max-w-[34rem] flex-col border-l border-border/60 bg-[rgba(255,255,255,0.98)] shadow-[-18px_0_42px_rgba(15,23,42,0.12)]">
            <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                  物流回填
                </p>
                <h3 className="text-lg font-semibold text-foreground">{subOrderNo}</h3>
                <p className="text-sm text-muted-foreground">
                  {supplierName} / {receiverName}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground/70"
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
              <input type="hidden" name="shippingPackagesJson" value={shippingPackagesJson} />

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">包裹信息</div>
                      <div className="text-xs text-muted-foreground">一个订单可录多个箱子 / 物流单号。</div>
                    </div>
                    <button type="button" onClick={addPackage} className="crm-button crm-button-secondary">
                      <Plus className="h-4 w-4" />
                      新增包裹
                    </button>
                  </div>

                  <div className="space-y-3">
                    {packages.map((item, index) => (
                      <div key={item.id} className="rounded-xl border border-border/60 bg-[var(--color-shell-surface-soft)] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-foreground">{item.label || `包裹 ${index + 1}`}</div>
                          <button
                            type="button"
                            onClick={() => removePackage(item.id)}
                            className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground"
                            disabled={packages.length === 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            删除
                          </button>
                        </div>

                        <div className="mt-3 grid gap-3">
                          <label className="space-y-2">
                            <span className="crm-label">包裹名称</span>
                            <input
                              value={item.label}
                              onChange={(event) => updatePackage(item.id, { label: event.target.value })}
                              className="crm-input"
                              placeholder={`包裹 ${index + 1}`}
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="crm-label">承运商</span>
                            <input
                              value={item.shippingProvider}
                              onChange={(event) => updatePackage(item.id, { shippingProvider: event.target.value })}
                              placeholder="例如：顺丰 / 京东"
                              list="shipping-provider-options"
                              className="crm-input"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="crm-label">物流单号</span>
                            <input
                              value={item.trackingNumber}
                              onChange={(event) => updatePackage(item.id, { trackingNumber: event.target.value })}
                              placeholder="填写后将推进到已发货"
                              className="crm-input"
                            />
                          </label>
                          <label className="space-y-2">
                            <span className="crm-label">备注</span>
                            <input
                              value={item.remark}
                              onChange={(event) => updatePackage(item.id, { remark: event.target.value })}
                              placeholder="箱号 / 发货备注"
                              className="crm-input"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-border/60 bg-[var(--color-shell-surface-soft)] px-4 py-3 text-sm text-muted-foreground">
                    保存后，这个子单会从已报单待物流移入已发货。
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-border/60 px-6 py-4">
                <button type="button" onClick={() => setOpen(false)} className="crm-button crm-button-secondary">
                  取消
                </button>
                <button type="submit" className="crm-button crm-button-primary">
                  保存并发货
                </button>
              </div>
            </form>
          </div>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
