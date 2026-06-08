"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckSquare2 } from "lucide-react";
import {
  batchAddCustomerTagAction,
  batchForceHardDeleteCustomersAction,
  batchMoveCustomersToRecycleBinAction,
  batchTransferCustomerOwnerAction,
} from "@/app/(dashboard)/customers/actions";
import {
  BatchForceDeleteDialog,
  BatchOwnerTransferDialog,
  BatchRecycleDialog,
  BatchRecycleRequestDialog,
  BatchTagDialog,
  type BatchTagOption,
  type SelectionMode,
} from "@/components/customers/customer-batch-dialogs";
import {
  type CustomerViewMode,
  getCustomerAddress,
  getCustomerInitial,
  getLatestCallRecord,
  getOwnerLabel,
  getProgressSummary,
  getSuggestedFollowUpResult,
  isRecentIsoDate,
  notifyCustomerBatchActionResult,
  readJsonStorageValue,
} from "@/components/customers/customer-list-helpers";
import { CustomerPhoneSpotlight } from "@/components/customers/customer-phone-spotlight";
import { InlineCustomerRemarkField } from "@/components/customers/inline-customer-remark-field";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import { CustomerRecycleBlockedReasonSummary } from "@/components/customers/customer-recycle-blocked-reason-summary";
import { type MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { CustomersTableBatchActionBar } from "@/components/customers/customers-table-batch-action-bar";
import {
  BlockedReasonStrip,
  CustomerGradeBadge,
  ExecutionBadge,
  executionBadgeClassNames,
  ListTopBar,
  RemarkPreviewTrigger,
  RowActions,
} from "@/components/customers/customers-table-bits";
import { CustomersTablePaginationButtons } from "@/components/customers/customers-table-pagination";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityTable } from "@/components/shared/entity-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { notifyToast } from "@/components/shared/toast-provider";
import { buildCursorHref, decodeCursor } from "@/lib/customers/list-cursor";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  createInitialCustomerBatchActionNoticeState,
  type CustomerBatchActionNoticeState,
} from "@/lib/customers/batch-action-contract";
import { buildCustomersHref } from "@/lib/customers/filter-url";
import {
  getCustomerExecutionDisplayVariant,
  getCustomerExecutionClassQuickResult,
  formatDateTime,
  MAX_BATCH_CUSTOMER_ACTION_SIZE,
} from "@/lib/customers/metadata";
import type {
  CustomerCenterFilters,
  CustomerListItem,
  SalesRepBoardItem,
} from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

const CustomerDetailSheet = dynamic(
  () =>
    import("@/components/customers/customer-detail-sheet").then(
      (m) => m.CustomerDetailSheet,
    ),
  { ssr: false, loading: () => null },
);

const CustomerFollowUpDialog = dynamic(
  () =>
    import("@/components/customers/customer-follow-up-dialog").then(
      (m) => m.CustomerFollowUpDialog,
    ),
  { ssr: false, loading: () => null },
);

const MobileCallFollowUpSheet = dynamic(
  () =>
    import("@/components/customers/mobile-call-followup-sheet").then(
      (m) => m.MobileCallFollowUpSheet,
    ),
  { ssr: false, loading: () => null },
);

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  mode?: "page" | "cursor";
  nextCursor?: string | null;
  currentCursor?: string | null;
};

type PageSelectionState = { pageKey: string; ids: string[] };

type FollowUpDialogState = {
  item: CustomerListItem | null;
  initialResult: string;
  remarkAutoFocus: boolean;
};

type FocusedCustomerState = {
  id: string;
  name: string;
  phone: string;
  touchedAt: string;
};

type CustomerListScrollState = {
  top: number;
  customerId?: string;
  touchedAt: string;
};

const VIEW_STORAGE_KEY = "customer-center-view-mode";
const FOCUS_STORAGE_KEY = "customer-center-last-focused-customer";
const SCROLL_STORAGE_PREFIX = "customer-center-scroll:";
const FOCUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SCROLL_MAX_AGE_MS = 30 * 60 * 1000;
const initialBatchRecycleNoticeState =
  createInitialCustomerBatchActionNoticeState("已在回收站");
const initialBatchTransferNoticeState =
  createInitialCustomerBatchActionNoticeState("无需移交");
const initialBatchForceDeleteNoticeState =
  createInitialCustomerBatchActionNoticeState("跳过");

