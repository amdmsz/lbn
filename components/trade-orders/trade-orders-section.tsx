"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionBanner } from "@/components/shared/action-banner";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/shared/status-badge";
import { TradeOrderRecycleDialog } from "@/components/trade-orders/trade-order-recycle-dialog";
import { TradeOrderLogisticsCell } from "@/components/trade-orders/trade-order-logistics-cell";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  formatCurrency,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderPaymentSchemeVariant,
} from "@/lib/fulfillment/metadata";
import {
  buildFulfillmentBatchesHref,
  buildFulfillmentShippingHref,
} from "@/lib/fulfillment/navigation";
import type {
  getTradeOrdersPageData,
  TradeOrderFilters,
} from "@/lib/trade-orders/queries";
import type {
  TradeOrderRecycleGuard,
  TradeOrderRecycleReasonCode,
} from "@/lib/trade-orders/recycle-guards";
import type { RecycleFinalizePreview } from "@/lib/recycle-bin/types";
import { cn } from "@/lib/utils";

type TradeOrdersData = Awaited<ReturnType<typeof getTradeOrdersPageData>>;
type TradeOrderItem = TradeOrdersData["items"][number];
type TradeOrderRecycleActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
  guard?: TradeOrderRecycleGuard;
  finalizePreview?: RecycleFinalizePreview | null;
};
type RecycleDialogState = {
  id: string;
  tradeNo: string;
  customerName: string;
  receiverName: string;
  receiverPhone: string;
  tradeStatus: TradeOrderItem["tradeStatus"];
  reviewStatus: TradeOrderItem["reviewStatus"];
  updatedAt: TradeOrderItem["updatedAt"];
  guard: TradeOrderRecycleGuard;
  finalizePreview: RecycleFinalizePreview | null;
} | null;

const DESKTOP_COLUMNS =
  "xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1.05fr)_minmax(0,1.1fr)]";

const tradeOrderCardClassName =
  "overflow-hidden rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)]";

const tradeOrderHeaderClassName =
  "flex flex-col gap-3 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 lg:flex-row lg:items-start lg:justify-between";

const tradeOrderMetaClassName =
  "flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-sidebar-muted)]";

const tradeOrderInsetClassName =
  "rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)]";

const tradeOrderQuietActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-medium text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]";

const tradeOrderMenuItemClassName =
  "block rounded-[0.75rem] px-3 py-2 text-sm text-[var(--color-sidebar-muted)] transition-colors hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]";

const tradeOrderMetricTileClassName =
  "rounded-[0.82rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-2";

const tradeStatusMeta: Record<
  TradeOrderItem["tradeStatus"],
  { label: string; variant: StatusBadgeVariant }
> = {
  DRAFT: { label: "草稿", variant: "neutral" },
  PENDING_REVIEW: { label: "待审核", variant: "warning" },
  APPROVED: { label: "已审核", variant: "success" },
  REJECTED: { label: "已驳回", variant: "danger" },
  CANCELED: { label: "已取消", variant: "neutral" },
};

