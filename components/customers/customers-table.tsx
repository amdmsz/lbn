"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import {
  batchAddCustomerTagAction,
  batchMoveCustomersToRecycleBinAction,
} from "@/app/(dashboard)/customers/actions";
import {
  CustomerFollowUpDialog,
  getCustomerExecutionClassQuickResult,
} from "@/components/customers/customer-follow-up-dialog";
import { CustomerPhoneSpotlight } from "@/components/customers/customer-phone-spotlight";
import { InlineCustomerRemarkField } from "@/components/customers/inline-customer-remark-field";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import { CustomerRecycleBlockedReasonSummary } from "@/components/customers/customer-recycle-blocked-reason-summary";
import { type MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { MobileCallFollowUpSheet } from "@/components/customers/mobile-call-followup-sheet";
import { BatchActionNoticeBanner } from "@/components/shared/batch-action-notice-banner";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityTable } from "@/components/shared/entity-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  createInitialCustomerBatchActionNoticeState,
  type CustomerBatchActionNoticeState,
} from "@/lib/customers/batch-action-contract";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import {
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
  formatDateTime,
  formatRelativeDateTime,
  formatRegion,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
  MAX_BATCH_CUSTOMER_ACTION_SIZE,
} from "@/lib/customers/metadata";
import type {
  CustomerCenterFilters,
  CustomerListItem,
} from "@/lib/customers/queries";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { cn } from "@/lib/utils";

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type CustomerViewMode = "cards" | "table";
type SelectionMode = "manual" | "filtered";

type BatchTagOption = {
  id: string;
  name: string;
  label: string;
  count: number;
};

type PageSelectionState = {
  pageKey: string;
  ids: string[];
};

type FollowUpDialogState = {
  item: CustomerListItem | null;
  initialResult: string;
};

const customerViewStorageKey = "customer-center-view-mode";
const initialBatchTagNoticeState =
  createInitialCustomerBatchActionNoticeState("已有标签");
const initialBatchRecycleNoticeState =
  createInitialCustomerBatchActionNoticeState("已在回收站");
const quietExecutionButtonVariantClassNames = {
  neutral:
    "border-[var(--crm-badge-neutral-border)] bg-[var(--crm-badge-neutral-bg)] text-[var(--crm-badge-neutral-text)]",
  info:
    "border-[rgba(111,141,255,0.18)] bg-[rgba(111,141,255,0.1)] text-[var(--color-accent-strong)]",
  success:
    "border-[rgba(87,212,176,0.16)] bg-[rgba(87,212,176,0.1)] text-[var(--color-success)]",
  warning:
    "border-[rgba(240,195,106,0.18)] bg-[rgba(240,195,106,0.1)] text-[var(--color-warning)]",
  danger:
    "border-[rgba(255,148,175,0.16)] bg-[rgba(255,148,175,0.1)] text-[var(--color-danger)]",
} as const;

function getCustomerAddress(item: CustomerListItem) {
  const region = formatRegion(item.province, item.city, item.district);
  const detail = item.address?.trim();

  if (detail) {
    return region !== "未填写" ? `${region} / ${detail}` : detail;
  }

  return region;
}

function getOwnerLabel(item: CustomerListItem) {
  return item.owner ? `${item.owner.name} (@${item.owner.username})` : "未分配负责人";
}

function getPrimarySignal(item: CustomerListItem) {
  return item.latestPurchasedProduct ?? item.latestInterestedProduct ?? "暂无商品信号";
}

function getLatestCallRecord(item: CustomerListItem) {
  return item.callRecords[0] ?? null;
}

function getProgressSummary(item: CustomerListItem) {
  if (item.workingStatuses.length === 0) {
    return {
      primary: getCustomerStatusLabel(item.status),
      secondary: "当前没有挂起推进项",
    };
  }

  const labels = item.workingStatuses.map((status) => getCustomerWorkStatusLabel(status));
  return {
    primary: labels[0] ?? "当前推进",
    secondary: labels.length > 1 ? `另有 ${labels.length - 1} 项推进` : "当前主推进项",
  };
}

function getSignalMeta(item: CustomerListItem) {
  if (item.latestPurchasedProduct) {
    return "导入前购买";
  }

  if (item.latestInterestedProduct) {
    return "导入意向";
  }

  return "暂无商品字段";
}

