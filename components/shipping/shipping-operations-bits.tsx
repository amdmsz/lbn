/**
 * shipping-operations-bits — ShippingOperationsSection 拆出的纯展示原语 + utility.
 *
 * 拆解原因:
 * - 主文件 shipping-operations-section.tsx 同时承担 5 个 workspace 大组合,
 *   把 cell widget / form / 字段格式化 utility 单独 sidecar 可控制主文件行数 < 1400.
 * - 这里只放无副作用的 helper + 1-2 屏内可读懂的 widget; workspace 组合留在主文件.
 *
 * 严格不动 trade-orders/, shared/; 这里仍可复用它们.
 */

import type { ReactNode } from "react";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/shared/status-badge";
import {
  type CompactBadgeItem,
} from "@/components/shared/compact-badge-group";
import { type MetricItem } from "@/components/shared/metric-strip";
import { type OrderProgressPhase } from "@/components/trade-orders/order-progress-track";
import {
  codCollectionStatusOptions,
  formatCurrency,
  getCodCollectionStatusLabel,
  getCodCollectionStatusVariant,
  getShippingFulfillmentStatusLabel,
  shippingFulfillmentStatusOptions,
} from "@/lib/fulfillment/metadata";
import { buildShippingProductSummary } from "@/lib/shipping/product-summary";
import { summarizeShippingPackageSnapshots } from "@/lib/shipping/package-snapshots";
import type {
  ShippingOperationsFilters,
  ShippingOperationsItem,
  ShippingPendingBatchSummary,
  ShippingStageView,
  ShippingSupplierSummary,
} from "@/lib/shipping/queries";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 共享 className tokens (与主文件保持一致, 这里 export 供主文件复用)
// ---------------------------------------------------------------------------

export const workspaceSectionClassName =
  "space-y-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm md:p-5";

export const workspacePanelClassName =
  "rounded-xl border border-border/60 bg-muted/30 p-3.5";

export const workspaceTableShellClassName =
  "overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm";

export const workspaceHintClassName =
  "rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground";

export const workspaceQuietActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-border/60 bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/40 hover:text-foreground";

export const tableHeaderClass =
  "bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";

export const tableHeadCellClass = "px-3 py-2";

export const tableCellClass = "px-3 py-2 align-top";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SummaryData = {
  totalCount: number;
  pendingReportCount: number;
  pendingTrackingCount: number;
  shippedCount: number;
  exceptionCount: number;
  supplierCount: number;
};

export type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type PhaseTone = "done" | "current" | "pending" | "danger";

// ---------------------------------------------------------------------------
// Pure utility
// ---------------------------------------------------------------------------

export function getStageCount(summary: SummaryData, stageView: ShippingStageView) {
  switch (stageView) {
    case "PENDING_TRACKING":
      return summary.pendingTrackingCount;
    case "SHIPPED":
      return summary.shippedCount;
    case "EXCEPTION":
      return summary.exceptionCount;
    case "PENDING_REPORT":
    default:
      return summary.pendingReportCount;
  }
}

