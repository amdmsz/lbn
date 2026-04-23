"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MasterDataRecycleDialog } from "@/components/products/master-data-recycle-dialog";
import { SupplierFormDrawer } from "@/components/suppliers/supplier-form-drawer";
import { MasterDataStatusBadge } from "@/components/settings/master-data-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/customers/metadata";
import type {
  MasterDataRecycleGuard,
  MasterDataRecycleReasonCode,
} from "@/lib/products/recycle-guards";
import { cn } from "@/lib/utils";

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
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
};

const supplierControlSurfaceClassName =
  "rounded-[1.08rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3.5 py-3.5 shadow-[var(--color-shell-shadow-sm)]";

const supplierMetricPillClassName =
  "rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]";

const supplierQuietActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-transparent px-2.5 py-2 text-sm font-medium text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color] hover:border-[var(--color-border-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50";

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
  moveToRecycleBinAction,
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
  moveToRecycleBinAction: (formData: FormData) => Promise<SupplierActionResult>;
}>) {
  const router = useRouter();
  const [notice, setNotice] = useState<SupplierActionResult | null>(null);
  const [drawerSupplier, setDrawerSupplier] = useState<SupplierItem | null>(
    null,
  );
  const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(
    initialCreateOpen ? "create" : null,
  );
  const [initialDrawerPendingClose, setInitialDrawerPendingClose] =
    useState(initialCreateOpen);
  const [recycleTarget, setRecycleTarget] = useState<SupplierItem | null>(null);
  const [recycleReason, setRecycleReason] =
    useState<MasterDataRecycleReasonCode>("mistaken_creation");
  const [pendingAction, startActionTransition] = useTransition();

  const hasActiveFilters = Boolean(filters.supplierQ || filters.supplierStatus);
  const enabledCount = items.filter((item) => item.enabled).length;
  const totalProducts = items.reduce(
    (sum, item) => sum + item._count.products,
    0,
  );
  const totalOrders = items.reduce(
    (sum, item) => sum + item._count.salesOrders,
    0,
  );
  const visibleStatusLabel =
    filters.supplierStatus === "enabled"
      ? "仅启用"
      : filters.supplierStatus === "disabled"
        ? "仅停用"
        : "全部状态";

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

    startActionTransition(async () => {
      const result = await toggleAction(formData);
      setNotice(result);

      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  function handleRecycleConfirm() {
    if (!recycleTarget) {
      return;
    }

    const formData = new FormData();
    formData.set("id", recycleTarget.id);
    formData.set("redirectTo", currentHref);
    formData.set("reasonCode", recycleReason);

    startActionTransition(async () => {
      const result = await moveToRecycleBinAction(formData);
      setNotice(result);
      closeRecycleDialog();

      if (
        result.recycleStatus === "created" ||
        result.recycleStatus === "already_in_recycle_bin"
      ) {
        router.refresh();
      }

      if (result.recycleStatus === "blocked") {
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
      <form
        method="get"
        className={cn(supplierControlSurfaceClassName, "space-y-3")}
      >
        <input type="hidden" name="tab" value="suppliers" />

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索供应商</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-sidebar-muted)]" />
            <input
              name="supplierQ"
              defaultValue={filters.supplierQ}
              placeholder="输入供应商名、编码、联系人或电话"
              className="crm-input min-h-[2.85rem] pl-10"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[12rem_auto] xl:w-[19rem]">
            <label className="space-y-1.5">
              <span className="sr-only">供应商状态</span>
              <select
                name="supplierStatus"
                defaultValue={filters.supplierStatus}
                className="crm-select min-h-[2.85rem]"
              >
                <option value="">显示：全部状态</option>
                <option value="enabled">显示：仅启用</option>
                <option value="disabled">显示：仅停用</option>
              </select>
            </label>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                type="submit"
                className="crm-button crm-button-primary min-h-[2.85rem] px-4"
              >
                查看结果
              </button>
              <Link
                href={buildSuppliersHref({
                  supplierQ: "",
                  supplierStatus: "",
                })}
                className="crm-button crm-button-secondary min-h-[2.85rem] px-3.5"
              >
                清空
              </Link>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border-soft)] pt-3">
          <span className="text-[11px] font-medium tracking-[0.08em] text-[var(--color-sidebar-muted)]">
            当前范围
          </span>
          <span className={supplierMetricPillClassName}>
            {visibleStatusLabel}
          </span>
          <span className={supplierMetricPillClassName}>
            供应商 {items.length}
          </span>
          <span className={supplierMetricPillClassName}>
            启用 {enabledCount}
          </span>
          <span className={supplierMetricPillClassName}>
            关联商品 {totalProducts}
          </span>
          <span className={supplierMetricPillClassName}>
            成交 {totalOrders}
          </span>
        </div>
      </form>

      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <div className="rounded-[1.12rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)]">
        {items.length > 0 ? (
          <div className="space-y-0 overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="crm-detail-label text-[11px]">供应目录</p>
                <h3 className="text-[0.96rem] font-semibold text-[var(--foreground)]">
                  商品域次级供应商列表
                </h3>
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={openCreateDrawer}
                  className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                >
                  新建供应商
                </button>
              ) : null}
            </div>

            <div className="crm-table-shell overflow-x-auto rounded-none border-0 shadow-none">
              <table className="crm-table min-w-[920px]">
                <thead>
                  <tr>
                    <th>供应商</th>
                    <th>联系信息</th>
                    <th>使用范围</th>
                    <th>状态</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                              {item.name}
                            </span>
                            <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                              {item.code}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                            <span>创建 {formatDateTime(item.createdAt)}</span>
                            <span>更新 {formatDateTime(item.updatedAt)}</span>
                          </div>
                          {item.remark ? (
                            <p className="line-clamp-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                              {item.remark}
                            </p>
                          ) : null}
                        </div>
                      </td>

                      <td>
                        <div className="space-y-1.5">
                          <p className="text-[13px] font-medium text-[var(--foreground)]">
                            {item.contactName || "未填写联系人"}
                          </p>
                          <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                            {item.contactPhone || "未填写电话"}
                          </p>
                        </div>
                      </td>

                      <td>
                        <div className="space-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                          <p>
                            商品 {item._count.products} · 成交{" "}
                            {item._count.salesOrders}
                          </p>
                          <p>
                            履约 {item._count.shippingTasks} · 导出{" "}
                            {item._count.exportBatches}
                          </p>
                          <p>
                            最近使用{" "}
                            {item.lastUsedAt
                              ? formatDateTime(item.lastUsedAt)
                              : "暂无"}
                          </p>
                        </div>
                      </td>

                      <td>
                        <div className="flex min-w-[7rem] flex-col items-start gap-2">
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => handleToggle(item)}
                              disabled={pendingAction}
                              aria-label={
                                item.enabled ? "停用供应商" : "启用供应商"
                              }
                              className={cn(
                                "relative inline-flex h-7 w-11 items-center rounded-full border p-[3px] transition-[border-color,background-color]",
                                item.enabled
                                  ? "border-[rgba(79,125,247,0.18)] bg-[rgba(79,125,247,0.12)]"
                                  : "border-[var(--color-border-soft)] bg-[var(--color-shell-active)]",
                                pendingAction &&
                                  "cursor-not-allowed opacity-70",
                              )}
                            >
                              <span
                                className={cn(
                                  "h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(18,24,31,0.14)] transition-transform duration-200",
                                  item.enabled
                                    ? "translate-x-4"
                                    : "translate-x-0",
                                )}
                              />
                            </button>
                          ) : (
                            <MasterDataStatusBadge isActive={item.enabled} />
                          )}
                          <p className="text-[11px] font-medium text-[var(--color-sidebar-muted)]">
                            {item.enabled ? "已启用" : "已停用"}
                          </p>
                        </div>
                      </td>

                      <td>
                        <div className="flex justify-end gap-2">
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
                              onClick={() => setRecycleTarget(item)}
                              className={supplierQuietActionClassName}
                            >
                              {item.recycleGuard.canMoveToRecycleBin
                                ? "回收"
                                : "查看引用"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-4 md:p-5">
            <EmptyState
              title={
                hasActiveFilters
                  ? "当前筛选下没有供应商"
                  : "供应商主数据还未建立"
              }
              description={
                hasActiveFilters
                  ? "调整搜索词或状态后继续定位供应商。"
                  : "先建立供应商，再从商品主列表回到这里做轻量维护。"
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {hasActiveFilters ? (
                    <Link
                      href={buildSuppliersHref({
                        supplierQ: "",
                        supplierStatus: "",
                      })}
                      className="crm-button crm-button-secondary"
                    >
                      清空筛选
                    </Link>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={openCreateDrawer}
                      className="crm-button crm-button-primary"
                    >
                      新建供应商
                    </button>
                  ) : null}
                </div>
              }
            />
          </div>
        )}
      </div>

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
        objectTypeLabel="供应商"
        secondaryLabel={recycleTarget?.code ?? ""}
        domainLabel="商品中心 / 供应商"
        updatedAt={recycleTarget?.updatedAt ?? new Date()}
        guard={
          recycleTarget?.recycleGuard ?? {
            canMoveToRecycleBin: false,
            fallbackActionLabel: "改为停用供应商",
            blockerSummary: "",
            blockers: [],
            futureRestoreBlockers: [],
          }
        }
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        onConfirm={handleRecycleConfirm}
        pending={pendingAction}
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