function getSuggestedFollowUpResult(item: CustomerListItem) {
  if (item.newImported && item.pendingFirstCall) {
    return "";
  }

  return item.callRecords[0]?.resultCode ?? getCustomerExecutionClassQuickResult(item.executionClass);
}

function FilterHiddenInputs({
  filters,
}: Readonly<{
  filters: CustomerCenterFilters;
}>) {
  return (
    <>
      <input type="hidden" name="queue" value={filters.queue} />
      {filters.executionClasses.map((executionClass) => (
        <input
          key={executionClass}
          type="hidden"
          name="executionClasses"
          value={executionClass}
        />
      ))}
      {filters.search ? <input type="hidden" name="search" value={filters.search} /> : null}
      {filters.teamId ? <input type="hidden" name="teamId" value={filters.teamId} /> : null}
      {filters.salesId ? <input type="hidden" name="salesId" value={filters.salesId} /> : null}
      {filters.productKeys.map((productKey) => (
        <input key={productKey} type="hidden" name="productKeys" value={productKey} />
      ))}
      {filters.productKeyword ? (
        <input type="hidden" name="productKeyword" value={filters.productKeyword} />
      ) : null}
      {filters.tagIds.map((tagId) => (
        <input key={tagId} type="hidden" name="tagIds" value={tagId} />
      ))}
      {filters.assignedFrom ? (
        <input type="hidden" name="assignedFrom" value={filters.assignedFrom} />
      ) : null}
      {filters.assignedTo ? (
        <input type="hidden" name="assignedTo" value={filters.assignedTo} />
      ) : null}
      <input type="hidden" name="page" value={String(filters.page)} />
      <input type="hidden" name="pageSize" value={String(filters.pageSize)} />
    </>
  );
}

function CustomerViewToggle({
  value,
  onChange,
}: Readonly<{
  value: CustomerViewMode;
  onChange: (nextValue: CustomerViewMode) => void;
}>) {
  return (
    <div className="inline-flex items-center gap-1 rounded-[12px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-1">
      <button
        type="button"
        onClick={() => onChange("table")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px]",
          value === "table"
            ? "bg-[var(--color-shell-hover)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
            : "text-[var(--color-sidebar-muted)] hover:text-[var(--foreground)]",
        )}
      >
        <Rows3 className="h-3.5 w-3.5" />
        <span>表格</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("cards")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-medium transition-[background-color,color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px]",
          value === "cards"
            ? "bg-[var(--color-shell-hover)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
            : "text-[var(--color-sidebar-muted)] hover:text-[var(--foreground)]",
        )}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>卡片</span>
      </button>
    </div>
  );
}

