"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  CheckSquare2,
  ExternalLink,
  Eye,
  LayoutGrid,
  Rows3,
  SquarePen,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import {
  batchAddCustomerTagAction,
  batchMoveCustomersToRecycleBinAction,
  batchTransferCustomerOwnerAction,
} from "@/app/(dashboard)/customers/actions";
import {
  CustomerFollowUpDialog,
  getCustomerExecutionClassQuickResult,
} from "@/components/customers/customer-follow-up-dialog";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
import { CustomerPhoneSpotlight } from "@/components/customers/customer-phone-spotlight";
import { InlineCustomerRemarkField } from "@/components/customers/inline-customer-remark-field";
import { CustomerListCard } from "@/components/customers/customer-list-card";
import { CustomerRecycleBlockedReasonSummary } from "@/components/customers/customer-recycle-blocked-reason-summary";
import { type MoveCustomerToRecycleBinAction } from "@/components/customers/customer-recycle-entry";
import { MobileCallFollowUpSheet } from "@/components/customers/mobile-call-followup-sheet";
import { DataTableWrapper } from "@/components/shared/data-table-wrapper";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityTable } from "@/components/shared/entity-table";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { notifyToast } from "@/components/shared/toast-provider";
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
  SalesRepBoardItem,
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

const customerViewStorageKey = "customer-center-view-mode";
const customerFocusStorageKey = "customer-center-last-focused-customer";
const customerScrollStoragePrefix = "customer-center-scroll:";
const customerFocusMaxAgeMs = 24 * 60 * 60 * 1000;
const customerScrollMaxAgeMs = 30 * 60 * 1000;
const initialBatchRecycleNoticeState =
  createInitialCustomerBatchActionNoticeState("已在回收站");
const initialBatchTransferNoticeState =
  createInitialCustomerBatchActionNoticeState("无需移交");
const MOTIVATIONAL_QUOTES = [
  { text: "我们在想象中受的苦多于现实。", author: "塞内加 (Seneca)" },
  {
    text: "阻碍我们前进的，最终会成为我们前进的道路。",
    author: "马可·奥勒留 (Marcus Aurelius)",
  },
  {
    text: "伟大的事业不是靠冲动做成的，而是由一系列小事汇聚而成的。",
    author: "梵高 (Vincent van Gogh)",
  },
  {
    text: "我们最害怕做的事情，往往是我们最需要做的事情。",
    author: "蒂姆·费里斯 (Tim Ferriss)",
  },
  { text: "不要预测未来，去创造它。", author: "彼得·德鲁克 (Peter Drucker)" },
  { text: "耐心是一切聪敏才智的基础。", author: "柏拉图 (Plato)" },
  { text: "流水不争先，争的是滔滔不绝。", author: "老子 (Laozi)" },
] as const;
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

function DailyQuote() {
  const [quote, setQuote] = useState<(typeof MOTIVATIONAL_QUOTES)[number]>(
    MOTIVATIONAL_QUOTES[0],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);

      setQuote(MOTIVATIONAL_QUOTES[nextIndex]);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <figure className="mt-12 mb-8 text-center">
      <blockquote className="text-sm italic tracking-wide text-muted-foreground/60">
        {quote.text}
      </blockquote>
      <figcaption className="mt-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground/40">
        {quote.author}
      </figcaption>
    </figure>
  );
}

