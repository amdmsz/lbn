"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { CheckSquare2, ChevronRight } from "lucide-react";
import type { RoleCode } from "@prisma/client";
import {
  batchAddCustomerTagAction,
  batchForceHardDeleteCustomersAction,
  batchMoveCustomersToRecycleBinAction,
  batchReleaseCustomersToPublicPoolAction,
  batchTransferCustomerOwnerAction,
} from "@/app/(dashboard)/customers/actions";
import {
  BatchForceDeleteDialog,
  BatchOwnerTransferDialog,
  BatchRecycleDialog,
  BatchRecycleRequestDialog,
  BatchReleaseToPoolDialog,
  BatchTagDialog,
  type BatchReleaseToPoolMode,
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
import { CustomerCallProgress } from "@/components/customers/customer-call-progress";
import { CustomerPhoneSpotlight } from "@/components/customers/customer-phone-spotlight";
import { InlineCustomerRemarkField } from "@/components/customers/inline-customer-remark-field";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import { CustomerRecycleBlockedReasonSummary } from "@/components/customers/customer-recycle-blocked-reason-summary";
import { type MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { CustomersTableBatchActionBar } from "@/components/customers/customers-table-batch-action-bar";
import {
  BlockedReasonStrip,
  ExecutionBadge,
  executionBadgeClassNames,
  ListTopBar,
  RowActions,
} from "@/components/customers/customers-table-bits";
import { CustomersTablePagination } from "@/components/customers/customers-table-pagination";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityTable } from "@/components/shared/entity-table";
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
const initialBatchReleaseNoticeState =
  createInitialCustomerBatchActionNoticeState("已在公海");

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

// 意向标注 "¥298 · 06-09 15:16": 金额 / 时间来自导入名单的"金额""日期"列,
// 只在展示的是意向商品 (非已购兜底) 时显示, 缺哪个就不显哪个.
function getInterestMetaText(row: CustomerListItem) {
  if (!row.latestInterestedProduct) {
    return null;
  }

  const parts: string[] = [];
  if (row.latestInterestedAmount) {
    const amount = Number(row.latestInterestedAmount);
    if (Number.isFinite(amount)) {
      parts.push(`¥${amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`);
    }
  }
  if (row.latestInterestedAt) {
    const at =
      row.latestInterestedAt instanceof Date
        ? row.latestInterestedAt
        : new Date(row.latestInterestedAt);
    if (!Number.isNaN(at.getTime())) {
      parts.push(
        new Intl.DateTimeFormat("zh-CN", {
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(at),
      );
    }
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

// 栏4 "最近通话" 时间短格式: 今天 11:28 / 昨天 18:05 / 06-08 09:12.
function formatCallTimeShort(value: Date) {
  const timeText = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  if (value.getTime() >= dayStartMs) {
    return `今天 ${timeText}`;
  }
  if (value.getTime() >= dayStartMs - 24 * 60 * 60 * 1000) {
    return `昨天 ${timeText}`;
  }
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(value);
  return `${dateText} ${timeText}`;
}

export function CustomersTable({
  viewerRole = "ADMIN",
  items,
  pagination,
  callResultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  outboundCallEnabled = false,
  moveToRecycleBinAction,
  canBatchAddTags = false,
  canBatchTransferOwner = false,
  canBatchReleaseToPublicPool = false,
  canBatchMoveToRecycleBin = false,
  canBatchForceHardDelete = false,
  batchTagOptions = [],
  batchOwnerTransferOptions = [],
  emptyTitle,
  emptyDescription,
  filters,
  headerAction,
  scrollTargetId,
}: Readonly<{
  // 可选, 默认按 ADMIN (展示负责人). `/customers` workbench 传真实 role —
  // SALES 视角会隐藏行内"负责人 (@cxxx)"冗余. 旧 CustomerWorkQueue 不传, 保持
  // 原有"始终展示负责人"行为不回退.
  viewerRole?: RoleCode;
  items: CustomerListItem[];
  pagination: PaginationData;
  callResultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  outboundCallEnabled?: boolean;
  moveToRecycleBinAction?: MoveCustomerToRecycleBinAction;
  canBatchAddTags?: boolean;
  canBatchTransferOwner?: boolean;
  // 批量"移交公海" (释放回公海池, 替代移交给中转假账号) — ADMIN/SUPERVISOR.
  canBatchReleaseToPublicPool?: boolean;
  canBatchMoveToRecycleBin?: boolean;
  canBatchForceHardDelete?: boolean;
  batchTagOptions?: BatchTagOption[];
  batchOwnerTransferOptions?: SalesRepBoardItem[];
  emptyTitle: string;
  emptyDescription: string;
  filters: CustomerCenterFilters;
  headerAction?: ReactNode;
  scrollTargetId?: string;
}>) {
  const [viewMode, setViewMode] = useState<CustomerViewMode>("table");
  // SALES 视角下"负责人 (@cxxx)"几乎都是自己, 是冗余噪声; 只有 ADMIN /
  // SUPERVISOR 跨人看客户时才需要在行内看负责人 (与 getOwnerLabel 一致).
  const showOwnerLabel = viewerRole === "ADMIN" || viewerRole === "SUPERVISOR";
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
  const [batchReleaseDialogOpen, setBatchReleaseDialogOpen] = useState(false);
  const [batchReleaseMode, setBatchReleaseMode] =
    useState<BatchReleaseToPoolMode>("unreachable");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [selectedTargetOwnerId, setSelectedTargetOwnerId] = useState("");
  const [batchForceDeleteConfirmation, setBatchForceDeleteConfirmation] = useState("");
  const [batchForceDeleteReason, setBatchForceDeleteReason] = useState("");
  // 默认 false 保持向后兼容 (走 detach), 勾上后服务端会物理清理 Lead 行 — 适合
  // "重新导入此批 phone" 场景, 避免旧 Lead 残骸命中导入 dedup.
  const [batchForceDeletePurgeLeads, setBatchForceDeletePurgeLeads] = useState(false);
  const [batchTransferNotice, setBatchTransferNotice] =
    useState<CustomerBatchActionNoticeState>(initialBatchTransferNoticeState);
  const [batchRecycleNotice, setBatchRecycleNotice] =
    useState<CustomerBatchActionNoticeState>(initialBatchRecycleNoticeState);
  const [batchForceDeleteNotice, setBatchForceDeleteNotice] =
    useState<CustomerBatchActionNoticeState>(initialBatchForceDeleteNoticeState);
  const [batchReleaseNotice, setBatchReleaseNotice] =
    useState<CustomerBatchActionNoticeState>(initialBatchReleaseNoticeState);
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
  const [batchReleasePending, startBatchReleaseTransition] = useTransition();
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
    canBatchReleaseToPublicPool ||
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
    setBatchReleaseNotice(initialBatchReleaseNoticeState);
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
    setBatchForceDeletePurgeLeads(false);
    setBatchForceDeleteDialogOpen(true);
  }

  function closeBatchForceDeleteDialog() {
    setBatchForceDeleteDialogOpen(false);
  }

  function openBatchReleaseDialog() {
    resetNotices();
    setBatchReleaseMode("unreachable");
    setBatchReleaseDialogOpen(true);
  }

  function closeBatchReleaseDialog() {
    setBatchReleaseDialogOpen(false);
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

  // 整行可点 = 打开跟进弹窗 (弹窗内已有 客户详情 / 直播邀约 / 订单 入口).
  // 行内交互元素 (checkbox label / tel: / 徽章按钮) 自带 stopPropagation,
  // closest 守卫再兜底一层, 双保险不触发行点击.
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
    openFollowUpDialog(item);
  }

  // 键盘可达: 行本体聚焦后 Enter / Space 等价于点击行.
  function handleSpaciousRowKeyDown(
    event: ReactKeyboardEvent<HTMLElement>,
    item: CustomerListItem,
  ) {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
    openFollowUpDialog(item);
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

  function handleBatchReleaseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startBatchReleaseTransition(async () => {
      const nextState = await batchReleaseCustomersToPublicPoolAction(formData);
      setBatchReleaseNotice(nextState);
      closeBatchReleaseDialog();
      notifyCustomerBatchActionResult(nextState, {
        defaultTitle: "批量移交公海已处理",
        successLabel: "成功移交公海",
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
            <ExecutionBadge row={row} onClick={() => openFollowUpDialog(row, {
              initialResult:
                (row.newImported && row.pendingFirstCall
                  ? ""
                  : getCustomerExecutionClassQuickResult(row.executionClass)) ||
                getSuggestedFollowUpResult(row),
            })} />
            <CustomerCallProgress
              callCount={row.callCount}
              isWechatAdded={row.isWechatAdded}
            />
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
      render: (row: CustomerListItem) => {
        const metaText = getInterestMetaText(row);
        const fullText = metaText
          ? `${getRecentProductText(row)} · ${metaText}`
          : getRecentProductText(row);

        return (
          <p
            className="max-w-[16rem] truncate text-[13px] text-[var(--color-sidebar-muted)]"
            title={fullText}
          >
            {fullText}
          </p>
        );
      },
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

  // Spacious rows: md+ 主视图 (定稿 v5 四栏信息网格, 视觉干净克制).
  //   栏1 客户 (~160px): 头像 + 姓名 + 执行徽章 + "已拨 X/5" (+ 管理视角负责人小字)
  //   栏2 电话 + 省市 (~170px, font-mono 手机号)
  //   栏3 意向 + 备注 (flex-1)
  //   栏4 最近通话 (~130px 右对齐); hover 原位淡入 "记录跟进 ›" (零位移)
  //   整行可点 = 跟进弹窗 (内含 客户详情 / 直播邀约 / 订单 入口); lg 以下四栏堆叠.
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
          const phoneText = row.phone?.trim() ?? "";
          const hasPhone = phoneText.length > 0;
          // 栏2 地址: 优先显完整地址 (省市区 / 详细地址), 销售很多客户只填了
          // 详细地址没填结构化省市, 之前只取 [province, city] 会误显"地区未填".
          const fullAddressText = getCustomerAddress(row);
          const regionText =
            fullAddressText === "未填写" ? "地址未填" : fullAddressText;
          const productText =
            row.latestInterestedProduct ?? row.latestPurchasedProduct;
          const interestMetaText = getInterestMetaText(row);
          const ownerLabel = getOwnerLabel(row);

          return (
            <article
              key={row.id}
              id={`customer-row-${row.id}`}
              role="button"
              tabIndex={0}
              aria-label={`记录跟进 ${row.name}`}
              onClick={(event) => handleSpaciousRowClick(event, row)}
              onKeyDown={(event) => handleSpaciousRowKeyDown(event, row)}
              className={cn(
                "group/customer-row relative flex cursor-pointer items-start gap-3 bg-card px-5 py-3.5 outline-none transition-colors duration-150 ease-out lg:items-center xl:px-6",
                "hover:bg-primary/[0.04] active:bg-primary/[0.07]",
                "focus-visible:bg-primary/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                focusedCustomer?.id === row.id &&
                  "scroll-mt-28 bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]",
              )}
            >
              {canBatchSelect ? (
                <label
                  onClick={(event) => event.stopPropagation()}
                  data-row-interactive="true"
                  className="mt-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-primary/30 hover:bg-muted lg:mt-0"
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

              <div className="flex min-w-0 flex-1 flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
                {/* 栏1 客户: 头像 + 姓名 + 执行徽章 + 已拨进度 */}
                <div className="flex min-w-0 items-center gap-2.5 lg:w-40 lg:shrink-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-sm font-bold text-primary">
                    {getCustomerInitial(row)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="max-w-full truncate text-[14px] font-semibold leading-tight text-foreground">
                        {row.name}
                      </span>
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
                      <CustomerCallProgress
                        callCount={row.callCount}
                        isWechatAdded={row.isWechatAdded}
                      />
                    </div>
                    {showOwnerLabel ? (
                      <p
                        className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground"
                        title={ownerLabel}
                      >
                        {ownerLabel}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* 栏2 电话 + 省市: <lg tel: 可直接拨, lg+ 让位给整行点击 */}
                <div className="min-w-0 lg:w-[170px] lg:shrink-0">
                  {hasPhone ? (
                    <a
                      href={`tel:${phoneText}`}
                      onClick={(event) => event.stopPropagation()}
                      data-row-interactive="true"
                      className="block max-w-full truncate font-mono text-[15px] font-semibold leading-tight tracking-tight text-foreground tabular-nums transition-colors hover:text-primary lg:pointer-events-none lg:hover:text-foreground"
                      title={phoneText}
                    >
                      {phoneText}
                    </a>
                  ) : (
                    <span className="block truncate font-mono text-[15px] font-semibold leading-tight tracking-tight text-muted-foreground tabular-nums">
                      暂无电话
                    </span>
                  )}
                  <p
                    className="mt-0.5 truncate text-xs leading-4 text-muted-foreground"
                    title={getCustomerAddress(row)}
                  >
                    {regionText}
                  </p>
                </div>

                {/* 栏3 意向 + 备注 */}
                <div className="min-w-0 lg:flex-1">
                  <p
                    className="truncate text-[13px] leading-5 text-foreground/85"
                    title={
                      productText
                        ? interestMetaText
                          ? `${productText} · ${interestMetaText}`
                          : productText
                        : undefined
                    }
                  >
                    <span className="text-muted-foreground">意向 </span>
                    {productText ?? "—"}
                    {interestMetaText ? (
                      <span className="text-muted-foreground"> · {interestMetaText}</span>
                    ) : null}
                  </p>
                  <p
                    className="truncate text-xs leading-5 text-muted-foreground"
                    title={remarkText || undefined}
                  >
                    备注 {remarkText || "—"}
                  </p>
                </div>

                {/* 栏4 最近通话; hover 原位淡入 "记录跟进 ›" (绝对定位零位移) */}
                <div className="relative min-w-0 lg:w-[130px] lg:shrink-0 lg:text-right">
                  <div className="transition-opacity duration-150 lg:group-hover/customer-row:opacity-0 lg:group-focus-visible/customer-row:opacity-0">
                    {latestCallRecord ? (
                      <>
                        <p className="truncate text-[13px] font-medium leading-5 text-foreground/85">
                          {latestCallRecord.resultLabel}
                        </p>
                        <p
                          className="truncate text-xs leading-4 tabular-nums text-muted-foreground"
                          title={formatDateTime(latestCallRecord.callTime)}
                        >
                          {formatCallTimeShort(latestCallRecord.callTime)}
                          {row.callCount > 0 ? ` · 第${row.callCount}次` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-[13px] leading-5 text-muted-foreground">
                        暂无通话
                      </p>
                    )}
                  </div>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-0 hidden items-center justify-end gap-0.5 text-[13px] font-medium text-primary opacity-0 transition-opacity duration-150 lg:flex lg:group-hover/customer-row:opacity-100 lg:group-focus-visible/customer-row:opacity-100"
                  >
                    记录跟进
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                </div>
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

              {batchReleaseNotice.blockedReasonSummary.length > 0 ? (
                <BlockedReasonStrip
                  title="移交公海阻断"
                  tone="warning"
                  summary={batchReleaseNotice.blockedReasonSummary}
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
                  canBatchReleaseToPublicPool={canBatchReleaseToPublicPool}
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
                  onOpenBatchRelease={openBatchReleaseDialog}
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
          <div className="[&>div]:rounded-[18px] [&>div]:border-[var(--color-border-soft)] [&>div]:bg-[var(--color-panel-soft)] [&>div]:px-4 [&>div]:py-3 [&>div]:shadow-[var(--color-shell-shadow-sm)] [&_.crm-toolbar-cluster]:gap-2 [&_.crm-button]:h-8 [&_.crm-button]:rounded-[10px] [&_.crm-button]:px-3 [&_.crm-button]:py-0 [&_.crm-button]:text-[13px] [&_.crm-button]:shadow-none [&_.crm-button]:hover:translate-y-0 [&_p]:text-[13px] [&_p]:leading-5">
            {pagination.mode === "cursor" ? (
              <CustomersTablePagination
                mode="cursor"
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
                summary={
                  pagination.nextCursor
                    ? `本页 ${items.length} 位 · 范围内共 ${pagination.totalCount} 位`
                    : `已加载全部 · 范围内共 ${pagination.totalCount} 位`
                }
                scrollTargetId={scrollTargetId}
              />
            ) : (
              <CustomersTablePagination
                mode="page"
                page={pagination.page}
                pageSize={pagination.pageSize}
                totalCount={pagination.totalCount}
                totalPages={pagination.totalPages}
                filters={filters}
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

      <BatchReleaseToPoolDialog
        open={batchReleaseDialogOpen}
        selectedCount={selectedCount}
        selectionMode={selectionMode}
        filters={filters}
        pending={batchReleasePending}
        mode={batchReleaseMode}
        onModeChange={setBatchReleaseMode}
        onClose={closeBatchReleaseDialog}
        onSubmit={handleBatchReleaseSubmit}
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
        purgeAttachedLeads={batchForceDeletePurgeLeads}
        onClose={closeBatchForceDeleteDialog}
        onSubmit={handleBatchForceDeleteSubmit}
        onConfirmationChange={setBatchForceDeleteConfirmation}
        onReasonChange={setBatchForceDeleteReason}
        onPurgeAttachedLeadsChange={setBatchForceDeletePurgeLeads}
        selectedCustomerIds={manualSelectedIds}
      />
    </>
  );
}