function BatchTagDialog({
  open,
  selectedCount,
  selectionMode,
  filters,
  tagOptions,
  selectedTagId,
  pending,
  onClose,
  onTagChange,
  onSubmit,
  selectedCustomerIds,
}: Readonly<{
  open: boolean;
  selectedCount: number;
  selectionMode: SelectionMode;
  filters: CustomerCenterFilters;
  tagOptions: BatchTagOption[];
  selectedTagId: string;
  pending: boolean;
  onClose: () => void;
  onTagChange: (nextValue: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedCustomerIds: string[];
}>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="批量添加标签"
        className="crm-card w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">批量添加标签</h3>
              <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                本次会对已选 {selectedCount} 位客户批量添加一个标签。已有标签不会覆盖，只会计入“已有标签”。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === "filtered" ? (
            <FilterHiddenInputs filters={filters} />
          ) : (
            selectedCustomerIds.map((customerId) => (
              <input key={customerId} type="hidden" name="customerIds" value={customerId} />
            ))
          )}

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">选择标签</span>
            <select
              name="tagId"
              value={selectedTagId}
              onChange={(event) => onTagChange(event.target.value)}
              required
              className="crm-input h-11 w-full"
            >
              <option value="">请选择一个标签</option>
              {tagOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label || option.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            {selectionMode === "filtered"
              ? `这次会按当前筛选结果批量处理 ${selectedCount} 位客户，不做标签移除，也不会覆盖已有标签。`
              : "这次会按当前页手选客户批量添加标签，不做标签移除，也不会覆盖已有标签。"}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending || !selectedTagId}
              className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "提交中..." : "确认添加标签"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BatchRecycleDialog({
  open,
  selectedCount,
  selectionMode,
  filters,
  pending,
  onClose,
  onSubmit,
  selectedCustomerIds,
}: Readonly<{
  open: boolean;
  selectedCount: number;
  selectionMode: SelectionMode;
  filters: CustomerCenterFilters;
  pending: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  selectedCustomerIds: string[];
}>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="批量移入回收站"
        className="crm-card w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">批量移入回收站</h3>
              <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                本次会把已选 {selectedCount} 位客户按“误建轻客户”语义逐条提交到现有 recycle move
                guard。服务端会继续阻断 public-pool、状态治理、merge 以及订单 / 支付 / 履约链客户。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-4">
          <input type="hidden" name="selectionMode" value={selectionMode} />
          {selectionMode === "filtered" ? (
            <FilterHiddenInputs filters={filters} />
          ) : (
            selectedCustomerIds.map((customerId) => (
              <input key={customerId} type="hidden" name="customerIds" value={customerId} />
            ))
          )}
          <input type="hidden" name="reasonCode" value="mistaken_creation" />

          <div className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            {selectionMode === "filtered"
              ? `这次会按当前筛选结果检查 ${selectedCount} 位客户，并逐条复用现有 recycle move guard。`
              : "这次会按当前页手选客户逐条复用现有 recycle move guard，不做批量恢复、批量永久删除或批量最终封存。"}
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "提交中..." : "确认移入回收站"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CustomersTable({
  items,
  pagination,
  callResultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  moveToRecycleBinAction,
  canBatchAddTags = false,
  canBatchMoveToRecycleBin = false,
  batchTagOptions = [],
  emptyTitle,
  emptyDescription,
  filters,
  pageSizeControl,
  headerAction,
  scrollTargetId,
}: Readonly<{
  items: CustomerListItem[];
  pagination: PaginationData;
  callResultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  moveToRecycleBinAction?: MoveCustomerToRecycleBinAction;
  canBatchAddTags?: boolean;
  canBatchMoveToRecycleBin?: boolean;
  batchTagOptions?: BatchTagOption[];
  emptyTitle: string;
  emptyDescription: string;
  filters: CustomerCenterFilters;
  pageSizeControl?: ReactNode;
  headerAction?: ReactNode;
  scrollTargetId?: string;
}>) {
  const [viewMode, setViewMode] = useState<CustomerViewMode>("table");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("manual");
  const currentPageSelectionKey = `${pagination.page}:${items.map((item) => item.id).join(",")}`;
  const [pageSelection, setPageSelection] = useState<PageSelectionState>({
    pageKey: currentPageSelectionKey,
    ids: [],
  });
  const [batchTagDialogOpen, setBatchTagDialogOpen] = useState(false);
  const [batchRecycleDialogOpen, setBatchRecycleDialogOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [batchTagNotice, setBatchTagNotice] = useState<CustomerBatchActionNoticeState>(
    initialBatchTagNoticeState,
  );
  const [batchRecycleNotice, setBatchRecycleNotice] = useState<CustomerBatchActionNoticeState>(
    initialBatchRecycleNoticeState,
  );
  const [followUpDialogState, setFollowUpDialogState] = useState<FollowUpDialogState>({
    item: null,
    initialResult: "",
  });
  const [batchTagPending, startBatchTagTransition] = useTransition();
  const [batchRecyclePending, startBatchRecycleTransition] = useTransition();
  const router = useRouter();

  const manualSelectedIds =
    pageSelection.pageKey === currentPageSelectionKey ? pageSelection.ids : [];
  const selectedCount =
    selectionMode === "filtered" ? pagination.totalCount : manualSelectedIds.length;
  const allCurrentPageSelected =
    items.length > 0 &&
    (selectionMode === "filtered" || manualSelectedIds.length === items.length);
  const canBatchSelect = canBatchAddTags || canBatchMoveToRecycleBin;
  const filteredSelectionExceedsLimit =
    canBatchSelect && pagination.totalCount > MAX_BATCH_CUSTOMER_ACTION_SIZE;
  const canSelectFiltered =
    canBatchSelect &&
    pagination.totalCount > items.length &&
    !filteredSelectionExceedsLimit;
  const batchExecutionBlockedByLimit =
    selectionMode === "filtered" && filteredSelectionExceedsLimit;
  const showBatchIdleBar = canBatchSelect && selectedCount === 0;
  const showBatchActiveBar = canBatchSelect && selectedCount > 0;

  useEffect(() => {
    const stored = window.localStorage.getItem(customerViewStorageKey);

    if (stored !== "cards" && stored !== "table") {
      return;
    }

    const timer = window.setTimeout(() => {
      setViewMode(stored);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  function handleChangeView(nextValue: CustomerViewMode) {
    setViewMode(nextValue);
    window.localStorage.setItem(customerViewStorageKey, nextValue);
  }

  function resetSelection() {
    setSelectionMode("manual");
    setPageSelection({
      pageKey: currentPageSelectionKey,
      ids: [],
    });
  }

  function toggleSelected(customerId: string) {
    if (selectionMode === "filtered") {
      setSelectionMode("manual");
      setPageSelection({
        pageKey: currentPageSelectionKey,
        ids: [customerId],
      });
      return;
    }

    setPageSelection({
      pageKey: currentPageSelectionKey,
      ids: manualSelectedIds.includes(customerId)
        ? manualSelectedIds.filter((id) => id !== customerId)
        : [...manualSelectedIds, customerId],
    });
  }

  function toggleSelectAllCurrentPage() {
    if (selectionMode === "filtered") {
      resetSelection();
      return;
    }

    setPageSelection({
      pageKey: currentPageSelectionKey,
      ids:
        manualSelectedIds.length === items.length ? [] : items.map((item) => item.id),
    });
  }

  function selectFilteredResults() {
    if (!canSelectFiltered) {
      return;
    }

    setSelectionMode("filtered");
    setPageSelection({
      pageKey: currentPageSelectionKey,
      ids: [],
    });
  }

  function openBatchTagDialog() {
    setBatchRecycleNotice(initialBatchRecycleNoticeState);
    setBatchTagNotice(initialBatchTagNoticeState);
    setSelectedTagId("");
    setBatchTagDialogOpen(true);
  }

  function closeBatchTagDialog() {
    setBatchTagDialogOpen(false);
    setSelectedTagId("");
  }

  function openBatchRecycleDialog() {
    setBatchTagNotice(initialBatchTagNoticeState);
    setBatchRecycleNotice(initialBatchRecycleNoticeState);
    setBatchRecycleDialogOpen(true);
  }

  function closeBatchRecycleDialog() {
    setBatchRecycleDialogOpen(false);
  }

  function openFollowUpDialog(
    item: CustomerListItem,
    options: Partial<Omit<FollowUpDialogState, "item">> = {},
  ) {
    setFollowUpDialogState({
      item,
      initialResult: options.initialResult ?? getSuggestedFollowUpResult(item),
    });
  }

  function closeFollowUpDialog() {
    setFollowUpDialogState({
      item: null,
      initialResult: "",
    });
  }

  function handleBatchTagSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startBatchTagTransition(async () => {
      const nextState = await batchAddCustomerTagAction(formData);
      setBatchTagNotice(nextState);
      closeBatchTagDialog();

      if (nextState.summary.successCount > 0) {
        resetSelection();
        router.refresh();
      }
    });
  }

  function handleBatchRecycleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startBatchRecycleTransition(async () => {
      const nextState = await batchMoveCustomersToRecycleBinAction(formData);
      setBatchRecycleNotice(nextState);
      closeBatchRecycleDialog();

      if (nextState.summary.successCount > 0 || nextState.summary.skippedCount > 0) {
        resetSelection();
        router.refresh();
      }
    });
  }

  const baseColumns = [
    {
      key: "customer",
      title: "客户 / 电话",
      headerClassName: "w-[22%]",
      render: (row: CustomerListItem) => (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/customers/${row.id}`}
              className="text-sm font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
            >
              {row.name}
            </Link>
            <button
              type="button"
              onClick={() =>
                openFollowUpDialog(row, {
                  initialResult:
                    (row.newImported && row.pendingFirstCall
                      ? ""
                      : getCustomerExecutionClassQuickResult(row.executionClass)) ||
                    getSuggestedFollowUpResult(row),
                })
              }
              className={cn(
                "inline-flex h-6.5 items-center rounded-full border px-2.5 text-[11px] font-medium tracking-[0.04em] outline-none transition-[border-color,background-color,color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] focus-visible:ring-2 focus-visible:ring-black/8",
                quietExecutionButtonVariantClassNames[
                  getCustomerExecutionDisplayVariant({
                    executionClass: row.executionClass,
                    newImported: row.newImported,
                    pendingFirstCall: row.pendingFirstCall,
                  })
                ],
              )}
            >
              {getCustomerExecutionDisplayLongLabel({
                executionClass: row.executionClass,
                newImported: row.newImported,
                pendingFirstCall: row.pendingFirstCall,
              })}
            </button>
          </div>
          <CustomerPhoneSpotlight
            customerId={row.id}
            customerName={row.name}
            phone={row.phone}
            triggerSource="table"
            className="shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow] duration-150 hover:border-[rgba(122,154,255,0.16)] hover:bg-[var(--color-shell-hover)]"
          />
          <div className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            <span className="block max-w-[18rem] truncate" title={getCustomerAddress(row)}>
              {getCustomerAddress(row)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      title: "负责人 / 当前进展",
      headerClassName: "w-[16%]",
      render: (row: CustomerListItem) => {
        const progressSummary = getProgressSummary(row);

        return (
          <div className="space-y-1.5">
            <div className="text-[13px] font-medium text-[var(--foreground)]">
              {getOwnerLabel(row)}
            </div>
            <div className="space-y-0.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              <p className="font-medium text-[var(--foreground)]">{progressSummary.primary}</p>
              <p>{progressSummary.secondary}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: "signal",
      title: "导入字段 / 已购",
      headerClassName: "w-[18%]",
      render: (row: CustomerListItem) => (
        <div className="space-y-1.5">
          <div
            className="max-w-[18rem] truncate text-[13px] font-medium text-[var(--foreground)]"
            title={getPrimarySignal(row)}
          >
            {getPrimarySignal(row)}
          </div>
          <div className="space-y-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            <p>{getSignalMeta(row)}</p>
            <p>
              成交 {row.approvedTradeOrderCount} 单
              {Number(row.lifetimeTradeAmount) > 0.009
                ? ` · 累计 ${formatCurrency(row.lifetimeTradeAmount)}`
                : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "calls",
      title: "通话推进",
      headerClassName: "w-[18%]",
      render: (row: CustomerListItem) => {
        const latestCallRecord = getLatestCallRecord(row);

        return (
          <div className="space-y-1.5 px-2 py-1.5">
            <p className="text-[13px] font-medium text-[var(--foreground)]">
              {latestCallRecord ? latestCallRecord.resultLabel : "暂无通话结果"}
            </p>
            <div className="space-y-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              <p>{`累计通话 ${row._count.callRecords} 次`}</p>
              <p title={row.latestFollowUpAt ? formatDateTime(row.latestFollowUpAt) : "暂无跟进记录"}>
                {row.latestFollowUpAt
                  ? `最近跟进 ${formatRelativeDateTime(row.latestFollowUpAt)}`
                  : "最近跟进 暂无"}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: "remark",
      title: "备注",
      headerClassName: "w-[18%] min-w-[260px]",
      render: (row: CustomerListItem) => (
        <InlineCustomerRemarkField
          key={`${row.id}:${row.remark ?? ""}`}
          customerId={row.id}
          initialValue={row.remark}
        />
      ),
    },
    {
      key: "actions",
      title: "动作",
      headerClassName: "w-[12%] text-center",
      className: "text-center",
      cellStyle: {
        verticalAlign: "middle",
      },
      render: (row: CustomerListItem) => (
        <div className="flex w-full items-center justify-center">
          <Link
            href={`/customers/${row.id}`}
            className="crm-button crm-button-secondary inline-flex h-7 items-center rounded-[9px] px-2.5 text-[11px] font-medium motion-safe:hover:-translate-y-[1px] xl:h-8 xl:rounded-[10px] xl:px-3 xl:text-[12px]"
          >
            详情
          </Link>
        </div>
      ),
    },
  ];

  const columns = canBatchSelect
    ? [
        {
          key: "selection",
          title: "选择",
          headerClassName: "w-[56px]",
          render: (row: CustomerListItem) => (
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={selectionMode === "filtered" || manualSelectedIds.includes(row.id)}
                onChange={() => toggleSelected(row.id)}
                aria-label={`选择客户 ${row.name}`}
                className="h-4 w-4 rounded border border-[var(--color-border)] bg-transparent text-[var(--color-accent)] focus:ring-[var(--color-accent-soft)]"
              />
            </div>
          ),
        },
        ...baseColumns,
      ]
    : baseColumns;

  return (
    <>
      <div id={scrollTargetId} className="space-y-4">
        <DataTableWrapper
          title="客户列表"
          headerMode="hidden"
          className="rounded-[1.1rem] border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-md)]"
        >
          {items.length === 0 ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
                  <div className="md:hidden">
                    <CustomerViewToggle value={viewMode} onChange={handleChangeView} />
                  </div>
                </div>
                <p className="text-[12px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
                  共 {pagination.totalCount} 位客户
                </p>
              </div>

              <EmptyState
                title={emptyTitle}
                description={emptyDescription}
                action={
                  <Link
                    href={buildCustomersHref(filters, { page: 1 })}
                    scroll={false}
                    className="crm-button crm-button-secondary"
                  >
                    重置筛选
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
                  <div className="md:hidden">
                    <CustomerViewToggle value={viewMode} onChange={handleChangeView} />
                  </div>
                </div>
                <p className="text-[12px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
                  共 {pagination.totalCount} 位客户
                </p>
              </div>

              <BatchActionNoticeBanner
                state={batchTagNotice}
                successLabel="成功添加"
                entityCountLabel="位客户"
                countUnitLabel="位"
              />
              <BatchActionNoticeBanner
                state={batchRecycleNotice}
                successLabel="成功移入回收站"
                entityCountLabel="位客户"
                countUnitLabel="位"
              />

              {batchRecycleNotice.blockedReasonSummary.length > 0 ? (
                <CustomerRecycleBlockedReasonSummary
                  items={batchRecycleNotice.blockedReasonSummary}
                />
              ) : null}

              {showBatchIdleBar ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[0.95rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface)]/55 px-3.5 py-2.5">
                  <div className="space-y-0.5">
                    <p className="text-[13px] font-medium text-[var(--foreground)]">批量处理</p>
                    <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                      先勾选客户，批量动作再展开。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={toggleSelectAllCurrentPage}
                    className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm motion-safe:hover:-translate-y-[1px]"
                  >
                    全选当前页
                  </button>
                </div>
              ) : null}

              {showBatchActiveBar ? (
                <div
                  className={cn(
                    "space-y-3 rounded-[0.98rem] border px-3.5 py-3",
                    batchExecutionBlockedByLimit
                      ? "border-[rgba(141,59,51,0.16)] bg-[rgba(255,247,246,0.92)]"
                      : selectionMode === "filtered"
                        ? "border-[var(--color-accent-soft)] bg-[var(--color-accent)]/8"
                        : "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)]",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="text-[13px] font-medium text-[var(--foreground)]">
                        {selectionMode === "filtered"
                          ? `当前筛选结果 ${pagination.totalCount} 位已选`
                          : `已选择 ${selectedCount} 位客户`}
                      </p>
                      <p
                        className={cn(
                          "text-[12px] leading-5",
                          batchExecutionBlockedByLimit
                            ? "text-[var(--color-danger)]"
                            : "text-[var(--color-sidebar-muted)]",
                        )}
                      >
                        {batchExecutionBlockedByLimit
                          ? `当前筛选结果超过单次 ${MAX_BATCH_CUSTOMER_ACTION_SIZE} 位上限，请先缩小范围。`
                          : selectionMode === "filtered"
                            ? "批量动作将应用到整个筛选结果。"
                            : allCurrentPageSelected && canSelectFiltered
                              ? `当前页已全选，可继续扩展到 ${pagination.totalCount} 位筛选结果。`
                              : "现在可以继续执行批量添加标签或移入回收站。"}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {selectionMode === "manual" && allCurrentPageSelected && pagination.totalCount > items.length ? (
                        canSelectFiltered ? (
                          <button
                            type="button"
                            onClick={selectFilteredResults}
                            className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm motion-safe:hover:-translate-y-[1px]"
                          >
                            选择全部 {pagination.totalCount} 位
                          </button>
                        ) : (
                          <span className="text-[12px] text-[var(--color-sidebar-muted)]">
                            当前筛选结果超过 {MAX_BATCH_CUSTOMER_ACTION_SIZE} 位上限
                          </span>
                        )
                      ) : null}

                      <button
                        type="button"
                        onClick={toggleSelectAllCurrentPage}
                        className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm motion-safe:hover:-translate-y-[1px]"
                      >
                        {selectionMode === "filtered"
                          ? "取消跨页选择"
                          : allCurrentPageSelected
                            ? "取消当前页全选"
                            : "全选当前页"}
                      </button>

                      {selectionMode === "manual" ? (
                        <button
                          type="button"
                          onClick={resetSelection}
                          className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm motion-safe:hover:-translate-y-[1px]"
                        >
                          清空选择
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-soft)] pt-3">
                    <div className="text-[12px] text-[var(--color-sidebar-muted)]">
                      {canBatchAddTags && batchTagOptions.length === 0 ? "当前暂无可用标签" : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {canBatchAddTags ? (
                        <button
                          type="button"
                          onClick={openBatchTagDialog}
                          disabled={batchTagOptions.length === 0 || batchExecutionBlockedByLimit}
                          className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-55"
                        >
                          批量添加标签
                        </button>
                      ) : null}
                      {canBatchMoveToRecycleBin ? (
                        <button
                          type="button"
                          onClick={openBatchRecycleDialog}
                          disabled={batchExecutionBlockedByLimit}
                          className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm text-[var(--color-danger)] motion-safe:hover:-translate-y-[1px] hover:border-[rgba(141,59,51,0.16)] hover:bg-[rgba(255,247,246,0.88)] disabled:cursor-not-allowed disabled:text-[var(--color-sidebar-muted)] disabled:opacity-55"
                        >
                          批量移入回收站
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:hidden">
                {viewMode === "cards" ? (
                  <div className="grid grid-cols-1 gap-3">
                    {items.map((item) => (
                      <CustomerListCard
                        key={item.id}
                        item={item}
                        callResultOptions={callResultOptions}
                        canCreateCallRecord={canCreateCallRecord}
                        canCreateSalesOrder={canCreateSalesOrder}
                        moveToRecycleBinAction={moveToRecycleBinAction}
                        selectable={canBatchSelect}
                        selected={
                          selectionMode === "filtered" || manualSelectedIds.includes(item.id)
                        }
                        onToggleSelected={() => toggleSelected(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <EntityTable
                    density="compact"
                    rows={items}
                    getRowKey={(row) => row.id}
                    columns={columns}
                  />
                )}
              </div>

              <div className="hidden md:block">
                <EntityTable
                  density="compact"
                  rows={items}
                  getRowKey={(row) => row.id}
                  columns={columns}
                />
              </div>
            </div>
          )}
        </DataTableWrapper>

        {canCreateCallRecord ? (
          <MobileCallFollowUpSheet
            scope={{
              kind: "list",
              customerIds: items.map((item) => item.id),
            }}
            resultOptions={callResultOptions}
          />
        ) : null}

        {items.length > 0 ? (
          <div className="[&>div]:rounded-[18px] [&>div]:border-[var(--color-border-soft)] [&>div]:bg-[var(--color-panel-soft)] [&>div]:px-4 [&>div]:py-3 [&>div]:shadow-[var(--color-shell-shadow-sm)] [&_.crm-toolbar-cluster]:gap-2 [&_a]:h-8 [&_a]:rounded-[10px] [&_a]:px-3 [&_a]:py-0 [&_a]:text-[13px] [&_a]:shadow-none [&_a]:hover:translate-y-0 [&_p]:text-[13px] [&_p]:leading-5">
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              summary={`当前第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.totalCount} 位客户`}
              buildHref={(page) => buildCustomersHref(filters, { page })}
              rightSlot={pageSizeControl}
              scrollTargetId={scrollTargetId}
            />
          </div>
        ) : null}
      </div>

      <CustomerFollowUpDialog
        open={Boolean(followUpDialogState.item)}
        item={followUpDialogState.item}
        resultOptions={callResultOptions}
        canCreateCallRecord={canCreateCallRecord}
        canCreateSalesOrder={canCreateSalesOrder}
        initialResult={followUpDialogState.initialResult}
        triggerSource="table"
        onClose={closeFollowUpDialog}
      />

      <BatchTagDialog
        open={batchTagDialogOpen}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        filters={filters}
        tagOptions={batchTagOptions}
        selectedTagId={selectedTagId}
        pending={batchTagPending}
        onClose={closeBatchTagDialog}
        onTagChange={setSelectedTagId}
        onSubmit={handleBatchTagSubmit}
        selectedCustomerIds={manualSelectedIds}
      />

      <BatchRecycleDialog
        open={batchRecycleDialogOpen}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        filters={filters}
        pending={batchRecyclePending}
        onClose={closeBatchRecycleDialog}
        onSubmit={handleBatchRecycleSubmit}
        selectedCustomerIds={manualSelectedIds}
      />
    </>
  );
}
