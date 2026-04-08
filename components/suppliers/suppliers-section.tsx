"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SupplierFormDrawer } from "@/components/suppliers/supplier-form-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/customers/metadata";

type SupplierItem = {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  remark: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt: Date | null;
  _count: {
    products: number;
    salesOrders: number;
  };
};

type SupplierActionResult = {
  status: "success" | "error";
  message: string;
};

function buildSuppliersHref(
  filters: {
    supplierQ: string;
    supplierStatus: string;
  },
  overrides: Partial<{
    supplierQ: string;
    supplierStatus: string;
    createSupplier: string;
  }> = {},
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();
  params.set("tab", "suppliers");

  if (next.supplierQ) params.set("supplierQ", next.supplierQ);
  if (next.supplierStatus) params.set("supplierStatus", next.supplierStatus);
  if (next.createSupplier) params.set("createSupplier", next.createSupplier);

  return `/products?${params.toString()}`;
}

export function SuppliersSection({
  items,
  filters,
  canManage,
  redirectTo,
  currentHref,
  initialCreateOpen,
  upsertAction,
  toggleAction,
}: Readonly<{
  items: SupplierItem[];
  filters: {
    supplierQ: string;
    supplierStatus: string;
  };
  canManage: boolean;
  redirectTo: string;
  currentHref: string;
  initialCreateOpen: boolean;
  upsertAction: (formData: FormData) => Promise<SupplierActionResult>;
  toggleAction: (formData: FormData) => Promise<SupplierActionResult>;
}>) {
  const router = useRouter();
  const [notice, setNotice] = useState<SupplierActionResult | null>(null);
  const [drawerSupplier, setDrawerSupplier] = useState<SupplierItem | null>(null);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(
    initialCreateOpen ? "create" : null,
  );
  const [initialDrawerPendingClose, setInitialDrawerPendingClose] = useState(initialCreateOpen);
  const [pendingToggle, startToggleTransition] = useTransition();

  function openCreateDrawer() {
    setDrawerSupplier(null);
    setDrawerMode("create");
  }

  function openEditDrawer(item: SupplierItem) {
    setDrawerSupplier(item);
    setDrawerMode("edit");
  }

  function closeDrawer() {
    setDrawerSupplier(null);
    setDrawerMode(null);

    if (initialDrawerPendingClose) {
      setInitialDrawerPendingClose(false);
      router.replace(currentHref);
    }
  }

  function handleSaved(message: string) {
    setNotice({ status: "success", message });
    closeDrawer();
    router.refresh();
  }

  function handleToggle(item: SupplierItem) {
    const formData = new FormData();
    formData.set("id", item.id);
    formData.set("redirectTo", currentHref);

    startToggleTransition(async () => {
      const result = await toggleAction(formData);
      setNotice(result);

      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <section className="crm-filter-panel space-y-4">
        <form
          method="get"
          className="crm-filter-grid md:grid-cols-2 2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.82fr)_auto]"
        >
          <input type="hidden" name="tab" value="suppliers" />

          <label className="space-y-2">
            <span className="crm-label">搜索供货商</span>
            <input
              name="supplierQ"
              defaultValue={filters.supplierQ}
              placeholder="名称 / 编码 / 联系人 / 电话"
              className="crm-input"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">状态</span>
            <select name="supplierStatus" defaultValue={filters.supplierStatus} className="crm-select">
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <div className="crm-filter-actions md:col-span-2 2xl:col-span-1">
            <button type="submit" className="crm-button crm-button-primary">
              应用
            </button>
            <Link
              href={buildSuppliersHref({ supplierQ: "", supplierStatus: "" })}
              className="crm-button crm-button-secondary"
            >
              重置
            </Link>
          </div>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/6 pt-4">
          <div className="text-sm text-black/58">供货商是商品域次级能力，默认保持轻维护和快速定位。</div>
          {canManage ? (
            <button type="button" onClick={openCreateDrawer} className="crm-button crm-button-primary">
              新增供货商
            </button>
          ) : null}
        </div>
      </section>

      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      {items.length > 0 ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <div key={item.id} className="crm-card-muted px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.enabled} />
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      {item.code}
                    </span>
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      商品 {item._count.products}
                    </span>
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs text-black/55">
                      成交 {item._count.salesOrders}
                    </span>
                  </div>

                  <div>
                    <div className="text-base font-semibold text-black/84">{item.name}</div>
                    <div className="mt-1 text-sm text-black/58">
                      {item.contactName || "未填写联系人"} / {item.contactPhone || "未填写电话"}
                    </div>
                    {item.remark ? (
                      <div className="mt-1 line-clamp-2 text-sm text-black/52">{item.remark}</div>
                    ) : null}
                  </div>
                </div>

                <div className="w-full space-y-1 text-left text-sm text-black/56 sm:w-auto sm:min-w-[12rem] sm:text-right">
                  <div>最近使用：{item.lastUsedAt ? formatDateTime(item.lastUsedAt) : "暂无"}</div>
                  <div>最近更新：{formatDateTime(item.updatedAt)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-black/6 pt-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm text-black/54">通过关联商品跳回主列表，不把供货商抬成一级业务域。</div>
                <div className="flex flex-wrap gap-2">
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => openEditDrawer(item)}
                      className="crm-button crm-button-secondary"
                    >
                      编辑
                    </button>
                  ) : null}
                  <Link
                    href={`/products?supplierId=${item.id}`}
                    className="crm-button crm-button-secondary"
                  >
                    查看关联商品
                  </Link>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      disabled={pendingToggle}
                      className="crm-button crm-button-secondary"
                    >
                      {item.enabled ? "停用" : "启用"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="暂无供货商"
          description="先调整筛选，或直接新增供货商。"
          action={
            canManage ? (
              <button type="button" onClick={openCreateDrawer} className="crm-button crm-button-primary">
                新增供货商
              </button>
            ) : undefined
          }
        />
      )}

      <SupplierFormDrawer
        open={drawerMode !== null}
        mode={drawerMode ?? "create"}
        supplier={
          drawerMode === "edit" && drawerSupplier
            ? {
                id: drawerSupplier.id,
                code: drawerSupplier.code,
                name: drawerSupplier.name,
                contactName: drawerSupplier.contactName,
                contactPhone: drawerSupplier.contactPhone,
                remark: drawerSupplier.remark,
              }
            : null
        }
        redirectTo={redirectTo}
        upsertAction={upsertAction}
        onClose={closeDrawer}
        onSaved={handleSaved}
      />
    </div>
  );
}