function buildPageHref(
  filters: TradeOrderFilters,
  overrides: Partial<TradeOrderFilters> = {},
  basePath = "/orders",
  baseSearchParams?: Record<string, string>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams(baseSearchParams);
  const entries: Array<[string, string]> = [
    ["keyword", next.keyword],
    ["customerKeyword", next.customerKeyword],
    ["supplierId", next.supplierId],
    ["statusView", next.statusView],
    ["focusView", next.focusView],
    ["supplierCount", next.supplierCount],
  ];

  for (const [key, value] of entries) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  if (next.sortBy !== "UPDATED_DESC") {
    params.set("sortBy", next.sortBy);
  } else {
    params.delete("sortBy");
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  } else {
    params.delete("page");
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function getActiveFocusView(filters: TradeOrderFilters) {
  if (filters.focusView) {
    return filters.focusView;
  }

  if (
    filters.statusView === "PENDING_REVIEW" ||
    filters.statusView === "APPROVED"
  ) {
    return filters.statusView;
  }

  return "";
}

function getShippingHref(item: TradeOrderItem) {
  const summary = item.executionSummary;
  if (!summary) {
    return buildFulfillmentShippingHref({ keyword: item.tradeNo });
  }

  if (summary.exceptionSubOrderCount > 0) {
    return buildFulfillmentShippingHref({
      keyword: item.tradeNo,
      stageView: "EXCEPTION",
    });
  }

  if (summary.pendingReportSubOrderCount > 0) {
    return buildFulfillmentShippingHref({
      keyword: item.tradeNo,
      stageView: "PENDING_REPORT",
    });
  }

  if (summary.pendingTrackingSubOrderCount > 0) {
    return buildFulfillmentShippingHref({
      keyword: item.tradeNo,
      stageView: "PENDING_TRACKING",
    });
  }

  return buildFulfillmentShippingHref({
    keyword: item.tradeNo,
    stageView: "SHIPPED",
  });
}

function getBatchHref(item: TradeOrderItem) {
  return buildFulfillmentBatchesHref({
    keyword: item.latestExportBatch?.exportNo || item.tradeNo,
  });
}

function getTraceTarget(item: TradeOrderItem) {
  const tracked = item.salesOrders.filter((salesOrder) =>
    salesOrder.shippingTask?.trackingNumber?.trim(),
  );

  if (tracked.length === 1 && tracked[0].shippingTask) {
    return tracked[0].shippingTask;
  }

  if (item.salesOrders.length === 1 && item.salesOrders[0].shippingTask) {
    return item.salesOrders[0].shippingTask;
  }

  return null;
}

function getProductSummary(item: TradeOrderItem) {
  const shown = item.items.slice(0, 2);
  const rest = item.items.length - shown.length;

  return {
    lines: shown.map((tradeItem) => ({
      id: tradeItem.id,
      label:
        tradeItem.titleSnapshot ||
        tradeItem.productNameSnapshot ||
        tradeItem.skuNameSnapshot ||
        "未命名商品",
      qty: tradeItem.qty,
      type: tradeItem.itemType,
    })),
    rest,
  };
}

function getOwnerLabel(item: TradeOrderItem) {
  return item.customer.owner?.name || item.customer.owner?.username || "未分配";
}

function getSupplierNames(item: TradeOrderItem) {
  const names = item.salesOrders
    .map((salesOrder) => salesOrder.supplier?.name)
    .filter((name): name is string => Boolean(name));

  return [...new Set(names)];
}

function getShippingTaskCount(item: TradeOrderItem) {
  return item.salesOrders.filter((salesOrder) => salesOrder.shippingTask).length;
}

function getExecutionPriority(item: TradeOrderItem) {
  const summary = item.executionSummary;
  if (!summary) {
    return { label: "待生成执行摘要", variant: "neutral" as const };
  }

  if (summary.exceptionSubOrderCount > 0) {
    return { label: `优先处理异常 ${summary.exceptionSubOrderCount}`, variant: "danger" as const };
  }

  if (summary.pendingReportSubOrderCount > 0) {
    return { label: `待报单 ${summary.pendingReportSubOrderCount}`, variant: "warning" as const };
  }

  if (summary.pendingTrackingSubOrderCount > 0) {
    return { label: `待填物流 ${summary.pendingTrackingSubOrderCount}`, variant: "warning" as const };
  }

  if (summary.allShipped) {
    return { label: "已全部发货", variant: "success" as const };
  }

  return { label: "履约跟进中", variant: "info" as const };
}

function getSupplierCountFilterLabel(value: TradeOrderFilters["supplierCount"]) {
  switch (value) {
    case "1":
      return "1 个 supplier";
    case "2":
      return "2 个 supplier";
    case "3_PLUS":
      return "3 个以上 supplier";
    default:
      return "全部 supplier 数";
  }
}

function getSortFilterLabel(value: TradeOrderFilters["sortBy"]) {
  switch (value) {
    case "UPDATED_ASC":
      return "最早更新";
    case "CREATED_DESC":
      return "最新创建";
    case "UPDATED_DESC":
    default:
      return "最近更新";
  }
}

function TradeOrderRowHeader({
  item,
  subOrderCount,
  priorityMeta,
  canReview,
  shippingHref,
  batchHref,
  continueEditHref,
  onOpenRecycleDialog,
}: Readonly<{
  item: TradeOrderItem;
  subOrderCount: number;
  priorityMeta: { label: string; variant: StatusBadgeVariant };
  canReview: boolean;
  shippingHref: string;
  batchHref: string;
  continueEditHref: string | null;
  onOpenRecycleDialog: (item: TradeOrderItem) => void;
}>) {
  return (
    <div className={tradeOrderHeaderClassName}>
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            {item.tradeNo}
          </h3>
          <StatusBadge
            label={tradeStatusMeta[item.tradeStatus].label}
            variant={tradeStatusMeta[item.tradeStatus].variant}
          />
          <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
            子单 {subOrderCount}
          </span>
          <StatusBadge label={priorityMeta.label} variant={priorityMeta.variant} />
        </div>
        <div className={tradeOrderMetaClassName}>
          <span>客户 {item.customer.name}</span>
          <span>销售 {getOwnerLabel(item)}</span>
          <span>下单 {formatDateTime(item.createdAt)}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <div className={cn(tradeOrderInsetClassName, "px-3 py-2 text-right")}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
            成交金额
          </p>
          <p className="mt-1 text-[1.02rem] font-semibold tracking-tight text-[var(--foreground)]">
            {formatCurrency(item.finalAmount)}
          </p>
          <p className="text-xs text-[var(--color-sidebar-muted)]">
            待收 {formatCurrency(item.remainingAmount)}
          </p>
        </div>

        <Link href={`/orders/${item.id}`} className={tradeOrderQuietActionClassName}>
          查看详情
        </Link>

        {canReview ? (
          <Link href={shippingHref} className={tradeOrderQuietActionClassName}>
            发货执行
          </Link>
        ) : null}

        <details className="relative">
          <summary
            className={cn(
              tradeOrderQuietActionClassName,
              "cursor-pointer list-none",
            )}
          >
            更多
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-40 rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-1.5 shadow-[var(--color-shell-shadow-sm)]">
            <Link href={batchHref} className={tradeOrderMenuItemClassName}>
              查看批次
            </Link>
            {continueEditHref ? (
              <Link href={continueEditHref} className={tradeOrderMenuItemClassName}>
                继续编辑
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => onOpenRecycleDialog(item)}
              className={cn(tradeOrderMenuItemClassName, "w-full text-left")}
            >
              {item.recycleGuard.canMoveToRecycleBin
                ? "移入回收站"
                : "查看阻断关系"}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

function TradeOrderExecutionStrip({
  item,
  product,
  totalQty,
  supplierNames,
  latestBatchLabel,
  shippingTaskCount,
  fulfillmentSummary,
  traceTarget,
}: Readonly<{
  item: TradeOrderItem;
  product: ReturnType<typeof getProductSummary>;
  totalQty: number;
  supplierNames: string[];
  latestBatchLabel: string;
  shippingTaskCount: number;
  fulfillmentSummary: Array<{
    label: string;
    count: number;
    variant: StatusBadgeVariant;
  }>;
  traceTarget: ReturnType<typeof getTraceTarget>;
}>) {
  return (
    <div
      className={cn(
        "grid gap-px bg-[var(--color-border-soft)] md:grid-cols-2 xl:grid-cols-none xl:grid",
        DESKTOP_COLUMNS,
      )}
    >
      <div className="bg-[var(--color-panel)] px-4 py-3">
        <div className="space-y-2">
          {product.lines.map((line) => (
            <div key={line.id} className="flex items-start gap-2">
              <span className="mt-0.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2 py-0.5 text-[10px] text-[var(--color-sidebar-muted)]">
                {line.type === "GIFT"
                  ? "赠品"
                  : line.type === "BUNDLE"
                    ? "套餐"
                    : "商品"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--foreground)]">
                  {line.label}
                </div>
                <div className="text-xs text-[var(--color-sidebar-muted)]">
                  x {line.qty}
                </div>
              </div>
            </div>
          ))}
          <div className={tradeOrderMetaClassName}>
            <span>SKU {item.items.length}</span>
            <span>件数 {totalQty}</span>
            <span>supplier {supplierNames.length || "未拆单"}</span>
            <span>最近批次 {latestBatchLabel}</span>
          </div>
          {supplierNames.length > 0 ? (
            <div className="truncate text-xs text-[var(--color-sidebar-muted)]">
              {supplierNames.slice(0, 3).join(" / ")}
              {supplierNames.length > 3 ? ` 等 ${supplierNames.length} 个` : ""}
            </div>
          ) : null}
          {product.rest > 0 ? (
            <div className="text-xs text-[var(--color-sidebar-muted)]">
              其余 {product.rest} 项商品已收起
            </div>
          ) : null}
        </div>
      </div>

      <div className="bg-[var(--color-panel)] px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <StatusBadge
            label={getSalesOrderPaymentSchemeLabel(item.paymentScheme)}
            variant={getSalesOrderPaymentSchemeVariant(item.paymentScheme)}
          />
          <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
            已收 {formatCurrency(item.collectedAmount)}
          </span>
          <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
            物流任务 {shippingTaskCount}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {fulfillmentSummary.map((entry) => (
            <div key={entry.label} className={tradeOrderMetricTileClassName}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-sidebar-muted)]">
                {entry.label}
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                {entry.count}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[var(--color-panel)] px-4 py-3">
        <TradeOrderLogisticsCell
          receiverName={item.receiverNameSnapshot}
          receiverPhone={item.receiverPhoneSnapshot}
          receiverAddress={item.receiverAddressSnapshot}
          shippingTaskId={traceTarget?.id}
          shippingProvider={traceTarget?.shippingProvider}
          trackingNumber={traceTarget?.trackingNumber}
          shippingStatus={traceTarget?.shippingStatus}
        />
      </div>
    </div>
  );
}

function TradeOrderReviewPanel({
  item,
  redirectTo,
  reviewAction,
}: Readonly<{
  item: TradeOrderItem;
  redirectTo: string;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
  if (item.tradeStatus !== "PENDING_REVIEW") {
    return null;
  }

  return (
    <details className="border-t border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
            Review
          </p>
          <p className="text-sm text-[var(--color-sidebar-muted)]">
            待审核父单，展开后处理通过或驳回。
          </p>
        </div>
        <span className={tradeOrderQuietActionClassName}>展开审核</span>
      </summary>

      <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
        <form
          action={reviewAction}
          className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3.5 py-3"
        >
          <input type="hidden" name="tradeOrderId" value={item.id} />
          <input type="hidden" name="reviewStatus" value="APPROVED" />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <p className="text-xs leading-5 text-[var(--color-sidebar-muted)]">
            审核通过后，父单会进入正式履约与收款执行阶段。
          </p>
          <button type="submit" className="crm-button crm-button-primary mt-3 w-full">
            审核通过
          </button>
        </form>

        <form
          action={reviewAction}
          className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3.5 py-3"
        >
          <input type="hidden" name="tradeOrderId" value={item.id} />
          <input type="hidden" name="reviewStatus" value="REJECTED" />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <textarea
            name="rejectReason"
            rows={3}
            required
            placeholder="填写驳回原因"
            className="crm-textarea"
          />
          <button type="submit" className="crm-button crm-button-secondary mt-3 w-full">
            驳回父单
          </button>
        </form>
      </div>
    </details>
  );
}

function TradeOrderRow({
  item: initialItem,
  recycleGuard,
  redirectTo,
  canCreate,
  canReview,
  reviewAction,
  onOpenRecycleDialog,
}: Readonly<{
  item: TradeOrderItem;
  recycleGuard: TradeOrderRecycleGuard;
  redirectTo: string;
  canCreate: boolean;
  canReview: boolean;
  reviewAction: (formData: FormData) => Promise<void>;
  onOpenRecycleDialog: (item: TradeOrderItem) => void;
}>) {
  const item = {
    ...initialItem,
    recycleGuard,
  };
  const product = getProductSummary(item);
  const traceTarget = getTraceTarget(item);
  const shippingHref = getShippingHref(item);
  const batchHref = getBatchHref(item);
  const supplierNames = getSupplierNames(item);
  const shippingTaskCount = getShippingTaskCount(item);
  const priorityMeta = getExecutionPriority(item);
  const totalQty = item.items.reduce(
    (sum, tradeItem) => sum + tradeItem.qty,
    0,
  );
  const subOrderCount =
    item.executionSummary?.totalSubOrderCount ?? item.salesOrders.length;
  const continueEditHref =
    canCreate &&
    (item.tradeStatus === "DRAFT" || item.tradeStatus === "REJECTED")
      ? `/customers/${item.customer.id}?tab=orders&createTradeOrder=1&tradeOrderId=${item.id}`
      : null;
  const latestBatchLabel = item.latestExportBatch
    ? item.latestExportBatch.exportNo
    : "暂无批次";

  const fulfillmentSummary = [
    {
      label: "待报单",
      count: item.executionSummary?.pendingReportSubOrderCount ?? 0,
      variant: "neutral" as const,
    },
    {
      label: "待物流",
      count: item.executionSummary?.pendingTrackingSubOrderCount ?? 0,
      variant: "warning" as const,
    },
    {
      label: "已发货",
      count: item.executionSummary?.shippedSubOrderCount ?? 0,
      variant: "success" as const,
    },
    {
      label: "异常",
      count: item.executionSummary?.exceptionSubOrderCount ?? 0,
      variant:
        (item.executionSummary?.exceptionSubOrderCount ?? 0) > 0
          ? ("danger" as const)
          : ("neutral" as const),
    },
  ];

  return (
    <article className={tradeOrderCardClassName}>
      <TradeOrderRowHeader
        item={item}
        subOrderCount={subOrderCount}
        priorityMeta={priorityMeta}
        canReview={canReview}
        shippingHref={shippingHref}
        batchHref={batchHref}
        continueEditHref={continueEditHref}
        onOpenRecycleDialog={onOpenRecycleDialog}
      />

      <TradeOrderExecutionStrip
        item={item}
        product={product}
        totalQty={totalQty}
        supplierNames={supplierNames}
        latestBatchLabel={latestBatchLabel}
        shippingTaskCount={shippingTaskCount}
        fulfillmentSummary={fulfillmentSummary}
        traceTarget={traceTarget}
      />

      {canReview ? (
        <TradeOrderReviewPanel
          item={item}
          redirectTo={redirectTo}
          reviewAction={reviewAction}
        />
      ) : null}
    </article>
  );
}

export function TradeOrdersSection({
  summary,
  items,
  filters,
  suppliers,
  pagination,
  canCreate,
  canReview,
  reviewAction,
  moveToRecycleBinAction,
  basePath = "/orders",
  baseSearchParams,
}: Readonly<{
  summary: TradeOrdersData["summary"];
  items: TradeOrdersData["items"];
  filters: TradeOrdersData["filters"];
  suppliers: TradeOrdersData["suppliers"];
  pagination: TradeOrdersData["pagination"];
  canCreate: boolean;
  canReview: boolean;
  reviewAction: (formData: FormData) => Promise<void>;
  moveToRecycleBinAction: (
    formData: FormData,
  ) => Promise<TradeOrderRecycleActionResult>;
  basePath?: string;
  baseSearchParams?: Record<string, string>;
}>) {
  const activeFocusView = getActiveFocusView(filters);
  const currentPageHref = buildPageHref(
    filters,
    { page: pagination.page },
    basePath,
    baseSearchParams,
  );
  const [notice, setNotice] = useState<TradeOrderRecycleActionResult | null>(
    null,
  );
  const [recycleDialogState, setRecycleDialogState] =
    useState<RecycleDialogState>(null);
  const [recycleGuardOverrides, setRecycleGuardOverrides] = useState<
    Record<string, TradeOrderRecycleGuard>
  >({});
  const [recycleFinalizePreviewOverrides, setRecycleFinalizePreviewOverrides] =
    useState<Record<string, RecycleFinalizePreview | null>>({});
  const [recycleReason, setRecycleReason] =
    useState<TradeOrderRecycleReasonCode>("mistaken_creation");
  const [recyclePending, startRecycleTransition] = useTransition();
  const router = useRouter();

  const tabs: Array<{
    value: string;
    label: string;
    count: number;
    href: string;
  }> = [
    { value: "", label: "全部", count: summary.focusCounts.all },
    {
      value: "PENDING_REVIEW",
      label: "待审核",
      count: summary.focusCounts.pendingReview,
    },
    { value: "APPROVED", label: "已审核", count: summary.focusCounts.approved },
    {
      value: "PENDING_REPORT",
      label: "待报单",
      count: summary.focusCounts.pendingReport,
    },
    {
      value: "PENDING_TRACKING",
      label: "待物流",
      count: summary.focusCounts.pendingTracking,
    },
    { value: "SHIPPED", label: "已发货", count: summary.focusCounts.shipped },
    { value: "EXCEPTION", label: "异常", count: summary.focusCounts.exception },
  ].map(({ value, label, count }) => ({
    value,
    label,
    count,
    href: buildPageHref(
      filters,
      {
        focusView: value as TradeOrderFilters["focusView"],
        statusView:
          value === "PENDING_REVIEW" || value === "APPROVED"
            ? (value as TradeOrderFilters["statusView"])
            : "",
        page: 1,
      },
      basePath,
      baseSearchParams,
    ),
  }));

  function openRecycleDialog(item: TradeOrderItem) {
    setNotice(null);
    setRecycleReason("mistaken_creation");
    setRecycleDialogState({
      id: item.id,
      tradeNo: item.tradeNo,
      customerName: item.customer.name,
      receiverName: item.receiverNameSnapshot,
      receiverPhone: item.receiverPhoneSnapshot,
      tradeStatus: item.tradeStatus,
      reviewStatus: item.reviewStatus,
      updatedAt: item.updatedAt,
      guard: recycleGuardOverrides[item.id] ?? item.recycleGuard,
      finalizePreview:
        recycleFinalizePreviewOverrides[item.id] ??
        item.finalizePreview ??
        null,
    });
  }

  function closeRecycleDialog() {
    setRecycleDialogState(null);
    setRecycleReason("mistaken_creation");
  }

  function handleRecycleConfirm() {
    if (!recycleDialogState || !recycleDialogState.guard.canMoveToRecycleBin) {
      return;
    }

    const formData = new FormData();
    formData.set("id", recycleDialogState.id);
    formData.set("reasonCode", recycleReason);

    startRecycleTransition(async () => {
      const result = await moveToRecycleBinAction(formData);

      if (
        result.recycleStatus === "created" ||
        result.recycleStatus === "already_in_recycle_bin"
      ) {
        setNotice(result);
        closeRecycleDialog();
        router.refresh();
        return;
      }

      if (result.recycleStatus === "blocked" && result.guard) {
        const blockedGuard = result.guard;
        setNotice(null);
        setRecycleGuardOverrides((current) => ({
          ...current,
          [recycleDialogState.id]: blockedGuard,
        }));
        if (result.finalizePreview !== undefined) {
          setRecycleFinalizePreviewOverrides((current) => ({
            ...current,
            [recycleDialogState.id]: result.finalizePreview ?? null,
          }));
        }
        setRecycleDialogState((current) =>
          current
            ? {
                ...current,
                guard: blockedGuard,
                finalizePreview:
                  result.finalizePreview !== undefined
                    ? (result.finalizePreview ?? null)
                    : current.finalizePreview,
              }
            : current,
        );
        return;
      }

      setNotice(result);
    });
  }

  return (
    <div className="space-y-5">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      <SectionCard
        eyebrow="Parent-Order Workbench"
        title="父单工作池"
        description="先按工作队列切换焦点，再用搜索和高级筛选收窄父单池。"
        density="compact"
        actions={
          <div className="flex flex-wrap gap-1.5 text-[12px] text-[var(--color-sidebar-muted)]">
            <span>待审核 {summary.focusCounts.pendingReview}</span>
            <span>·</span>
            <span>待报单 {summary.focusCounts.pendingReport}</span>
            <span>·</span>
            <span>异常 {summary.focusCounts.exception}</span>
          </div>
        }
      >
        <div className="space-y-3.5">
          <RecordTabs activeValue={activeFocusView} items={tabs} />

          <form
            method="get"
            className="space-y-3"
          >
            {Object.entries(baseSearchParams ?? {}).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <input type="hidden" name="focusView" value={activeFocusView} />

            <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)_auto] lg:items-end">
              <label className="space-y-1.5">
                <span className="crm-label">父单搜索</span>
                <input
                  name="keyword"
                  defaultValue={filters.keyword}
                  className="crm-input"
                  placeholder="tradeNo / subOrderNo / supplier / 收件人 / 手机"
                />
              </label>

              <label className="space-y-1.5">
                <span className="crm-label">客户搜索</span>
                <input
                  name="customerKeyword"
                  defaultValue={filters.customerKeyword}
                  className="crm-input"
                  placeholder="客户名 / 手机"
                />
              </label>

              <div className="crm-filter-actions lg:justify-end">
                <button type="submit" className="crm-button crm-button-primary">
                  搜索
                </button>
                <Link
                  href={buildPageHref(
                    {
                      keyword: "",
                      customerKeyword: "",
                      supplierId: "",
                      statusView: "",
                      focusView: "",
                      supplierCount: "",
                      sortBy: "UPDATED_DESC",
                      page: 1,
                    },
                    {},
                    basePath,
                    baseSearchParams,
                  )}
                  className="crm-button crm-button-secondary"
                >
                  重置
                </Link>
              </div>
            </div>

            <details className="rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-xs font-medium text-[var(--color-sidebar-muted)]">
                <span>高级筛选</span>
                <span>
                  审核 {filters.statusView || "全部"} · {getSupplierCountFilterLabel(filters.supplierCount)} · {getSortFilterLabel(filters.sortBy)}
                </span>
              </summary>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1.5">
                  <span className="crm-label">审核状态</span>
                  <select
                    name="statusView"
                    defaultValue={filters.statusView}
                    className="crm-select"
                  >
                    <option value="">全部审核状态</option>
                    <option value="DRAFT">草稿</option>
                    <option value="PENDING_REVIEW">待审核</option>
                    <option value="APPROVED">已审核</option>
                    <option value="REJECTED">已驳回</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="crm-label">supplier 数</span>
                  <select
                    name="supplierCount"
                    defaultValue={filters.supplierCount}
                    className="crm-select"
                  >
                    <option value="">全部 supplier 数</option>
                    <option value="1">1 个 supplier</option>
                    <option value="2">2 个 supplier</option>
                    <option value="3_PLUS">3 个以上 supplier</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="crm-label">排序</span>
                  <select
                    name="sortBy"
                    defaultValue={filters.sortBy}
                    className="crm-select"
                  >
                    <option value="UPDATED_DESC">最近更新</option>
                    <option value="UPDATED_ASC">最早更新</option>
                    <option value="CREATED_DESC">最新创建</option>
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="crm-label">supplier</span>
                  <select
                    name="supplierId"
                    defaultValue={filters.supplierId}
                    className="crm-select"
                  >
                    <option value="">全部 supplier</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </details>
          </form>
        </div>
      </SectionCard>

      {items.length > 0 ? (
        <SectionCard
          eyebrow="Parent-Order List"
          title="父单总览"
          description="父单行只展示聚合态：金额、supplier 数、物流任务数和异常；具体物流单号下钻到发货执行或详情。"
          density="compact"
          actions={
            <div className="flex flex-wrap gap-2 text-xs text-[var(--color-sidebar-muted)]">
              <span>共 {pagination.totalCount} 张父单</span>
              <span>审核 {filters.statusView || "全部"}</span>
              <span>{getSupplierCountFilterLabel(filters.supplierCount)}</span>
              <span>{getSortFilterLabel(filters.sortBy)}</span>
            </div>
          }
        >
          <div className="space-y-3.5">
            <div
              className={cn(
                "hidden gap-px overflow-hidden rounded-[0.92rem] border border-[var(--color-border-soft)] bg-[var(--color-border-soft)] xl:grid",
                DESKTOP_COLUMNS,
              )}
            >
              {["父单与商品", "履约摘要", "收件与物流"].map((label) => (
                <div
                  key={label}
                  className="bg-[var(--color-shell-surface-soft)] px-4 py-2 text-[11px] font-semibold tracking-[0.08em] text-[var(--color-sidebar-muted)]"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              {items.map((item) => (
                <TradeOrderRow
                  key={item.id}
                  item={item}
                  recycleGuard={
                    recycleGuardOverrides[item.id] ?? item.recycleGuard
                  }
                  redirectTo={currentPageHref}
                  canCreate={canCreate}
                  canReview={canReview}
                  reviewAction={reviewAction}
                  onOpenRecycleDialog={openRecycleDialog}
                />
              ))}
            </div>

            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              summary={`本页显示 ${(pagination.page - 1) * pagination.pageSize + 1} - ${Math.min(
                pagination.page * pagination.pageSize,
                pagination.totalCount,
              )} 张父单，共 ${pagination.totalCount} 张`}
              buildHref={(pageNumber) =>
                buildPageHref(
                  filters,
                  { page: pageNumber },
                  basePath,
                  baseSearchParams,
                )
              }
            />
          </div>
        </SectionCard>
      ) : (
        <EmptyState
          title="暂无成交父单"
          description="当前筛选条件下没有记录。"
          action={
            canCreate ? (
              <Link href="/customers" className="crm-button crm-button-primary">
                去客户中心建单
              </Link>
            ) : null
          }
        />
      )}

      <TradeOrderRecycleDialog
        open={recycleDialogState !== null}
        item={
          recycleDialogState
            ? {
                tradeNo: recycleDialogState.tradeNo,
                customerName: recycleDialogState.customerName,
                receiverName: recycleDialogState.receiverName,
                receiverPhone: recycleDialogState.receiverPhone,
                tradeStatus: recycleDialogState.tradeStatus,
                reviewStatus: recycleDialogState.reviewStatus,
                updatedAt: recycleDialogState.updatedAt,
              }
            : null
        }
        guard={recycleDialogState?.guard ?? null}
        finalizePreview={recycleDialogState?.finalizePreview ?? null}
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        onConfirm={handleRecycleConfirm}
        pending={recyclePending}
      />
    </div>
  );
}