export function buildPageHref(
  filters: ShippingOperationsFilters,
  overrides: Partial<ShippingOperationsFilters> = {},
  basePath = "/shipping",
  baseSearchParams?: Record<string, string>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams(baseSearchParams);

  for (const key of [
    "supplierId",
    "reportStatus",
    "shippingStatus",
    "shippingStage",
    "hasTrackingNumber",
  ]) {
    params.delete(key);
  }

  const setOrDelete = (key: string, value: string) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  setOrDelete("keyword", next.keyword);
  setOrDelete("supplierKeyword", next.supplierKeyword);
  setOrDelete("supplierViewId", next.supplierViewId);
  if (next.batchViewId && next.stageView === "PENDING_TRACKING") {
    params.set("batchViewId", next.batchViewId);
  } else {
    params.delete("batchViewId");
  }
  params.set("stageView", next.stageView);
  setOrDelete("isCod", next.isCod);
  if (next.page > 1) params.set("page", String(next.page));
  else params.delete("page");

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function getLatestCodRecord(item: ShippingOperationsItem) {
  return item.codCollectionRecords[0] ?? null;
}

export function getExecutionIdentity(item: ShippingOperationsItem) {
  const tradeNo =
    item.tradeOrder?.tradeNo ?? item.salesOrder?.tradeOrder?.tradeNo ?? null;
  const subOrderNo =
    item.salesOrder?.subOrderNo || item.salesOrder?.orderNo || item.id;
  const supplierName = item.supplier?.name || "未绑定供应商";
  return { tradeNo, subOrderNo, supplierName };
}

function normalizeOrderRemark(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function isSameCurrencyAmount(left: string, right: string) {
  const l = Number(left);
  const r = Number(right);
  if (!Number.isFinite(l) || !Number.isFinite(r)) return left === right;
  return Math.abs(l - r) < 0.005;
}

export function getOrderCommercialContext(item: ShippingOperationsItem) {
  const parentTradeOrder =
    item.tradeOrder ?? item.salesOrder?.tradeOrder ?? null;
  const orderAmount =
    item.salesOrder?.finalAmount ?? parentTradeOrder?.finalAmount ?? "0";
  const parentAmount =
    parentTradeOrder?.finalAmount &&
    !isSameCurrencyAmount(parentTradeOrder.finalAmount, orderAmount)
      ? parentTradeOrder.finalAmount
      : null;
  const salesOrderRemark = normalizeOrderRemark(item.salesOrder?.remark);
  const parentRemark = normalizeOrderRemark(parentTradeOrder?.remark);
  const remarkLines: Array<{ label: string; value: string }> = [];
  if (salesOrderRemark) {
    remarkLines.push({ label: "订单备注", value: salesOrderRemark });
  }
  if (parentRemark && parentRemark !== salesOrderRemark) {
    remarkLines.push({
      label: salesOrderRemark ? "父单备注" : "订单备注",
      value: parentRemark,
    });
  }
  return { orderAmount, parentAmount, remarkLines };
}

export function getProductSummary(item: ShippingOperationsItem) {
  return (
    buildShippingProductSummary(item.salesOrder?.items ?? []).replace(
      /\+/g,
      " + ",
    ) || "暂无商品明细"
  );
}

export function getShippingPackagesSummary(item: ShippingOperationsItem) {
  return summarizeShippingPackageSnapshots(item.shippingPackages);
}

export function getPieceCount(item: ShippingOperationsItem) {
  return (
    item.salesOrder?.items.reduce((total, x) => total + x.qty, 0) ?? 0
  );
}

export function getCustomerOwnerLabel(item: ShippingOperationsItem) {
  return item.customer.owner
    ? `${item.customer.owner.name} (@${item.customer.owner.username})`
    : "暂无负责人";
}

export function getExceptionBadgeItems(
  item: ShippingOperationsItem,
): CompactBadgeItem[] {
  const items: CompactBadgeItem[] = [];
  if (item.shippingStatus === "CANCELED")
    items.push({ label: "已取消", tone: "danger" });
  if (!item.tradeOrder?.tradeNo && !item.salesOrder?.tradeOrder?.tradeNo)
    items.push({ label: "缺少父单锚点", tone: "danger" });
  if (item.reportStatus === "PENDING" && item.trackingNumber?.trim())
    items.push({ label: "未报单先有物流", tone: "warning" });
  if (
    item.reportStatus === "REPORTED" &&
    item.exportBatch &&
    !item.exportBatch.fileUrl
  )
    items.push({ label: "批次文件缺失", tone: "warning" });
  if (item.logisticsExceptionType === "ADDRESS_MISMATCH")
    items.push({ label: "地址异常", tone: "danger" });
  if (item.logisticsExceptionType === "RETURN_OR_REJECTED")
    items.push({ label: "退回 / 拒收", tone: "danger" });
  if (item.logisticsExceptionType === "TRACE_QUERY_FAILED")
    items.push({ label: "物流查询失败", tone: "warning" });
  if (item.logisticsExceptionType === "OVERDUE_NOT_SIGNED")
    items.push({ label: "超 7 天未签收", tone: "warning" });
  return items;
}

export function getBatchStatusMeta(
  batch:
    | ShippingSupplierSummary["currentBatch"]
    | ShippingSupplierSummary["latestHistoryBatch"]
    | ShippingPendingBatchSummary
    | null,
): { label: string; variant: StatusBadgeVariant; note: string } | null {
  if (!batch) return null;
  switch (batch.fileState) {
    case "READY":
      return {
        label: "文件可下载",
        variant: "success",
        note: "冻结快照和导出文件都可直接使用。",
      };
    case "MISSING":
      return {
        label: "文件缺失",
        variant: "danger",
        note: "批次快照仍在，导出文件需要重新生成。",
      };
    case "PENDING":
      return {
        label: "待生成文件",
        variant: "warning",
        note: "批次已冻结，但导出文件尚未生成。",
      };
    case "LEGACY":
    default:
      return {
        label: "历史兼容批次",
        variant: "neutral",
        note: "该批次仍可回看，但不代表当前待处理池。",
      };
  }
}

export function getCollectionFocusMeta(item: ShippingOperationsItem) {
  const codRecord = getLatestCodRecord(item);
  const isCod = Number(item.codAmount) > 0;
  if (item.shippingStatus === "REFUNDED") {
    return { label: "退款结束", variant: "neutral" as const };
  }
  if (codRecord) {
    return {
      label: getCodCollectionStatusLabel(codRecord.status),
      variant: getCodCollectionStatusVariant(codRecord.status),
    };
  }
  if (!isCod) return { label: "非 COD", variant: "neutral" as const };
  return { label: "待回款关注", variant: "warning" as const };
}

export function buildDefaultExportFileName() {
  return `shipping-export-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function canFinalizeShippingOutcome(item: ShippingOperationsItem) {
  return (
    item.shippingStatus === "DELIVERED" ||
    item.shippingStatus === "COMPLETED"
  );
}

export function buildSupplierMetrics(
  supplier: ShippingSupplierSummary,
  pendingCount?: number,
): MetricItem[] {
  return [
    { label: "可报单", value: String(supplier.stageTaskCount), tone: "primary" },
    {
      label: "待填物流",
      value: String(pendingCount ?? supplier.pendingTrackingCount),
      tone: "warning",
    },
    {
      label: "异常",
      value: String(supplier.exceptionCount),
      tone: supplier.exceptionCount > 0 ? "danger" : "neutral",
    },
  ];
}

export function buildExportBatchHiddenFields(input: {
  supplierId: string;
  redirectTo: string;
  sourceStage: "PENDING_REPORT" | "PENDING_TRACKING";
  fileName?: string;
  remark?: string;
}) {
  return {
    supplierId: input.supplierId,
    fileName: input.fileName ?? buildDefaultExportFileName(),
    remark: input.remark ?? "",
    sourceStage: input.sourceStage,
    redirectTo: input.redirectTo,
  };
}

export function deriveOrderProgressPhase(
  item: ShippingOperationsItem,
): OrderProgressPhase {
  const reviewStatus = item.salesOrder?.reviewStatus;
  if (item.shippingStatus === "CANCELED") return "CANCELED";
  if (
    item.shippingStatus === "COMPLETED" ||
    item.shippingStatus === "DELIVERED"
  )
    return "COMPLETED";
  if (item.codCollectionRecords[0]?.status === "COLLECTED") return "COLLECTED";
  if (item.shippingStatus === "SHIPPED") return "SHIPPED";
  if (item.reportStatus === "REPORTED") return "REPORTED";
  if (reviewStatus === "APPROVED") return "APPROVED";
  if (reviewStatus === "PENDING_REVIEW") return "PENDING_REVIEW";
  return "DRAFT";
}

// ---------------------------------------------------------------------------
// Cell widgets
// ---------------------------------------------------------------------------

/** ProductCell — 单列商品摘要 (OrderItemCard 风, 表格行版). */
export function ProductCell({
  item,
}: Readonly<{ item: ShippingOperationsItem }>) {
  const summary = getProductSummary(item);
  const pieceCount = getPieceCount(item);
  return (
    <div className="flex max-w-[15rem] items-start gap-2">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/40 text-[11px] font-semibold text-muted-foreground"
      >
        ×{pieceCount}
      </span>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13px] leading-5 text-foreground">
          {summary}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {pieceCount} 件
        </div>
      </div>
    </div>
  );
}

/** CommercialCell — 合并金额 / COD / 保价 / 备注; 详情 popover 默认折叠. */
export function CommercialCell({
  item,
}: Readonly<{ item: ShippingOperationsItem }>) {
  const context = getOrderCommercialContext(item);
  const codAmount = formatCurrency(item.codAmount);
  const insuranceLabel = item.insuranceRequired
    ? formatCurrency(item.insuranceAmount)
    : "否";
  const hasDetail =
    context.parentAmount !== null ||
    Number(item.codAmount) > 0 ||
    item.insuranceRequired ||
    context.remarkLines.length > 0;

  if (!hasDetail) {
    return (
      <div className="font-medium text-foreground">
        {formatCurrency(context.orderAmount)}
      </div>
    );
  }

  return (
    <details className="group max-w-[14rem]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <span className="font-medium text-foreground">
          {formatCurrency(context.orderAmount)}
        </span>
        <span className="text-[10px] text-muted-foreground transition-transform group-open:rotate-90">
          ›
        </span>
        <span className="text-[10px] text-muted-foreground">详情</span>
      </summary>
      <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-muted/30 p-2 text-[11px] leading-5 text-muted-foreground">
        {context.parentAmount ? (
          <div>父单成交 {formatCurrency(context.parentAmount)}</div>
        ) : null}
        <div>
          COD {codAmount} · 保价 {insuranceLabel}
        </div>
        {context.remarkLines.map((remark) => (
          <div
            key={`${remark.label}:${remark.value}`}
            className="line-clamp-2"
          >
            {remark.label}：{remark.value}
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * PhaseTrackBadges — 3 阶段 mini 进度链 (审核 → 报单 → 履约).
 * 表格行内紧凑替代旧的 3 个并排 StatusBadge.
 */
export function PhaseTrackBadges({
  item,
}: Readonly<{ item: ShippingOperationsItem }>) {
  const reviewStatus = item.salesOrder?.reviewStatus;
  const reviewTone: PhaseTone =
    reviewStatus === "APPROVED"
      ? "done"
      : reviewStatus === "REJECTED"
        ? "danger"
        : reviewStatus === "PENDING_REVIEW"
          ? "current"
          : "pending";
  const reviewLabel =
    reviewStatus === "APPROVED"
      ? "已审"
      : reviewStatus === "REJECTED"
        ? "驳回"
        : reviewStatus === "PENDING_REVIEW"
          ? "待审"
          : "未审";

  const reportTone: PhaseTone =
    item.reportStatus === "REPORTED"
      ? "done"
      : reviewStatus === "APPROVED"
        ? "current"
        : "pending";
  const reportLabel = item.reportStatus === "REPORTED" ? "已报" : "待报";

  const shippingStatus = item.shippingStatus;
  const shippingTone: PhaseTone =
    shippingStatus === "COMPLETED" || shippingStatus === "DELIVERED"
      ? "done"
      : shippingStatus === "CANCELED" || shippingStatus === "REFUNDED"
        ? "danger"
        : shippingStatus === "SHIPPED"
          ? "current"
          : item.reportStatus === "REPORTED"
            ? "current"
            : "pending";
  const shippingLabel = getShippingFulfillmentStatusLabel(shippingStatus);

  const phases: Array<{ label: string; tone: PhaseTone; key: string }> = [
    { key: "review", label: reviewLabel, tone: reviewTone },
    { key: "report", label: reportLabel, tone: reportTone },
    { key: "ship", label: shippingLabel, tone: shippingTone },
  ];

  return (
    <ol
      aria-label="审核 / 报单 / 履约"
      className="flex items-center gap-1 text-[10.5px]"
    >
      {phases.map((phase, index) => (
        <li key={phase.key} className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-[0.1rem] font-medium leading-4",
              phase.tone === "done" &&
                "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
              phase.tone === "current" &&
                "border-primary/30 bg-primary/10 text-primary",
              phase.tone === "danger" &&
                "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
              phase.tone === "pending" &&
                "border-border/60 bg-muted/30 text-muted-foreground",
            )}
          >
            {phase.label}
          </span>
          {index < phases.length - 1 ? (
            <span
              aria-hidden="true"
              className={cn(
                "h-px w-2",
                phase.tone === "done"
                  ? "bg-emerald-300/70 dark:bg-emerald-500/40"
                  : "bg-border/70",
              )}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function CustomerOwnerHint({
  item,
}: Readonly<{ item: ShippingOperationsItem }>) {
  return (
    <div className="mt-1 inline-flex items-center rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      负责人：{getCustomerOwnerLabel(item)}
    </div>
  );
}

/** 隐藏 input 列表渲染 helper, 替代 form 内重复 <input type="hidden" /> 堆叠. */
export function HiddenFields({
  fields,
}: Readonly<{ fields: Record<string, string> }>) {
  return (
    <>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Form widgets
// ---------------------------------------------------------------------------

/** OutcomeFinalizeForms — 物流后确认: 完成 + 标记退款 双 form 紧凑组合. */
export function OutcomeFinalizeForms({
  item,
  currentHref,
  updateShippingAction,
}: Readonly<{
  item: ShippingOperationsItem;
  currentHref: string;
  updateShippingAction: (formData: FormData) => Promise<void>;
}>) {
  const baseFields = {
    shippingTaskId: item.id,
    redirectTo: currentHref,
    shippingProvider: item.shippingProvider ?? "",
    trackingNumber: item.trackingNumber ?? "",
    codCollectionStatus: "",
    codCollectedAmount: "",
    codRemark: "",
  };
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[12.5px] font-medium text-foreground">
            物流后确认
          </div>
          <div className="text-[11px] text-muted-foreground">
            选择本单最终计入完成或退款。
          </div>
        </div>
        <form action={updateShippingAction}>
          <HiddenFields
            fields={{
              ...baseFields,
              shippingStatus: "COMPLETED",
              settlementRemark: "物流后确认完成。",
            }}
          />
          <button
            type="submit"
            className="crm-button crm-button-primary px-3 py-1.5 text-xs"
          >
            完成
          </button>
        </form>
      </div>
      <form
        action={updateShippingAction}
        className="mt-2 flex items-center gap-2"
      >
        <HiddenFields
          fields={{ ...baseFields, shippingStatus: "REFUNDED" }}
        />
        <input
          name="settlementRemark"
          placeholder="退款原因 / 说明"
          className="crm-input h-8 flex-1 text-xs"
          required
        />
        <button
          type="submit"
          className="crm-button crm-button-secondary px-3 py-1 text-xs"
        >
          标记退款
        </button>
      </form>
    </div>
  );
}

/** ShippingUpdateDetailsForm — 折叠 "更多更新" form. */
export function ShippingUpdateDetailsForm({
  item,
  currentHref,
  isCod,
  codRecord,
  updateShippingAction,
}: Readonly<{
  item: ShippingOperationsItem;
  currentHref: string;
  isCod: boolean;
  codRecord: ReturnType<typeof getLatestCodRecord>;
  updateShippingAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <details className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <summary className="cursor-pointer text-[12.5px] font-medium text-foreground">
        更多更新
      </summary>
      <form action={updateShippingAction} className="mt-3 space-y-2.5">
        <HiddenFields
          fields={{
            shippingTaskId: item.id,
            redirectTo: currentHref,
            settlementRemark: "",
          }}
        />
        <label className="space-y-1">
          <span className="crm-label">承运商</span>
          <input
            name="shippingProvider"
            defaultValue={item.shippingProvider ?? ""}
            list="shipping-provider-options"
            className="crm-input"
          />
        </label>
        <label className="space-y-1">
          <span className="crm-label">物流单号</span>
          <input
            name="trackingNumber"
            defaultValue={item.trackingNumber ?? ""}
            className="crm-input"
          />
        </label>
        <label className="space-y-1">
          <span className="crm-label">发货状态</span>
          <select
            name="shippingStatus"
            defaultValue={item.shippingStatus}
            className="crm-select"
          >
            {shippingFulfillmentStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {isCod ? (
          <div className="grid gap-2">
            <label className="space-y-1">
              <span className="crm-label">COD 回款状态</span>
              <select
                name="codCollectionStatus"
                defaultValue={codRecord?.status ?? ""}
                className="crm-select"
              >
                <option value="">不更新</option>
                {codCollectionStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="crm-label">COD 回款金额</span>
              <input
                name="codCollectedAmount"
                type="number"
                step="0.01"
                min="0"
                defaultValue={codRecord?.collectedAmount ?? item.codAmount}
                className="crm-input"
              />
            </label>
            <label className="space-y-1">
              <span className="crm-label">COD 备注</span>
              <input
                name="codRemark"
                defaultValue={codRecord?.remark ?? ""}
                className="crm-input"
              />
            </label>
          </div>
        ) : (
          <HiddenFields
            fields={{
              codCollectionStatus: "",
              codCollectedAmount: "",
              codRemark: "",
            }}
          />
        )}
        <button
          type="submit"
          className="crm-button crm-button-primary w-full justify-center"
        >
          保存更新
        </button>
      </form>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Workspace shell
// ---------------------------------------------------------------------------

export function StageWorkspaceHeader({
  title,
  description,
  badges,
  actions,
}: Readonly<{
  title: string;
  description: string;
  badges: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
        <div>
          <h3 className="text-[1rem] font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-0.5 text-[12.5px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

// Re-export StatusBadge variant for convenience
export type { StatusBadgeVariant };
export { StatusBadge };