const spaciousExecutionPillClassNames = {
  neutral: "border-border bg-muted/55 text-muted-foreground",
  info: "border-primary/20 bg-primary/10 text-primary",
  success:
    "border-[rgba(87,212,176,0.22)] bg-[rgba(87,212,176,0.1)] text-[var(--color-success)]",
  warning:
    "border-[rgba(240,195,106,0.26)] bg-[rgba(240,195,106,0.12)] text-[var(--color-warning)]",
  danger:
    "border-[rgba(255,148,175,0.22)] bg-[rgba(255,148,175,0.1)] text-[var(--color-danger)]",
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

function getCustomerInitial(item: CustomerListItem) {
  const name = item.name.trim();
  if (!name) return "?";
  return Array.from(name)[0]?.toUpperCase() ?? "?";
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

function buildCustomerPopupHref(customerId: string) {
  return `/customers/${customerId}?mode=popup`;
}

function isRecentIsoDate(value: string | undefined, maxAgeMs: number) {
  if (!value) {
    return false;
  }

  const time = Date.parse(value);

  return Number.isFinite(time) && Date.now() - time <= maxAgeMs;
}

function readJsonStorageValue<T>(storage: Storage, key: string): T | null {
  const stored = storage.getItem(key);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function notifyCustomerBatchActionResult(
  state: CustomerBatchActionNoticeState,
  input: Readonly<{
    defaultTitle: string;
    successLabel: string;
    countUnitLabel: string;
  }>,
) {
  if (state.status === "idle") {
    return;
  }

  const summary = state.summary;
  const summaryText =
    summary.totalCount > 0
      ? `${input.successLabel} ${summary.successCount}${input.countUnitLabel}，${state.skippedLabel} ${summary.skippedCount}${input.countUnitLabel}，阻断 ${summary.blockedCount}${input.countUnitLabel}`
      : "";
  const scopeText = state.selection
    ? `范围：${state.selection.label} ${state.selection.count}${input.countUnitLabel}`
    : "";
  const limitText = state.limitExceeded
    ? `超过单次 ${state.limitExceeded.maxCount}${input.countUnitLabel} 上限`
    : "";
  const blockedText =
    state.blockedReasonSummary.length > 0
      ? `阻断原因：${state.blockedReasonSummary
          .map((item) => `${item.label} ${item.count}${input.countUnitLabel}`)
          .join("；")}`
      : "";
  const description = [summaryText, scopeText, limitText, blockedText]
    .filter(Boolean)
    .join(" · ");

  notifyToast({
    title: state.message || input.defaultTitle,
    description,
    tone:
      state.status === "error"
        ? "danger"
        : summary.successCount > 0
          ? "success"
          : "info",
  });
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

function BatchOwnerTransferDialog({
  open,
  selectedCount,
  selectionMode,
  filters,
  ownerOptions,
  selectedTargetOwnerId,
  pending,
  onClose,
  onOwnerChange,
  onSubmit,
  selectedCustomerIds,
}: Readonly<{
  open: boolean;
  selectedCount: number;
  selectionMode: SelectionMode;
  filters: CustomerCenterFilters;
  ownerOptions: SalesRepBoardItem[];
  selectedTargetOwnerId: string;
  pending: boolean;
  onClose: () => void;
  onOwnerChange: (nextValue: string) => void;
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
        aria-label="批量移交负责人"
        className="crm-card w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">批量移交负责人</h3>
              <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                本次会把已选 {selectedCount} 位客户逐条移交给新的销售负责人。已由目标负责人承接的客户会计入“无需移交”。
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
            <span className="text-sm font-medium text-[var(--foreground)]">新的负责人</span>
            <select
              name="targetOwnerId"
              value={selectedTargetOwnerId}
              onChange={(event) => onOwnerChange(event.target.value)}
              required
              className="crm-input h-11 w-full"
            >
              <option value="">请选择销售负责人</option>
              {ownerOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} (@{option.username})
                  {option.teamName ? ` / ${option.teamName}` : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--foreground)]">移交备注</span>
            <textarea
              name="note"
              rows={3}
              maxLength={500}
              placeholder="可填写移交原因，选填"
              disabled={pending}
              className="crm-textarea"
            />
          </label>

          <div className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
            {selectionMode === "filtered"
              ? `这次会按当前筛选结果批量处理 ${selectedCount} 位客户，服务端仍会校验当前账号可见范围、团队范围和目标销售状态。`
              : "这次会按当前页手选客户批量移交，服务端仍会校验当前账号可见范围、团队范围和目标销售状态。"}
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
              disabled={pending || !selectedTargetOwnerId}
              className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {pending ? "移交中..." : "确认移交"}
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
  outboundCallEnabled = false,
  moveToRecycleBinAction,
  canBatchAddTags = false,
  canBatchTransferOwner = false,
  canBatchMoveToRecycleBin = false,
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
  const [selectedTagId, setSelectedTagId] = useState("");
  const [selectedTargetOwnerId, setSelectedTargetOwnerId] = useState("");
  const [batchTransferNotice, setBatchTransferNotice] = useState<CustomerBatchActionNoticeState>(
    initialBatchTransferNoticeState,
  );
  const [batchRecycleNotice, setBatchRecycleNotice] = useState<CustomerBatchActionNoticeState>(
    initialBatchRecycleNoticeState,
  );
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
  const router = useRouter();
  const pathname = usePathname() || "/customers";
  const searchParams = useSearchParams();
  const scrollStateKey = `${customerScrollStoragePrefix}${pathname}?${searchParams.toString()}`;

  const manualSelectedIds =
    pageSelection.pageKey === currentPageSelectionKey ? pageSelection.ids : [];
  const selectedCount =
    selectionMode === "filtered" ? pagination.totalCount : manualSelectedIds.length;
  const allCurrentPageSelected =
    items.length > 0 &&
    (selectionMode === "filtered" || manualSelectedIds.length === items.length);
  const canBatchSelect =
    canBatchAddTags || canBatchTransferOwner || canBatchMoveToRecycleBin;
  const filteredSelectionExceedsLimit =
    canBatchSelect && pagination.totalCount > MAX_BATCH_CUSTOMER_ACTION_SIZE;
  const canSelectFiltered =
    canBatchSelect &&
    pagination.totalCount > items.length &&
    !filteredSelectionExceedsLimit;
  const batchExecutionBlockedByLimit =
    selectionMode === "filtered" && filteredSelectionExceedsLimit;
  const showBatchQuickSelect = canBatchSelect && selectedCount === 0;
  const showBatchActiveBar = canBatchSelect && selectedCount > 0;
  const hasBatchOwnerTransferOptions = batchOwnerTransferOptions.length > 0;

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

  useEffect(() => {
    const parsed = readJsonStorageValue<Partial<FocusedCustomerState>>(
      window.localStorage,
      customerFocusStorageKey,
    );

    if (!parsed) {
      return;
    }

    if (
      !parsed.id ||
      !parsed.name ||
      !parsed.phone ||
      !isRecentIsoDate(parsed.touchedAt, customerFocusMaxAgeMs)
    ) {
      window.localStorage.removeItem(customerFocusStorageKey);
      return;
    }

    const timer = window.setTimeout(() => {
      setFocusedCustomer(parsed as FocusedCustomerState);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
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
      !isRecentIsoDate(parsed.touchedAt, customerScrollMaxAgeMs)
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
        focusedRow.scrollIntoView({
          block: "center",
          inline: "nearest",
        });
        return;
      }

      window.scrollTo({
        top: Math.max(0, restoredTop),
        behavior: "auto",
      });
    }, 80);

    return () => {
      window.clearTimeout(timer);
    };
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
    const nextFocusedCustomer = {
      id: item.id,
      name: item.name,
      phone: item.phone,
      touchedAt: new Date().toISOString(),
    } satisfies FocusedCustomerState;

    setFocusedCustomer(nextFocusedCustomer);
    rememberListPosition(item.id);
    window.localStorage.setItem(
      customerFocusStorageKey,
      JSON.stringify(nextFocusedCustomer),
    );
  }

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
    setBatchTransferNotice(initialBatchTransferNoticeState);
    setSelectedTagId("");
    setBatchTagDialogOpen(true);
  }

  function closeBatchTagDialog() {
    setBatchTagDialogOpen(false);
    setSelectedTagId("");
  }

  function openBatchOwnerTransferDialog() {
    setBatchRecycleNotice(initialBatchRecycleNoticeState);
    setBatchTransferNotice(initialBatchTransferNoticeState);
    setSelectedTargetOwnerId("");
    setBatchOwnerTransferDialogOpen(true);
  }

  function closeBatchOwnerTransferDialog() {
    setBatchOwnerTransferDialogOpen(false);
    setSelectedTargetOwnerId("");
  }

  function openBatchRecycleDialog() {
    setBatchRecycleNotice(initialBatchRecycleNoticeState);
    setBatchTransferNotice(initialBatchTransferNoticeState);
    setBatchRecycleDialogOpen(true);
  }

  function closeBatchRecycleDialog() {
    setBatchRecycleDialogOpen(false);
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
    setFollowUpDialogState({
      item: null,
      initialResult: "",
      remarkAutoFocus: false,
    });
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
            <button
              type="button"
              onClick={() => openCustomerSheet(row)}
              className="text-left text-sm font-semibold text-[var(--foreground)] transition-colors hover:text-[var(--color-accent-strong)]"
            >
              {row.name}
            </button>
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
            onFocusCustomer={() => rememberFocusedCustomer(row)}
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
            className="max-w-[18rem] truncate text-[13px] font-normal text-[var(--color-sidebar-muted)]"
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
        <div className="flex w-full items-center justify-center gap-1.5 opacity-100 transition-[opacity,transform] duration-150 md:pointer-events-none md:translate-y-1 md:opacity-0 md:group-hover/customer-row:pointer-events-auto md:group-hover/customer-row:translate-y-0 md:group-hover/customer-row:opacity-100 md:group-focus-within/customer-row:pointer-events-auto md:group-focus-within/customer-row:translate-y-0 md:group-focus-within/customer-row:opacity-100">
          <button
            type="button"
            onClick={() => openCustomerSheet(row)}
            aria-label={`查看 ${row.name} 详情`}
            title="查看详情"
            className="crm-button crm-button-secondary inline-flex h-8 w-8 items-center rounded-[10px] px-0 text-[var(--color-sidebar-muted)] motion-safe:hover:-translate-y-[1px] hover:text-[var(--foreground)]"
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => openFollowUpDialog(row)}
            aria-label={`编辑 ${row.name} 跟进`}
            title="编辑跟进"
            className="crm-button crm-button-secondary inline-flex h-8 w-8 items-center rounded-[10px] px-0 text-[var(--color-sidebar-muted)] motion-safe:hover:-translate-y-[1px] hover:text-[var(--foreground)]"
          >
            <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <Link
            href={buildCustomerPopupHref(row.id)}
            target="_blank"
            rel="noreferrer"
            onClick={() => rememberFocusedCustomer(row)}
            aria-label={`新窗口打开 ${row.name} 详情`}
            title="新窗口打开详情"
            className="crm-button crm-button-secondary inline-flex h-8 w-8 items-center justify-center rounded-[10px] px-0 text-[var(--color-sidebar-muted)] motion-safe:hover:-translate-y-[1px] hover:text-[var(--foreground)]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
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

  const spaciousRows = (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="divide-y divide-border">
        {items.map((row) => {
          const progressSummary = getProgressSummary(row);
          const latestCallRecord = getLatestCallRecord(row);
          const remarkText = row.remark?.trim() || "暂无备注";
          const executionVariant = getCustomerExecutionDisplayVariant({
            executionClass: row.executionClass,
            newImported: row.newImported,
            pendingFirstCall: row.pendingFirstCall,
          });

          return (
            <article
              key={row.id}
              id={`customer-row-${row.id}`}
              onClick={(event) => handleSpaciousRowClick(event, row)}
              className={cn(
                  "group/customer-row grid cursor-pointer grid-cols-12 items-center gap-4 bg-card px-5 py-6 transition-[background-color,box-shadow] duration-200 xl:px-6",
                  "hover:bg-muted/45",
                  focusedCustomer?.id === row.id &&
                    "scroll-mt-28 bg-primary/10 shadow-[inset_3px_0_0_hsl(var(--primary))]",
                )}
              >
              <div className="col-span-12 flex min-w-0 items-center gap-3 lg:col-span-4">
                {canBatchSelect ? (
                  <label
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm transition hover:border-primary/20 hover:bg-muted"
                    data-row-interactive="true"
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectionMode === "filtered" || manualSelectedIds.includes(row.id)
                      }
                      onChange={() => toggleSelected(row.id)}
                      aria-label={`选择客户 ${row.name}`}
                      className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary/15"
                    />
                  </label>
                ) : null}

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-sm font-bold text-primary shadow-sm">
                  {getCustomerInitial(row)}
                </div>

                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openCustomerSheet(row)}
                    className="block max-w-full truncate text-left text-base font-semibold text-foreground transition-colors hover:text-primary"
                  >
                    {row.name}
                  </button>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="truncate font-mono text-lg font-bold leading-none tracking-tight text-foreground tabular-nums">
                      {row.phone?.trim() || "暂无电话"}
                    </span>
                    <span
                      className="max-w-[18rem] truncate text-sm text-muted-foreground/80"
                      title={getCustomerAddress(row)}
                    >
                      {getCustomerAddress(row)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="col-span-12 min-w-0 lg:col-span-4">
                <p
                  className="truncate text-sm font-normal text-muted-foreground"
                  title={getPrimarySignal(row)}
                >
                  {getPrimarySignal(row)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getSignalMeta(row)}
                  {row.approvedTradeOrderCount > 0 || Number(row.lifetimeTradeAmount) > 0.009
                    ? ` · 成交 ${row.approvedTradeOrderCount} 单`
                    : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                      "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium transition hover:-translate-y-px",
                      spaciousExecutionPillClassNames[executionVariant],
                    )}
                  >
                    {getCustomerExecutionDisplayLongLabel({
                      executionClass: row.executionClass,
                      newImported: row.newImported,
                      pendingFirstCall: row.pendingFirstCall,
                    })}
                  </button>
                  <span className="inline-flex h-6 items-center rounded-full border border-border bg-muted/55 px-2.5 text-xs font-medium text-muted-foreground">
                    {progressSummary.primary}
                  </span>
                  <span className="inline-flex h-6 max-w-[14rem] items-center rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground">
                    <span className="truncate">{getOwnerLabel(row)}</span>
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openFollowUpDialog(row, { remarkAutoFocus: true })}
                className="col-span-12 min-w-0 rounded-xl px-0 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-primary/15 lg:col-span-3"
              >
                <p className="line-clamp-2 text-sm leading-5 text-foreground/78">
                  {remarkText}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{latestCallRecord ? latestCallRecord.resultLabel : "暂无通话结果"}</span>
                  <span>{`通话 ${row._count.callRecords} 次`}</span>
                  <span title={row.latestFollowUpAt ? formatDateTime(row.latestFollowUpAt) : "暂无跟进记录"}>
                    {row.latestFollowUpAt
                      ? `最近 ${formatRelativeDateTime(row.latestFollowUpAt)}`
                      : "最近 暂无"}
                  </span>
                </div>
              </button>

              <div className="col-span-12 flex items-center justify-end gap-1.5 lg:pointer-events-none lg:col-span-1 lg:translate-y-1 lg:opacity-0 lg:transition-[opacity,transform] lg:duration-150 lg:group-hover/customer-row:pointer-events-auto lg:group-hover/customer-row:translate-y-0 lg:group-hover/customer-row:opacity-100 lg:group-focus-within/customer-row:pointer-events-auto lg:group-focus-within/customer-row:translate-y-0 lg:group-focus-within/customer-row:opacity-100">
                <button
                  type="button"
                  onClick={() => openCustomerSheet(row)}
                  aria-label={`查看 ${row.name} 详情`}
                  title="查看详情"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-primary"
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => openFollowUpDialog(row)}
                  aria-label={`编辑 ${row.name} 跟进`}
                  title="编辑跟进"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-primary"
                >
                  <SquarePen className="h-4 w-4" aria-hidden="true" />
                </button>
                <Link
                  href={buildCustomerPopupHref(row.id)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => rememberFocusedCustomer(row)}
                  aria-label={`新窗口打开 ${row.name} 详情`}
                  title="新窗口打开详情"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      <div id={scrollTargetId} className="space-y-4">
        <DataTableWrapper
          title="客户列表"
          headerMode="hidden"
          className="rounded-2xl border-border bg-card shadow-sm"
          contentClassName="p-3 md:p-4"
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
                  {showBatchQuickSelect ? (
                    <button
                      type="button"
                      onClick={toggleSelectAllCurrentPage}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                    >
                      <CheckSquare2 className="h-3.5 w-3.5" />
                      <span>选择当前页</span>
                    </button>
                  ) : null}
                  <div className="md:hidden">
                    <CustomerViewToggle value={viewMode} onChange={handleChangeView} />
                  </div>
                </div>
                <p className="text-[12px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
                  共 {pagination.totalCount} 位客户
                </p>
              </div>

              {batchTransferNotice.blockedReasonSummary.length > 0 ? (
                <div className="rounded-[0.95rem] border border-amber-200 bg-amber-50/70 px-4 py-3.5">
                  <p className="text-[12px] font-semibold text-amber-900">移交阻断</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {batchTransferNotice.blockedReasonSummary.map((item) => (
                      <span
                        key={item.code}
                        className="inline-flex items-center rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[12px] font-medium text-amber-800"
                        title={item.description}
                      >
                        {item.label} {item.count} 位
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {batchRecycleNotice.blockedReasonSummary.length > 0 ? (
                <CustomerRecycleBlockedReasonSummary
                  items={batchRecycleNotice.blockedReasonSummary}
                />
              ) : null}

              {showBatchActiveBar ? (
                <div
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl border px-3 py-2.5 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between",
                    batchExecutionBlockedByLimit
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : selectionMode === "filtered"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/40 text-muted-foreground",
                  )}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
                        batchExecutionBlockedByLimit
                          ? "border-rose-200 bg-card text-rose-700"
                          : selectionMode === "filtered"
                            ? "border-primary/30 bg-card text-primary"
                            : "border-border/60 bg-card text-muted-foreground",
                      )}
                    >
                      <CheckSquare2 className="h-3.5 w-3.5" />
                      <span>
                        {selectionMode === "filtered"
                          ? `筛选结果 ${pagination.totalCount}`
                          : `已选 ${selectedCount}`}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "min-w-0 text-xs leading-5",
                        batchExecutionBlockedByLimit ? "text-rose-700" : "text-slate-500",
                      )}
                    >
                      {batchExecutionBlockedByLimit
                        ? `超过单次 ${MAX_BATCH_CUSTOMER_ACTION_SIZE} 位上限，请缩小范围。`
                        : selectionMode === "filtered"
                          ? "动作将应用到整个筛选结果。"
                          : allCurrentPageSelected && canSelectFiltered
                            ? `可扩展到 ${pagination.totalCount} 位筛选结果。`
                            : "可添加标签、移交负责人或移入回收站。"}
                    </span>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {selectionMode === "manual" && allCurrentPageSelected && pagination.totalCount > items.length ? (
                      canSelectFiltered ? (
                        <button
                          type="button"
                          onClick={selectFilteredResults}
                          className="inline-flex h-8 items-center rounded-full border border-border/60 bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                        >
                          选择全部 {pagination.totalCount}
                        </button>
                      ) : (
                        <span className="px-2 text-xs text-slate-400">
                          超过 {MAX_BATCH_CUSTOMER_ACTION_SIZE} 位上限
                        </span>
                      )
                    ) : null}

                    <button
                      type="button"
                      onClick={toggleSelectAllCurrentPage}
                      className="inline-flex h-8 items-center rounded-full border border-border/60 bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary"
                    >
                      {selectionMode === "filtered"
                        ? "取消跨页"
                        : allCurrentPageSelected
                          ? "取消当前页"
                          : "全选当前页"}
                    </button>

                    {selectionMode === "manual" ? (
                      <button
                        type="button"
                        onClick={resetSelection}
                        aria-label="清空选择"
                        title="清空选择"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}

                    {canBatchAddTags ? (
                      <button
                        type="button"
                        onClick={openBatchTagDialog}
                        disabled={batchTagOptions.length === 0 || batchExecutionBlockedByLimit}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                      >
                        <Tags className="h-3.5 w-3.5" />
                        标签
                      </button>
                    ) : null}

                    {canBatchTransferOwner ? (
                      <button
                        type="button"
                        onClick={openBatchOwnerTransferDialog}
                        disabled={!hasBatchOwnerTransferOptions || batchExecutionBlockedByLimit}
                        title={
                          hasBatchOwnerTransferOptions
                            ? "批量移交负责人"
                            : "暂无可移交的销售账号"
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/20 bg-white px-3 text-xs font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        移交
                      </button>
                    ) : null}

                    {canBatchMoveToRecycleBin ? (
                      <button
                        type="button"
                        onClick={openBatchRecycleDialog}
                        disabled={batchExecutionBlockedByLimit}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        回收
                      </button>
                    ) : null}
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
                        outboundCallEnabled={outboundCallEnabled}
                        moveToRecycleBinAction={moveToRecycleBinAction}
                        selectable={canBatchSelect}
                        selected={
                          selectionMode === "filtered" || manualSelectedIds.includes(item.id)
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
            scope={{
              kind: "list",
              customerIds: items.map((item) => item.id),
            }}
            resultOptions={callResultOptions}
          />
        ) : null}

        {items.length > 0 ? (
          <>
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
            <DailyQuote />
          </>
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