function getCallsSummaryText(latestFollowUpAt: Date | null, totalCallCount: number) {
  if (!latestFollowUpAt) {
    return totalCallCount > 0 ? `累计 ${totalCallCount} 次` : "暂无通话";
  }
  const diffDays = Math.max(
    0,
    Math.floor((Date.now() - latestFollowUpAt.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return `${diffDays === 0 ? "今日" : `近 ${diffDays} 天`} · ${totalCallCount} 次`;
}

function getRecentProductText(row: CustomerListItem) {
  return row.latestInterestedProduct ?? row.latestPurchasedProduct ?? "暂无意向商品";
}

export function CustomersTable({
  items,
  pagination,
  callResultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  outboundCallEnabled = false,
  moveToRecycleBinAction,
  canBatchAddTags = false,
  canBatchTransferOwner = false,
  canBatchMoveToRecycleBin = false,
  canBatchForceHardDelete = false,
  batchTagOptions = [],
  batchOwnerTransferOptions = [],
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
  outboundCallEnabled?: boolean;
  moveToRecycleBinAction?: MoveCustomerToRecycleBinAction;
  canBatchAddTags?: boolean;
  canBatchTransferOwner?: boolean;
  canBatchMoveToRecycleBin?: boolean;
  canBatchForceHardDelete?: boolean;
  batchTagOptions?: BatchTagOption[];
  batchOwnerTransferOptions?: SalesRepBoardItem[];
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
  const [batchOwnerTransferDialogOpen, setBatchOwnerTransferDialogOpen] = useState(false);
  const [batchRecycleDialogOpen, setBatchRecycleDialogOpen] = useState(false);
  // 销售自助"申请回收" — 本波只 UI, 无服务端动作.
  const [batchRecycleRequestDialogOpen, setBatchRecycleRequestDialogOpen] = useState(false);
  const [batchForceDeleteDialogOpen, setBatchForceDeleteDialogOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [selectedTargetOwnerId, setSelectedTargetOwnerId] = useState("");
  const [batchForceDeleteConfirmation, setBatchForceDeleteConfirmation] = useState("");
  const [batchForceDeleteReason, setBatchForceDeleteReason] = useState("");
  const [batchTransferNotice, setBatchTransferNotice] =
    useState<CustomerBatchActionNoticeState>(initialBatchTransferNoticeState);
  const [batchRecycleNotice, setBatchRecycleNotice] =
    useState<CustomerBatchActionNoticeState>(initialBatchRecycleNoticeState);
  const [batchForceDeleteNotice, setBatchForceDeleteNotice] =
    useState<CustomerBatchActionNoticeState>(initialBatchForceDeleteNoticeState);
  const [followUpDialogState, setFollowUpDialogState] = useState<FollowUpDialogState>({
    item: null,
    initialResult: "",
    remarkAutoFocus: false,
  });
  const [sheetCustomer, setSheetCustomer] = useState<CustomerListItem | null>(null);
  const [focusedCustomer, setFocusedCustomer] = useState<FocusedCustomerState | null>(null);
  const [batchTagPending, startBatchTagTransition] = useTransition();
  const [batchOwnerTransferPending, startBatchOwnerTransferTransition] = useTransition();
  const [batchRecyclePending, startBatchRecycleTransition] = useTransition();
  const [batchForceDeletePending, startBatchForceDeleteTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname() || "/customers";
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams.toString();
  const scrollStateKey = `${SCROLL_STORAGE_PREFIX}${pathname}?${searchParamsKey}`;

  // 客户列表 navigation pending — 监听本组件作用域内的 anchor click 作为
  // navigation start, URL 变化即结束. 主要让用户在翻页 / 改 filter / 改
  // pageSize 期间, 表格立即变 dim, 避免连点 + frozen 假象.
  const tableRef = useRef<HTMLDivElement>(null);
  const [navPending, setNavPending] = useState(false);
  const [navPendingKey, setNavPendingKey] = useState<string | null>(null);
  const currentNavKey = `${pathname}?${searchParamsKey}`;

  // render-phase 比对: pending 期间 URL 变化即认为 navigation 完成. 写法对齐
  // customer-filter-toolbar 的 searchDraft 同步; 避免 effect 内 setState 触发
  // cascading render (react-hooks/set-state-in-effect).
  if (navPending && navPendingKey !== null && navPendingKey !== currentNavKey) {
    setNavPending(false);
    setNavPendingKey(null);
  }

  useEffect(() => {
    const container = tableRef.current;
    if (!container) return undefined;
    const scopedContainer = container;
    function handleClick(event: MouseEvent) {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        event.defaultPrevented
      ) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor || !scopedContainer.contains(anchor)) return;
      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href === "#" || href.startsWith("javascript:")) return;
      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
      } catch {
        return;
      }
      setNavPending(true);
      setNavPendingKey(`${window.location.pathname}?${window.location.search.replace(/^\?/, "")}`);
    }
    container.addEventListener("click", handleClick, true);
    return () => container.removeEventListener("click", handleClick, true);
  }, []);

  const manualSelectedIds =
    pageSelection.pageKey === currentPageSelectionKey ? pageSelection.ids : [];
  const selectedCount =
    selectionMode === "filtered" ? pagination.totalCount : manualSelectedIds.length;
  const selectedIdSet = new Set(manualSelectedIds);
  const manualSelectedItems = items.filter((item) => selectedIdSet.has(item.id));
  const manualRecycleEligibleCount = manualSelectedItems.filter(
    (item) => item.recycleGuard.canMoveToRecycleBin,
  ).length;
  const allCurrentPageSelected =
    items.length > 0 &&
    (selectionMode === "filtered" || manualSelectedIds.length === items.length);
  const canBatchSelect =
    canBatchAddTags ||
    canBatchTransferOwner ||
    canBatchMoveToRecycleBin ||
    canBatchForceHardDelete;
  const filteredSelectionExceedsLimit =
    canBatchSelect && pagination.totalCount > MAX_BATCH_CUSTOMER_ACTION_SIZE;
  const canSelectFiltered =
    canBatchSelect &&
    pagination.totalCount > items.length &&
    !filteredSelectionExceedsLimit;
  const batchExecutionBlockedByLimit =
    selectionMode === "filtered" && filteredSelectionExceedsLimit;
  const manualRecycleUnavailable =
    selectionMode === "manual" &&
    manualSelectedIds.length > 0 &&
    manualRecycleEligibleCount === 0;
  const batchRecycleDisabled =
    batchExecutionBlockedByLimit || manualRecycleUnavailable;
  const showBatchQuickSelect = canBatchSelect && selectedCount === 0;
  const showBatchActiveBar = canBatchSelect && selectedCount > 0;
  const hasBatchOwnerTransferOptions = batchOwnerTransferOptions.length > 0;

  // 危险/阻断: 显式 hint; 常规: short hint (按钮自带 tooltip).
  const batchBarDangerHint = batchExecutionBlockedByLimit
    ? `超过单次 ${MAX_BATCH_CUSTOMER_ACTION_SIZE} 位上限，请缩小范围。`
    : manualRecycleUnavailable && canBatchMoveToRecycleBin
      ? canBatchForceHardDelete
        ? "已选客户均不满足回收条件；如需彻底删除，请走硬删确认。"
        : "已选客户有归属或导入历史，无法自助回收。"
      : null;
  const batchBarNeutralHint =
    selectionMode === "filtered"
      ? "动作将应用到整个筛选结果"
      : allCurrentPageSelected && canSelectFiltered
        ? `可扩展到 ${pagination.totalCount} 位`
        : "标签 / 移交 / 回收";

  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored !== "cards" && stored !== "table") return;
    const timer = window.setTimeout(() => setViewMode(stored), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const parsed = readJsonStorageValue<Partial<FocusedCustomerState>>(
      window.localStorage,
      FOCUS_STORAGE_KEY,
    );
    if (!parsed) return;
    if (
      !parsed.id ||
      !parsed.name ||
      !parsed.phone ||
      !isRecentIsoDate(parsed.touchedAt, FOCUS_MAX_AGE_MS)
    ) {
      window.localStorage.removeItem(FOCUS_STORAGE_KEY);
      return;
    }
    const timer = window.setTimeout(
      () => setFocusedCustomer(parsed as FocusedCustomerState),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const parsed = readJsonStorageValue<Partial<CustomerListScrollState>>(
      window.sessionStorage,
      scrollStateKey,
    );
    if (
      !parsed ||
      typeof parsed.top !== "number" ||
      !Number.isFinite(parsed.top) ||
      !isRecentIsoDate(parsed.touchedAt, SCROLL_MAX_AGE_MS)
    ) {
      window.sessionStorage.removeItem(scrollStateKey);
      return;
    }
    const restoredTop = parsed.top;
    const restoredCustomerId = parsed.customerId;
    const timer = window.setTimeout(() => {
      const focusedRow = restoredCustomerId
        ? document.getElementById(`customer-row-${restoredCustomerId}`)
        : null;
      if (focusedRow) {
        focusedRow.scrollIntoView({ block: "center", inline: "nearest" });
        return;
      }
      window.scrollTo({ top: Math.max(0, restoredTop), behavior: "auto" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [scrollStateKey]);

  function rememberListPosition(customerId?: string) {
    window.sessionStorage.setItem(
      scrollStateKey,
      JSON.stringify({
        top: window.scrollY,
        customerId,
        touchedAt: new Date().toISOString(),
      } satisfies CustomerListScrollState),
    );
  }

  function rememberFocusedCustomer(item: CustomerListItem) {
    const next = {
      id: item.id,
      name: item.name,
      phone: item.phone,
      touchedAt: new Date().toISOString(),
    } satisfies FocusedCustomerState;
    setFocusedCustomer(next);
    rememberListPosition(item.id);
    window.localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(next));
  }

  function handleChangeView(nextValue: CustomerViewMode) {
    setViewMode(nextValue);
    window.localStorage.setItem(VIEW_STORAGE_KEY, nextValue);
  }

  function resetSelection() {
    setSelectionMode("manual");
    setPageSelection({ pageKey: currentPageSelectionKey, ids: [] });
  }

  function toggleSelected(customerId: string) {
    if (selectionMode === "filtered") {
      setSelectionMode("manual");
      setPageSelection({ pageKey: currentPageSelectionKey, ids: [customerId] });
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
      ids: manualSelectedIds.length === items.length ? [] : items.map((i) => i.id),
    });
  }

  function selectFilteredResults() {
    if (!canSelectFiltered) return;
    setSelectionMode("filtered");
    setPageSelection({ pageKey: currentPageSelectionKey, ids: [] });
  }

  function resetNotices() {
    setBatchRecycleNotice(initialBatchRecycleNoticeState);
    setBatchTransferNotice(initialBatchTransferNoticeState);
    setBatchForceDeleteNotice(initialBatchForceDeleteNoticeState);
  }

  function openBatchTagDialog() {
    resetNotices();
    setSelectedTagId("");
    setBatchTagDialogOpen(true);
  }

  function closeBatchTagDialog() {
    setBatchTagDialogOpen(false);
    setSelectedTagId("");
  }

  function openBatchOwnerTransferDialog() {
    resetNotices();
    setSelectedTargetOwnerId("");
    setBatchOwnerTransferDialogOpen(true);
  }

  function closeBatchOwnerTransferDialog() {
    setBatchOwnerTransferDialogOpen(false);
    setSelectedTargetOwnerId("");
  }

  function openBatchRecycleDialog() {
    resetNotices();
    setBatchRecycleDialogOpen(true);
  }

  function closeBatchRecycleDialog() {
    setBatchRecycleDialogOpen(false);
  }

  function openBatchRecycleRequestDialog() {
    setBatchRecycleDialogOpen(false);
    setBatchRecycleRequestDialogOpen(true);
  }

  function closeBatchRecycleRequestDialog() {
    setBatchRecycleRequestDialogOpen(false);
  }

  function confirmBatchRecycleRequest() {
    setBatchRecycleRequestDialogOpen(false);
    // TODO (下一 PR): 接入 requestRecycleApproval server action + OperationLog.
    notifyToast({
      title: "已发送回收申请到主管",
      description:
        "审批通过后由主管走硬删流程；申请已记录在客户中心，请等待审批结果。",
      tone: "info",
    });
    resetSelection();
  }

  function openBatchForceDeleteDialog() {
    resetNotices();
    setBatchForceDeleteConfirmation("");
    setBatchForceDeleteReason("");
    setBatchForceDeleteDialogOpen(true);
  }

  function closeBatchForceDeleteDialog() {
    setBatchForceDeleteDialogOpen(false);
  }

  function openFollowUpDialog(
    item: CustomerListItem,
    options: Partial<Omit<FollowUpDialogState, "item">> = {},
  ) {
    rememberFocusedCustomer(item);
    setFollowUpDialogState({
      item,
      initialResult: options.initialResult ?? getSuggestedFollowUpResult(item),
      remarkAutoFocus: options.remarkAutoFocus ?? false,
    });
  }

  function closeFollowUpDialog() {
    setFollowUpDialogState({ item: null, initialResult: "", remarkAutoFocus: false });
  }

  function openCustomerSheet(item: CustomerListItem) {
    rememberFocusedCustomer(item);
    setSheetCustomer(item);
  }

  function closeCustomerSheet() {
    setSheetCustomer(null);
  }

  function handleSpaciousRowClick(
    event: ReactMouseEvent<HTMLElement>,
    item: CustomerListItem,
  ) {
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "a,button,input,textarea,select,label,[data-row-interactive='true']",
      )
    ) {
      return;
    }
    openCustomerSheet(item);
  }

  function handleBatchTagSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startBatchTagTransition(async () => {
      const nextState = await batchAddCustomerTagAction(formData);
      closeBatchTagDialog();
      notifyCustomerBatchActionResult(nextState, {
        defaultTitle: "批量标签已处理",
        successLabel: "成功添加",
        countUnitLabel: "位",
      });
      if (nextState.summary.successCount > 0) {
        resetSelection();
        router.refresh();
      }
    });
  }

  function handleBatchOwnerTransferSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startBatchOwnerTransferTransition(async () => {
      const nextState = await batchTransferCustomerOwnerAction(formData);
      setBatchTransferNotice(nextState);
      closeBatchOwnerTransferDialog();
      notifyCustomerBatchActionResult(nextState, {
        defaultTitle: "批量移交已处理",
        successLabel: "成功移交",
        countUnitLabel: "位",
      });
      if (nextState.summary.successCount > 0 || nextState.summary.skippedCount > 0) {
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
      notifyCustomerBatchActionResult(nextState, {
        defaultTitle: "批量回收已处理",
        successLabel: "成功移入回收站",
        countUnitLabel: "位",
      });
      if (
        nextState.summary.successCount > 0 ||
        nextState.summary.skippedCount > 0 ||
        nextState.summary.blockedCount > 0
      ) {
        resetSelection();
        router.refresh();
      }
    });
  }

  function handleBatchForceDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startBatchForceDeleteTransition(async () => {
      const nextState = await batchForceHardDeleteCustomersAction(formData);
      setBatchForceDeleteNotice(nextState);
      closeBatchForceDeleteDialog();
      notifyCustomerBatchActionResult(nextState, {
        defaultTitle: "批量硬删除已处理",
        successLabel: "成功硬删除",
        countUnitLabel: "位",
      });
      if (nextState.summary.successCount > 0) {
        resetSelection();
        router.refresh();
      }
    });
  }

  // EntityTable columns - 仅 <md mobile "表格" 视图使用, 列已收敛.
  const baseColumns = [
    {
      key: "customer",
      title: "客户 / 电话",
      headerClassName: "w-[26%]",
      render: (row: CustomerListItem) => (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => openCustomerSheet(row)}
              className="text-left text-sm font-semibold text-foreground transition-colors hover:text-[var(--color-accent-strong)]"
            >
              {row.name}
            </button>
            <CustomerGradeBadge grade={row.grade} />
            <ExecutionBadge row={row} onClick={() => openFollowUpDialog(row, {
              initialResult:
                (row.newImported && row.pendingFirstCall
                  ? ""
                  : getCustomerExecutionClassQuickResult(row.executionClass)) ||
                getSuggestedFollowUpResult(row),
            })} />
          </div>
          <CustomerPhoneSpotlight
            customerId={row.id}
            customerName={row.name}
            phone={row.phone}
            triggerSource="table"
            onFocusCustomer={() => rememberFocusedCustomer(row)}
          />
        </div>
      ),
    },
    {
      key: "owner",
      title: "负责人 / 进展",
      headerClassName: "w-[18%]",
      render: (row: CustomerListItem) => {
        const progress = getProgressSummary(row);
        return (
          <div className="space-y-0.5">
            <div className="text-[13px] font-medium text-foreground">{getOwnerLabel(row)}</div>
            <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              {progress.primary}
            </p>
          </div>
        );
      },
    },
    {
      key: "recentProduct",
      title: "最近意向",
      headerClassName: "w-[18%]",
      render: (row: CustomerListItem) => (
        <p
          className="max-w-[16rem] truncate text-[13px] text-[var(--color-sidebar-muted)]"
          title={getRecentProductText(row)}
        >
          {getRecentProductText(row)}
        </p>
      ),
    },
    {
      key: "calls",
      title: "通话",
      headerClassName: "w-[14%]",
      render: (row: CustomerListItem) => (
        <p
          className="text-[13px] text-[var(--color-sidebar-muted)]"
          title={
            row.latestFollowUpAt ? formatDateTime(row.latestFollowUpAt) : "暂无跟进记录"
          }
        >
          {getCallsSummaryText(row.latestFollowUpAt, row._count.callRecords)}
        </p>
      ),
    },
    {
      key: "remark",
      title: "备注",
      headerClassName: "w-[14%] min-w-[180px]",
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
      headerClassName: "w-[10%] text-center",
      className: "text-center",
      cellStyle: { verticalAlign: "middle" },
      render: (row: CustomerListItem) => (
        <RowActions
          row={row}
          onOpenSheet={() => openCustomerSheet(row)}
          onOpenFollowUp={() => openFollowUpDialog(row)}
          onPopupOpen={() => rememberFocusedCustomer(row)}
          variant="compact"
        />
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
                checked={
                  selectionMode === "filtered" || manualSelectedIds.includes(row.id)
                }
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

  // Spacious rows: md+ 主视图. 行高从 py-6 → py-3 (≥50% 缩减).
  const spaciousRows = (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="divide-y divide-border">
        {items.map((row) => {
          const latestCallRecord = getLatestCallRecord(row);
          const remarkText = row.remark?.trim() ?? "";
          const executionVariant = getCustomerExecutionDisplayVariant({
            executionClass: row.executionClass,
            newImported: row.newImported,
            pendingFirstCall: row.pendingFirstCall,
          });
          const recentProduct = getRecentProductText(row);
          const callsText = getCallsSummaryText(
            row.latestFollowUpAt,
            row._count.callRecords,
          );

          return (
            <article
              key={row.id}
              id={`customer-row-${row.id}`}
              onClick={(event) => handleSpaciousRowClick(event, row)}
              className={cn(
                "group/customer-row grid cursor-pointer grid-cols-12 items-center gap-3 bg-card px-5 py-3 transition-colors duration-150 xl:px-6",
                "hover:bg-muted/40",
                focusedCustomer?.id === row.id &&
                  "scroll-mt-28 bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]",
              )}
            >
              {/* 客户身份 */}
              <div className="col-span-12 flex min-w-0 items-center gap-3 lg:col-span-4">
                {canBatchSelect ? (
                  <label
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-primary/30 hover:bg-muted"
                    data-row-interactive="true"
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectionMode === "filtered" ||
                        manualSelectedIds.includes(row.id)
                      }
                      onChange={() => toggleSelected(row.id)}
                      aria-label={`选择客户 ${row.name}`}
                      className="h-3.5 w-3.5 rounded border-border bg-card text-primary focus:ring-primary/15"
                    />
                  </label>
                ) : null}

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-sm font-bold text-primary">
                  {getCustomerInitial(row)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCustomerSheet(row)}
                      className="max-w-full truncate text-left text-[15px] font-semibold text-foreground transition-colors hover:text-primary"
                    >
                      {row.name}
                    </button>
                    <CustomerGradeBadge grade={row.grade} />
                    <ExecutionBadge
                      row={row}
                      compact
                      onClick={() =>
                        openFollowUpDialog(row, {
                          initialResult:
                            (row.newImported && row.pendingFirstCall
                              ? ""
                              : getCustomerExecutionClassQuickResult(
                                  row.executionClass,
                                )) || getSuggestedFollowUpResult(row),
                        })
                      }
                      variantClass={executionBadgeClassNames[executionVariant]}
                    />
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="truncate font-mono text-sm font-semibold leading-tight tracking-tight text-foreground tabular-nums">
                      {row.phone?.trim() || "暂无电话"}
                    </span>
                    <span
                      className="max-w-[14rem] truncate text-xs text-muted-foreground"
                      title={getCustomerAddress(row)}
                    >
                      {getCustomerAddress(row)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 负责人 + 最近意向 (单行) */}
              <div className="col-span-12 min-w-0 lg:col-span-4">
                <p
                  className="truncate text-[13px] text-foreground/80"
                  title={getOwnerLabel(row)}
                >
                  {getOwnerLabel(row)}
                </p>
                <p
                  className="mt-0.5 truncate text-xs text-muted-foreground"
                  title={recentProduct}
                >
                  最近意向 · {recentProduct}
                </p>
              </div>

              {/* 通话单行 + 备注 preview popover */}
              <div className="col-span-12 flex min-w-0 items-start gap-3 lg:col-span-3">
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-[13px] text-foreground/80"
                    title={
                      row.latestFollowUpAt
                        ? `最近跟进 ${formatDateTime(row.latestFollowUpAt)}`
                        : "暂无跟进记录"
                    }
                  >
                    {callsText}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs text-muted-foreground"
                    title={
                      latestCallRecord ? latestCallRecord.resultLabel : "暂无通话结果"
                    }
                  >
                    {latestCallRecord ? latestCallRecord.resultLabel : "暂无通话结果"}
                  </p>
                </div>
                <RemarkPreviewTrigger
                  hasRemark={remarkText.length > 0}
                  remarkText={remarkText}
                  onOpenEditor={() =>
                    openFollowUpDialog(row, { remarkAutoFocus: true })
                  }
                />
              </div>

              {/* 动作 */}
              <div className="col-span-12 flex items-center justify-end gap-1 lg:pointer-events-none lg:col-span-1 lg:opacity-0 lg:transition-opacity lg:duration-150 lg:group-hover/customer-row:pointer-events-auto lg:group-hover/customer-row:opacity-100 lg:group-focus-within/customer-row:pointer-events-auto lg:group-focus-within/customer-row:opacity-100">
                <RowActions
                  row={row}
                  onOpenSheet={() => openCustomerSheet(row)}
                  onOpenFollowUp={() => openFollowUpDialog(row)}
                  onPopupOpen={() => rememberFocusedCustomer(row)}
                  variant="spacious"
                />
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={tableRef}
        id={scrollTargetId}
        aria-busy={navPending}
        className={cn(
          "space-y-4 transition-opacity duration-200 ease-out",
          navPending && "pointer-events-none opacity-50",
        )}
      >
        <DataTableWrapper
          title="客户列表"
          headerMode="hidden"
          className="rounded-xl border-border bg-card shadow-sm"
          contentClassName="p-3 md:p-4"
        >
          {items.length === 0 ? (
            <div className="space-y-4">
              <ListTopBar
                headerAction={headerAction}
                viewMode={viewMode}
                onChangeView={handleChangeView}
                totalCount={pagination.totalCount}
                quickSelectButton={null}
              />
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
            <div className="space-y-3">
              <ListTopBar
                headerAction={headerAction}
                viewMode={viewMode}
                onChangeView={handleChangeView}
                totalCount={pagination.totalCount}
                quickSelectButton={
                  showBatchQuickSelect ? (
                    <button
                      type="button"
                      onClick={toggleSelectAllCurrentPage}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                    >
                      <CheckSquare2 className="h-3.5 w-3.5" />
                      <span>选择当前页</span>
                    </button>
                  ) : null
                }
              />

              {batchTransferNotice.blockedReasonSummary.length > 0 ? (
                <BlockedReasonStrip
                  title="移交阻断"
                  tone="warning"
                  summary={batchTransferNotice.blockedReasonSummary}
                />
              ) : null}

              {batchRecycleNotice.blockedReasonSummary.length > 0 ? (
                <CustomerRecycleBlockedReasonSummary
                  items={batchRecycleNotice.blockedReasonSummary}
                />
              ) : null}

              {batchForceDeleteNotice.blockedReasonSummary.length > 0 ? (
                <BlockedReasonStrip
                  title="硬删除阻断"
                  tone="danger"
                  summary={batchForceDeleteNotice.blockedReasonSummary}
                />
              ) : null}

              {showBatchActiveBar ? (
                <CustomersTableBatchActionBar
                  selectionMode={selectionMode}
                  pagination={pagination}
                  itemCount={items.length}
                  selectedCount={selectedCount}
                  allCurrentPageSelected={allCurrentPageSelected}
                  canSelectFiltered={canSelectFiltered}
                  dangerHint={batchBarDangerHint}
                  neutralHint={batchBarNeutralHint}
                  batchExecutionBlockedByLimit={batchExecutionBlockedByLimit}
                  manualRecycleUnavailable={manualRecycleUnavailable}
                  canBatchAddTags={canBatchAddTags}
                  canBatchTransferOwner={canBatchTransferOwner}
                  canBatchMoveToRecycleBin={canBatchMoveToRecycleBin}
                  canBatchForceHardDelete={canBatchForceHardDelete}
                  hasBatchOwnerTransferOptions={hasBatchOwnerTransferOptions}
                  batchTagOptions={batchTagOptions}
                  batchRecycleDisabled={batchRecycleDisabled}
                  onSelectFilteredResults={selectFilteredResults}
                  onToggleSelectAllCurrentPage={toggleSelectAllCurrentPage}
                  onResetSelection={resetSelection}
                  onOpenBatchTag={openBatchTagDialog}
                  onOpenBatchOwnerTransfer={openBatchOwnerTransferDialog}
                  onOpenBatchRecycle={openBatchRecycleDialog}
                  onOpenBatchForceDelete={openBatchForceDeleteDialog}
                />
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
                        outboundCallEnabled={outboundCallEnabled}
                        moveToRecycleBinAction={moveToRecycleBinAction}
                        selectable={canBatchSelect}
                        selected={
                          selectionMode === "filtered" ||
                          manualSelectedIds.includes(item.id)
                        }
                        onToggleSelected={() => toggleSelected(item.id)}
                        focused={focusedCustomer?.id === item.id}
                        onFocusCustomer={() => rememberFocusedCustomer(item)}
                      />
                    ))}
                  </div>
                ) : (
                  <EntityTable
                    density="compact"
                    variant="list"
                    rows={items}
                    getRowKey={(row) => row.id}
                    getRowId={(row) => `customer-row-${row.id}`}
                    getRowClassName={(row) =>
                      cn(
                        "group/customer-row cursor-pointer",
                        focusedCustomer?.id === row.id &&
                          "scroll-mt-28 bg-[rgba(79,125,247,0.07)] shadow-[inset_3px_0_0_var(--color-accent)]",
                      )
                    }
                    columns={columns}
                  />
                )}
              </div>

              <div className="hidden md:block">{spaciousRows}</div>
            </div>
          )}
        </DataTableWrapper>

        {canCreateCallRecord ? (
          <MobileCallFollowUpSheet
            scope={{ kind: "list", customerIds: items.map((item) => item.id) }}
            resultOptions={callResultOptions}
          />
        ) : null}

        {items.length > 0 ? (
          <div className="[&>div]:rounded-[18px] [&>div]:border-[var(--color-border-soft)] [&>div]:bg-[var(--color-panel-soft)] [&>div]:px-4 [&>div]:py-3 [&>div]:shadow-[var(--color-shell-shadow-sm)] [&_.crm-toolbar-cluster]:gap-2 [&_a]:h-8 [&_a]:rounded-[10px] [&_a]:px-3 [&_a]:py-0 [&_a]:text-[13px] [&_a]:shadow-none [&_a]:hover:translate-y-0 [&_p]:text-[13px] [&_p]:leading-5">
            {pagination.mode === "cursor" ? (
              <CustomersTablePaginationButtons
                prevHref={
                  pagination.currentCursor
                    ? buildCursorHref(pathname, searchParams, null)
                    : null
                }
                nextHref={
                  pagination.nextCursor
                    ? buildCursorHref(
                        pathname,
                        searchParams,
                        decodeCursor(pagination.nextCursor),
                      )
                    : null
                }
                summary={`本页 ${items.length} 位 · 范围内共 ${pagination.totalCount} 位`}
                scrollTargetId={scrollTargetId}
              />
            ) : (
              <PaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                summary={`当前第 ${pagination.page} / ${pagination.totalPages} 页，共 ${pagination.totalCount} 位客户`}
                buildHref={(page) => buildCustomersHref(filters, { page })}
                rightSlot={pageSizeControl}
                scrollTargetId={scrollTargetId}
              />
            )}
          </div>
        ) : null}
      </div>

      <CustomerDetailSheet
        open={Boolean(sheetCustomer)}
        customer={sheetCustomer}
        onClose={closeCustomerSheet}
      />

      <CustomerFollowUpDialog
        open={Boolean(followUpDialogState.item)}
        item={followUpDialogState.item}
        resultOptions={callResultOptions}
        canCreateCallRecord={canCreateCallRecord}
        canCreateSalesOrder={canCreateSalesOrder}
        outboundCallEnabled={outboundCallEnabled}
        initialResult={followUpDialogState.initialResult}
        remarkAutoFocus={followUpDialogState.remarkAutoFocus}
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

      <BatchOwnerTransferDialog
        open={batchOwnerTransferDialogOpen}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        filters={filters}
        ownerOptions={batchOwnerTransferOptions}
        selectedTargetOwnerId={selectedTargetOwnerId}
        pending={batchOwnerTransferPending}
        onClose={closeBatchOwnerTransferDialog}
        onOwnerChange={setSelectedTargetOwnerId}
        onSubmit={handleBatchOwnerTransferSubmit}
        selectedCustomerIds={manualSelectedIds}
      />

      <BatchRecycleDialog
        open={batchRecycleDialogOpen}
        selectedCount={selectedCount}
        manualRecycleEligibleCount={
          selectionMode === "manual" ? manualRecycleEligibleCount : null
        }
        selectionMode={selectionMode}
        filters={filters}
        pending={batchRecyclePending}
        onClose={closeBatchRecycleDialog}
        onSubmit={handleBatchRecycleSubmit}
        onRequestRecycle={openBatchRecycleRequestDialog}
        selectedCustomerIds={manualSelectedIds}
      />

      <BatchRecycleRequestDialog
        open={batchRecycleRequestDialogOpen}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        onClose={closeBatchRecycleRequestDialog}
        onConfirm={confirmBatchRecycleRequest}
      />

      <BatchForceDeleteDialog
        open={batchForceDeleteDialogOpen}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        filters={filters}
        pending={batchForceDeletePending}
        confirmation={batchForceDeleteConfirmation}
        reason={batchForceDeleteReason}
        onClose={closeBatchForceDeleteDialog}
        onSubmit={handleBatchForceDeleteSubmit}
        onConfirmationChange={setBatchForceDeleteConfirmation}
        onReasonChange={setBatchForceDeleteReason}
        selectedCustomerIds={manualSelectedIds}
      />
    </>
  );
}


