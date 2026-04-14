"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
import { SupplierFormDrawer } from "@/components/suppliers/supplier-form-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import type {
  MasterDataRecycleGuard,
  MasterDataRecycleReasonCode,
} from "@/lib/products/recycle-guards";

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
    shippingTasks: number;
    exportBatches: number;
  };
  recycleGuard: MasterDataRecycleGuard;
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
  const [recycleTarget, setRecycleTarget] = useState<SupplierItem | null>(null);
  const [recycleReason, setRecycleReason] =
    useState<MasterDataRecycleReasonCode>("mistaken_creation");
  const [pendingToggle, startToggleTransition] = useTransition();

  const hasActiveFilters = Boolean(filters.supplierQ || filters.supplierStatus);
  const enabledCount = items.filter((item) => item.enabled).length;
  const totalProducts = items.reduce((sum, item) => sum + item._count.products, 0);

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

  function closeRecycleDialog() {
    setRecycleTarget(null);
    setRecycleReason("mistaken_creation");
  }

  return (
    <div className="space-y-4">
      <SectionCard
        density="compact"
        title="筛选与控制"
        description="供应商仍附属于商品域，只保留轻量筛选、快速维护和回跳商品主列表。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`当前结果 ${items.length}`} variant="neutral" />
            {canManage ? (
              <button type="button" onClick={openCreateDrawer} className="crm-button crm-button-primary">
                新增供应商
              </button>
            ) : null}
          </div>
        }
      >
        <form method="get" className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <input type="hidden" name="tab" value="suppliers" />

          <label className="min-w-0 flex-1 space-y-2">
            <span className="crm-label">搜索</span>
            <input
              name="supplierQ"
              defaultValue={filters.supplierQ}
              placeholder="供应商名、编码、联系人或电话"
              className="crm-input"
            />
          </label>

          <label className="space-y-2 xl:w-[10rem]">
            <span className="crm-label">状态</span>
            <select name="supplierStatus" defaultValue={filters.supplierStatus} className="crm-select">
              <option value="">全部</option>
              <option value="enabled">启用</option>
              <option value="disabled">停用</option>
            </select>
          </label>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              应用筛选
            </button>
            <Link
              href={buildSuppliersHref({ supplierQ: "", supplierStatus: "" })}
              className="crm-button crm-button-secondary"
            >
              重置
            </Link>
          </div>
        </form>
      </SectionCard>

      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <SectionCard
        density="compact"
        title="供应商列表"
        description={
          hasActiveFilters
            ? "优先按供应商名、状态和最近使用时间回看当前结果，再按需跳回商品主列表。"
            : "供应商作为商品域次级主数据面，默认只保留轻量扫描和快速维护。"
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`启用 ${enabledCount}`} variant="neutral" />
            <StatusBadge label={`关联商品 ${totalProducts}`} variant="neutral" />
          </div>
        }
        contentClassName="p-0"
      >
        {items.length > 0 ? (
          <div className="divide-y divide-black/6">
            {items.map((item) => (
              <article
                key={item.id}
                className="group flex flex-col gap-3 px-4 py-3.5 md:px-5 xl:flex-row xl:items-start xl:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <MasterDataStatusBadge isActive={item.enabled} />
                    <span className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] font-medium text-black/55">
                      {item.code}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="truncate text-[15px] font-semibold text-black/86">{item.name}</div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-black/58">
                      <span>{item.contactName || "未填写联系人"}</span>
                      <span className="text-black/24">/</span>
                      <span>{item.contactPhone || "未填写电话"}</span>
                    </div>
                    {item.remark ? (
                      <p className="line-clamp-1 text-[13px] leading-5 text-black/50">{item.remark}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-5 text-black/48">
                    <span>商品 {item._count.products}</span>
                    <span>成交 {item._count.salesOrders}</span>
                    <span>最近使用 {item.lastUsedAt ? formatDateTime(item.lastUsedAt) : "暂无"}</span>
                    <span>最近更新 {formatDateTime(item.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Link
                    href={`/products?supplierId=${item.id}`}
                    className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                  >
                    关联商品
                  </Link>
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => openEditDrawer(item)}
                      className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                    >
                      编辑
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      disabled={pendingToggle}
                      className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {item.enabled ? "停用" : "启用"}
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => setRecycleTarget(item)}
                      className="inline-flex min-h-0 items-center rounded-full px-2.5 py-2 text-sm font-medium text-black/56 transition-colors hover:bg-black/[0.03] hover:text-black/84"
                    >
                      {item.recycleGuard.canMoveToRecycleBin
                        ? "\u79fb\u5165\u56de\u6536\u7ad9"
                        : "\u67e5\u770b\u5f15\u7528\u5173\u7cfb"}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-4 md:p-5">
            <EmptyState
              title={hasActiveFilters ? "当前筛选下没有供应商" : "供应商主数据还未建立"}
              description={
                hasActiveFilters
                  ? "调整搜索词或状态后继续定位供应商，避免把次级主数据面做成独立工作台。"
                  : "先建立供应商，再从商品主列表或商品详情回到这里做轻量维护。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {hasActiveFilters ? (
                    <Link
                      href={buildSuppliersHref({ supplierQ: "", supplierStatus: "" })}
                      className="crm-button crm-button-secondary"
                    >
                      清空筛选
                    </Link>
                  ) : null}
                  {canManage ? (
                    <button type="button" onClick={openCreateDrawer} className="crm-button crm-button-primary">
                      新增供应商
                    </button>
                  ) : null}
                </div>
              }
            />
          </div>
        )}
      </SectionCard>

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

      <MasterDataRecycleDialog
        open={recycleTarget !== null}
        objectName={recycleTarget?.name ?? ""}
        objectTypeLabel="\u4f9b\u5e94\u5546"
        secondaryLabel={recycleTarget?.code ?? ""}
        domainLabel="\u5546\u54c1\u4e2d\u5fc3 / \u4f9b\u5e94\u5546"
        updatedAt={recycleTarget?.updatedAt ?? new Date()}
        guard={
          recycleTarget?.recycleGuard ?? {
            canMoveToRecycleBin: false,
            fallbackActionLabel: "\u6539\u4e3a\u505c\u7528\u4f9b\u5e94\u5546",
            blockerSummary: "",
            blockers: [],
            futureRestoreBlockers: [],
          }
        }
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        pending={pendingToggle}
        onFallbackAction={
          recycleTarget
            ? () => {
                handleToggle(recycleTarget);
                closeRecycleDialog();
              }
            : undefined
        }
      />
    </div>
  );
}
