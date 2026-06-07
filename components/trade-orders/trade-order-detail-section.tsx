"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ShippingReturnActionResult } from "@/app/(dashboard)/shipping/returns/actions";
import { ActionBanner } from "@/components/shared/action-banner";
import ShippingReturnPanel, {
  type ShippingReturnPanelData,
} from "@/components/shipping/shipping-return-panel";
import { TradeOrderRecycleDialog } from "@/components/trade-orders/trade-order-recycle-dialog";
import { OrderHero } from "@/components/trade-orders/order-hero";
import {
  OrderActionZone,
  type OrderActionZoneTab,
} from "@/components/trade-orders/order-action-zone";
import { OrderItemCard } from "@/components/trade-orders/order-item-card";
import { OrderMetricGrid } from "@/components/trade-orders/order-metric-grid";
import OrderProgressTrack, {
  type OrderProgressPhase,
} from "@/components/trade-orders/order-progress-track";
import {
  OrderTimeline,
  type OrderTimelineEvent,
  type OrderTimelineEventKind,
} from "@/components/trade-orders/order-timeline";
import {
  SupplierFulfillmentAccordion,
  type SupplierFulfillmentItem,
  type SupplierFulfillmentSummary,
} from "@/components/trade-orders/supplier-fulfillment-accordion";
import {
  normalizeShippingPackageSnapshots,
  summarizeShippingPackageSnapshots,
} from "@/lib/shipping/package-snapshots";
import {
  buildFulfillmentBatchesHref,
  buildFulfillmentShippingHref,
  buildFulfillmentTradeOrdersHref,
  type FulfillmentShippingStageView,
} from "@/lib/fulfillment/navigation";
import {
  formatCurrency,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderReviewStatusLabel,
  getSalesOrderReviewStatusVariant,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
  getShippingReportStatusVariant,
} from "@/lib/fulfillment/metadata";
import {
  buildTradeOrderCollectionHref,
  buildTradeOrderPaymentHref,
} from "@/lib/trade-orders/execution-links";
import { formatTradeOrderLineSummary } from "@/lib/trade-orders/display";
import { cn } from "@/lib/utils";
import type { getTradeOrderDetail } from "@/lib/trade-orders/queries";
import type { getActiveShippingReturnForTradeOrder } from "@/lib/shipping/returns";
import type {
  TradeOrderRecycleGuard,
  TradeOrderRecycleReasonCode,
} from "@/lib/trade-orders/recycle-guards";
import type { RecycleFinalizePreview } from "@/lib/recycle-bin/types";

type TradeOrderDetailData = NonNullable<Awaited<ReturnType<typeof getTradeOrderDetail>>>;
type TradeOrderDetail = TradeOrderDetailData["order"];
type OperationLogItem = TradeOrderDetailData["operationLogs"][number];
// Phase C: SSR 透传的退货活跃记录 (Prisma findFirst → T | null).
// page.tsx 直接传 await getActiveShippingReturnForTradeOrder(orderId) 的结果.
export type ActiveShippingReturn = Awaited<
  ReturnType<typeof getActiveShippingReturnForTradeOrder>
>;
type TradeOrderPaymentRecordItem = TradeOrderDetail["paymentRecords"][number];
type TradeOrderCollectionTaskItem = TradeOrderDetail["collectionTasks"][number];
type SalesOrderItem = TradeOrderDetail["salesOrders"][number];
type SalesOrderExecutionItem = NonNullable<TradeOrderDetail["executionSummary"]>["salesOrders"][number];
type TradeOrderRecycleActionResult = {
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
  guard?: TradeOrderRecycleGuard;
  finalizePreview?: RecycleFinalizePreview | null;
};

// TradeStatusValue + label/variant helper 已移入 <OrderHero> widget 内部.
// getTradeItemTypeLabel / getTradeItemTypeVariant 已移入 <OrderItemCard> widget 内部.
// BatchReference + getLatestBatchReferences 旧实现已删除, 批次时间显示由
// <SupplierFulfillmentAccordion> 内部 panel 承担, 不再向 detail section 暴露.

function getPaymentRecordStatusSummaryLabel(value: "SUBMITTED" | "CONFIRMED" | "REJECTED") {
  switch (value) {
    case "SUBMITTED":
      return "收款已提交";
    case "CONFIRMED":
      return "收款已确认";
    case "REJECTED":
      return "收款被驳回";
    default:
      return value;
  }
}

function getCollectionTaskTypeSummaryLabel(
  value: "BALANCE_COLLECTION" | "COD_COLLECTION" | "FREIGHT_COLLECTION" | "GENERAL_COLLECTION",
) {
  switch (value) {
    case "BALANCE_COLLECTION":
      return "尾款催收";
    case "COD_COLLECTION":
      return "COD 催收";
    case "FREIGHT_COLLECTION":
      return "运费催收";
    case "GENERAL_COLLECTION":
      return "一般催收";
    default:
      return value;
  }
}

function getCollectionTaskStatusSummaryLabel(
  value: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED",
) {
  switch (value) {
    case "PENDING":
      return "待处理";
    case "IN_PROGRESS":
      return "跟进中";
    case "COMPLETED":
      return "已完成";
    case "CANCELED":
      return "已取消";
    default:
      return value;
  }
}

/**
 * 把内部 OperationLog.action 枚举翻译成销售/主管/发货员能直接看懂的中文事件名 +
 * 一个 timeline kind, 用于 OrderTimeline widget 上的 icon / tone.
 *
 * 落地原则:
 * - 销售/主管/发货员看到的不是 "trade_order.submitted_for_review"
 *   而是 "销售提交审核".
 * - 没匹配到的 action 兜底用 review tone + module/action 直显, 避免漏点.
 */
function mapOperationLogActionToTimelineMeta(action: string): {
  title: string;
  kind: OrderTimelineEventKind;
} {
  switch (action) {
    case "trade_order.created":
    case "trade_order.draft_saved":
      return { title: "销售保存订单草稿", kind: "review" };
    case "trade_order.submitted_for_review":
      return { title: "销售提交审核", kind: "review" };
    case "trade_order.approved":
      return { title: "主管审核通过", kind: "review" };
    case "trade_order.rejected":
      return { title: "主管驳回订单", kind: "review" };
    case "sales_order.created_from_trade_order":
    case "sales_order.created":
      return { title: "供货商子单生成", kind: "review" };
    case "sales_order.approved_via_trade_order":
    case "sales_order.approved":
      return { title: "供货商子单批准", kind: "child_approved" };
    case "sales_order.rejected_via_trade_order":
    case "sales_order.rejected":
      return { title: "供货商子单驳回", kind: "revision" };
    case "sales_order.resubmitted":
      return { title: "供货商子单重新提交", kind: "review" };
    case "shipping_task.reported":
      return { title: "发货员报单", kind: "report" };
    case "shipping_task.reexported":
      return { title: "发货员重新报单", kind: "report" };
    case "shipping_task.v2_updated":
      return { title: "物流状态更新", kind: "tracking" };
    case "trade_order.revision_requested":
      return { title: "客户调整需求", kind: "revision" };
    case "trade_order.revision_approved_reduce":
      return { title: "调整审核通过(减量)", kind: "revision" };
    case "trade_order.revision_approved_cancel":
      return { title: "调整审核通过(取消)", kind: "revision" };
    case "trade_order.revision_rejected":
      return { title: "调整审核驳回", kind: "revision" };
    case "trade_order.revision_blocked":
      return { title: "调整被阻断", kind: "revision" };
    case "trade_order.revision_withdrawn":
      return { title: "调整请求已撤回", kind: "revision" };
    case "refund_request.created":
      return { title: "财务退款单已创建", kind: "refund" };
    case "refund_request.approved":
      return { title: "退款单审核通过", kind: "refund" };
    case "refund_request.rejected":
      return { title: "退款单审核驳回", kind: "refund" };
    case "refund_request.paid_out":
      return { title: "退款已打款", kind: "refund" };
    case "refund_request.withdrawn":
      return { title: "退款申请已撤回", kind: "refund" };
    case "trade_order.moved_to_recycle_bin":
      return { title: "订单移入回收站", kind: "revision" };
    case "trade_order.restored_from_recycle_bin":
      return { title: "订单从回收站恢复", kind: "revision" };
    case "trade_order.purged_from_recycle_bin":
      return { title: "订单永久销毁", kind: "revision" };
    case "trade_order.archived_from_recycle_bin":
      return { title: "订单已归档", kind: "review" };
    default:
      // 兜底: 拆出最后一段, 把 underscore 转空格, 例如 shipping_task.foo_bar -> foo bar
      {
        const tail = action.split(".").pop() ?? action;
        const humanTail = tail.replace(/_/g, " ");
        return { title: humanTail, kind: "review" };
      }
  }
}

function isShippingCompletedLike(
  value:
    | "PENDING"
    | "READY_TO_SHIP"
    | "SHIPPED"
    | "DELIVERED"
    | "COMPLETED"
    | "REFUNDED"
    | "CANCELED"
    | null,
) {
  return (
    value === "SHIPPED" ||
    value === "DELIVERED" ||
    value === "COMPLETED" ||
    value === "REFUNDED"
  );
}

function getSalesOrderProductSummary(items: SalesOrderItem["items"]) {
  if (items.length === 0) {
    return "暂无执行商品";
  }

  const heads = items.slice(0, 2).map((item) =>
    formatTradeOrderLineSummary({
      titleSnapshot: item.titleSnapshot,
      productNameSnapshot: item.productNameSnapshot,
      skuNameSnapshot: item.skuNameSnapshot,
      specSnapshot: item.specSnapshot,
      unitSnapshot: item.unitSnapshot,
      qty: item.qty,
    }),
  );

  if (items.length <= 2) {
    return heads.join(" / ");
  }

  return `${heads.join(" / ")} 等 ${items.length} 项`;
}

// getTradeItemHeadline / getTradeItemSubline 已移入 <OrderItemCard> widget 内部.

function getTradeOrderShippingStage(
  summary: TradeOrderDetail["executionSummary"],
): FulfillmentShippingStageView | undefined {
  if (!summary) {
    return undefined;
  }

  if (summary.exceptionSubOrderCount > 0) {
    return "EXCEPTION";
  }

  if (summary.pendingTrackingSubOrderCount > 0) {
    return "PENDING_TRACKING";
  }

  if (summary.pendingReportSubOrderCount > 0) {
    return "PENDING_REPORT";
  }

  if (summary.shippedSubOrderCount > 0) {
    return "SHIPPED";
  }

  return undefined;
}

function getSalesOrderShippingStage(
  executionSummary: SalesOrderExecutionItem | undefined,
): FulfillmentShippingStageView | undefined {
  if (!executionSummary) {
    return undefined;
  }

  if (executionSummary.hasException) {
    return "EXCEPTION";
  }

  if (executionSummary.reportStatus !== "REPORTED" && !executionSummary.hasTrackingNumber) {
    return "PENDING_REPORT";
  }

  if (executionSummary.reportStatus === "REPORTED" && !executionSummary.hasTrackingNumber) {
    return "PENDING_TRACKING";
  }

  if (executionSummary.shippingStatus && isShippingCompletedLike(executionSummary.shippingStatus)) {
    return "SHIPPED";
  }

  return undefined;
}

// 父单当前推进阶段, 用于 <OrderProgressTrack> 高亮.
// 不再使用 nextAction 文案卡; 由 progress track 节点 + ActionZone 共同表达"下一步".
function resolveOrderProgressPhase(
  order: TradeOrderDetail,
  summary: TradeOrderDetail["executionSummary"],
): OrderProgressPhase {
  if (order.tradeStatus === "CANCELED") {
    return "CANCELED";
  }
  if (order.tradeStatus === "REVISION_PENDING") {
    return "REVISION_PENDING";
  }
  if (order.tradeStatus === "DRAFT") {
    return "DRAFT";
  }
  if (order.tradeStatus === "PENDING_REVIEW") {
    return "PENDING_REVIEW";
  }
  if (order.tradeStatus === "REJECTED") {
    return "PENDING_REVIEW";
  }
  // APPROVED 之后, 根据执行摘要落到具体节点
  if (!summary || summary.totalSubOrderCount === 0) {
    return "APPROVED";
  }
  if (summary.allShipped && Number(order.remainingAmount) <= 0) {
    return "COMPLETED";
  }
  if (summary.allShipped) {
    return "COLLECTED";
  }
  if (summary.shippedSubOrderCount > 0) {
    return "SHIPPED";
  }
  if (summary.reportedSubOrderCount > 0) {
    return "REPORTED";
  }
  return "APPROVED";
}

// 把 salesOrders 中的 shippingTask 真实时间戳归集到 OrderProgressTrack 节点上.
function resolveOrderProgressTimestamps(
  order: TradeOrderDetail,
): Partial<Record<OrderProgressPhase, Date | null>> {
  const reportedAts = order.salesOrders
    .map((salesOrder) => salesOrder.shippingTask?.reportedAt ?? null)
    .filter((value): value is Date => value !== null);
  const shippedAts = order.salesOrders
    .map((salesOrder) => salesOrder.shippingTask?.shippedAt ?? null)
    .filter((value): value is Date => value !== null);
  const earliest = (values: Date[]) =>
    values.length === 0
      ? null
      : values.reduce((min, current) => (current < min ? current : min));
  return {
    DRAFT: order.createdAt,
    PENDING_REVIEW: order.createdAt,
    APPROVED: order.reviewedAt ?? null,
    REPORTED: earliest(reportedAts),
    SHIPPED: earliest(shippedAts),
  };
}

const detailActionClassName =
  "inline-flex items-center rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary";

// OverviewCard / DetailPair / detail* class tokens / getShippingSummaryText / getBatchFileStateMeta
// 已由 <OrderMetricGrid> + <SupplierFulfillmentAccordion> 替代, 此处不再保留.

function TradeOrderItemsSection({
  order,
}: Readonly<{
  order: TradeOrderDetail;
}>) {
  return (
    <section className="crm-section-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">商品明细</h3>
        {order.discountAmount !== "0" ? (
          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
            含折扣 {formatCurrency(order.discountAmount)}
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3">
        {order.items.map((item) => {
          const supplierName =
            item.components.length > 0
              ? Array.from(
                  new Set(
                    item.components
                      .map((c) => c.supplierNameSnapshot?.trim())
                      .filter((v): v is string => Boolean(v)),
                  ),
                ).join(" / ")
              : "";
          return (
            <OrderItemCard
              key={item.id}
              itemType={item.itemType}
              lineNo={item.lineNo}
              titleSnapshot={item.titleSnapshot}
              productNameSnapshot={item.productNameSnapshot}
              skuNameSnapshot={item.skuNameSnapshot}
              specSnapshot={item.specSnapshot}
              unitSnapshot={item.unitSnapshot}
              qty={item.qty}
              unitPrice={formatCurrency(item.dealUnitPriceSnapshot)}
              subtotal={formatCurrency(item.subtotal)}
              discountAmount={formatCurrency(item.discountAmount)}
              supplierName={supplierName}
              bundleCode={item.bundleCodeSnapshot}
              remark={item.remark}
            />
          );
        })}
      </div>
    </section>
  );
}

// NOTE: SupplierExecutionSection (旧 supplier 子单执行总览 / 兜底规划列表)
// 已由 <SupplierFulfillmentAccordion> + 其 emptyHint 取代; 此函数删除以避免 dead code.
// FulfillmentSummaryCards (旧支付/发货/批次三摘要卡) 同样已被 SupplierAccordion 顶部 chip 流取代.

// 父单级提醒: 当出现异常组合 (未报单 / 已发货未收款 / 仍催收) 时, 给一行
// 紧凑的 alert chip 流, 默认不渲染. 把"何处去处理"挂在 chip 上, 避免独立大 section.
function ParentOrderAlertsSection({
  order,
  unreportedCount,
  shippedWithoutPaymentCount,
  openCollectionCount,
}: Readonly<{
  order: TradeOrderDetail;
  unreportedCount: number;
  shippedWithoutPaymentCount: number;
  openCollectionCount: number;
}>) {
  if (
    unreportedCount === 0 &&
    shippedWithoutPaymentCount === 0 &&
    openCollectionCount === 0
  ) {
    return null;
  }
  type AlertChip = {
    key: string;
    label: string;
    href: string;
    tone: "warning" | "danger";
  };
  const chips: AlertChip[] = [];
  if (unreportedCount > 0) {
    chips.push({
      key: "unreported",
      label: `待报单 ${unreportedCount}`,
      href: buildFulfillmentShippingHref({
        keyword: order.tradeNo,
        stageView: "PENDING_REPORT",
      }),
      tone: "warning",
    });
  }
  if (shippedWithoutPaymentCount > 0) {
    chips.push({
      key: "shipped-no-payment",
      label: `已发货未收款 ${shippedWithoutPaymentCount}`,
      href: buildTradeOrderPaymentHref(order.tradeNo),
      tone: "danger",
    });
  }
  if (openCollectionCount > 0) {
    chips.push({
      key: "open-collection",
      label: `催收中 ${openCollectionCount}`,
      href: buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" }),
      tone: "warning",
    });
  }
  return (
    <section
      aria-label="父单级提醒"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm"
    >
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        待处理
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            chip.tone === "danger"
              ? "border-[var(--tone-danger-soft-border)] bg-[var(--tone-danger-soft-bg)] text-[var(--color-danger)] hover:border-[var(--color-danger)]"
              : "border-amber-300/70 bg-amber-50/40 text-amber-700 hover:border-amber-500 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
          )}
        >
          {chip.label}
        </Link>
      ))}
    </section>
  );
}

// NOTE: TimelineAndOperationLogSection (旧关键时间线 + 操作日志双 section)
// 已由 <OrderTimeline events={timelineEvents} /> vertical timeline 取代;
// 此函数删除以避免 dead code.

export function TradeOrderDetailSection(
  props: Readonly<{
    order: TradeOrderDetail;
    operationLogs: OperationLogItem[];
    canReview: boolean;
    canContinueEdit: boolean;
    continueEditHref?: string;
    reviewAction: (formData: FormData) => Promise<void>;
    moveToRecycleBinAction: (
      formData: FormData,
    ) => Promise<TradeOrderRecycleActionResult>;
    revisionPanel?: React.ReactNode;
    // Phase C: SSR 透传的退货活跃记录 + 权限 + actions.
    // detail-section 内部把 Prisma 结果 normalize 成 ShippingReturnPanelData 后
    // 喂给 <ShippingReturnPanel />. 仅在订单已发货 (任一 supplier 子单 shippedAt 非空)
    // 或已有活跃退货时渲染.
    activeShippingReturn?: ActiveShippingReturn;
    canRequestShippingReturn?: boolean;
    canReviewShippingReturn?: boolean;
    currentUserId?: string;
    requestShippingReturnAction?: (
      formData: FormData,
    ) => Promise<ShippingReturnActionResult>;
    reviewShippingReturnAction?: (
      formData: FormData,
    ) => Promise<ShippingReturnActionResult>;
    cancelShippingReturnAction?: (
      formData: FormData,
    ) => Promise<ShippingReturnActionResult>;
  }>,
) {
  const {
    order,
    operationLogs,
    canReview,
    canContinueEdit,
    continueEditHref,
    reviewAction,
    moveToRecycleBinAction,
    revisionPanel,
    activeShippingReturn,
    canRequestShippingReturn,
    canReviewShippingReturn,
    currentUserId,
    requestShippingReturnAction,
    reviewShippingReturnAction,
    cancelShippingReturnAction,
  } = props;
  const [notice, setNotice] = useState<TradeOrderRecycleActionResult | null>(null);
  const [recycleDialogOpen, setRecycleDialogOpen] = useState(false);
  const [recycleReason, setRecycleReason] =
    useState<TradeOrderRecycleReasonCode>("mistaken_creation");
  const [recyclePending, startRecycleTransition] = useTransition();
  const router = useRouter();

  // 父单成交计数: 仅用于 supplier accordion summary 兜底; 其余 SKU/套餐/赠品
  // 计数已下沉到 <OrderItemCard> 视觉表达, 不再向上层暴露.
  const totalSubOrders = order.salesOrders.length;
  const actualSupplierCount = new Set(
    order.salesOrders.map((salesOrder) => salesOrder.supplier.id),
  ).size;
  const plannedSupplierCount = new Set(
    order.components.map((component) => component.supplierId),
  ).size;
  // 收款/催收派生计数 (OrderMetricGrid tooltip 使用)
  const confirmedPaymentRecordCount = order.paymentRecords.filter(
    (record) => record.status === "CONFIRMED",
  ).length;
  const openCollectionTaskCount = order.collectionTasks.filter(
    (task) => task.status === "PENDING" || task.status === "IN_PROGRESS",
  ).length;
  const executionSummary = order.executionSummary;
  const executionSummaryBySalesOrderId = new Map(
    executionSummary?.salesOrders.map((salesOrder) => [salesOrder.id, salesOrder]) ?? [],
  );
  // OrderTimeline 事件: 合并三类来源 ->
  //   1. operationLogs (审核/调整/退款/回收 等纯日志事件)
  //   2. salesOrders.shippingTask 的 reportedAt / shippedAt (报单 + 发货真相)
  //   3. paymentRecords + collectionTasks (收款 + 催收真相)
  // 让 OrderTimeline widget 自己按 occurredAt 倒序 + 默认 8 条折叠.
  const timelineEvents: OrderTimelineEvent[] = [
    ...operationLogs.map((record): OrderTimelineEvent => {
      const meta = mapOperationLogActionToTimelineMeta(record.action);
      return {
        id: `log-${record.id}`,
        kind: meta.kind,
        occurredAt: record.createdAt,
        title: meta.title,
        detail: record.description ?? undefined,
        actor: record.actor?.name || record.actor?.username || undefined,
        href: `/orders/${order.id}`,
      };
    }),
    ...order.salesOrders
      .filter((salesOrder) => salesOrder.shippingTask?.reportedAt)
      .map(
        (salesOrder): OrderTimelineEvent => ({
          id: `reported-${salesOrder.id}`,
          kind: "report",
          occurredAt: salesOrder.shippingTask?.reportedAt ?? salesOrder.createdAt,
          title: "发货员报单",
          detail: `${salesOrder.supplier.name} · ${salesOrder.subOrderNo || salesOrder.orderNo}`,
          href: buildFulfillmentShippingHref({
            keyword: order.tradeNo,
            supplierViewId: salesOrder.supplier.id,
            stageView: "PENDING_TRACKING",
          }),
        }),
      ),
    ...order.salesOrders
      .filter((salesOrder) => salesOrder.shippingTask?.shippedAt)
      .map(
        (salesOrder): OrderTimelineEvent => ({
          id: `shipped-${salesOrder.id}`,
          kind: "ship",
          occurredAt: salesOrder.shippingTask?.shippedAt ?? salesOrder.createdAt,
          title: "子单发货",
          detail: `${salesOrder.supplier.name} · ${salesOrder.subOrderNo || salesOrder.orderNo}`,
          href: buildFulfillmentShippingHref({
            keyword: order.tradeNo,
            supplierViewId: salesOrder.supplier.id,
            stageView: "SHIPPED",
          }),
        }),
      ),
    ...order.paymentRecords.map(
      (paymentRecord: TradeOrderPaymentRecordItem): OrderTimelineEvent => ({
        id: `payment-${paymentRecord.id}`,
        kind: "pay",
        occurredAt: paymentRecord.occurredAt,
        title: getPaymentRecordStatusSummaryLabel(paymentRecord.status),
        detail: `${paymentRecord.salesOrder?.subOrderNo || paymentRecord.salesOrder?.orderNo || "未绑定子单"} · ${formatCurrency(paymentRecord.amount)}`,
        href: buildTradeOrderPaymentHref(order.tradeNo),
      }),
    ),
    ...order.collectionTasks.map(
      (collectionTask: TradeOrderCollectionTaskItem): OrderTimelineEvent => ({
        id: `collection-${collectionTask.id}`,
        kind: "collection",
        occurredAt: collectionTask.createdAt,
        title: getCollectionTaskTypeSummaryLabel(collectionTask.taskType),
        detail: `${collectionTask.salesOrder?.subOrderNo || collectionTask.salesOrder?.orderNo || "未绑定子单"} · ${getCollectionTaskStatusSummaryLabel(collectionTask.status)}`,
        href: buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" }),
      }),
    ),
  ];

  // SupplierFulfillmentAccordion items: 把 salesOrder 跟执行摘要 normalize 成
  // 视觉组件友好的字符串/数字, 让组件只做渲染.
  const supplierAccordionItems: SupplierFulfillmentItem[] = order.salesOrders.map(
    (salesOrder) => {
      const execution = executionSummaryBySalesOrderId.get(salesOrder.id);
      const latestBatch = salesOrder.shippingTask?.exportBatch ?? null;
      const packageSummary = summarizeShippingPackageSnapshots(
        normalizeShippingPackageSnapshots(salesOrder.shippingTask?.shippingPackages ?? []),
      );
      return {
        id: salesOrder.id,
        supplierName: salesOrder.supplier.name,
        subOrderNo: salesOrder.subOrderNo || salesOrder.orderNo,
        finalAmount: salesOrder.finalAmount,
        collectedAmount: salesOrder.collectedAmount,
        remainingAmount: salesOrder.remainingAmount,
        paymentSchemeLabel: getSalesOrderPaymentSchemeLabel(salesOrder.paymentScheme),
        productSummary: getSalesOrderProductSummary(salesOrder.items),
        reviewStatusLabel: getSalesOrderReviewStatusLabel(salesOrder.reviewStatus),
        reviewStatusVariant: getSalesOrderReviewStatusVariant(salesOrder.reviewStatus),
        reportStatusLabel: salesOrder.shippingTask
          ? getShippingReportStatusLabel(salesOrder.shippingTask.reportStatus)
          : undefined,
        reportStatusVariant: salesOrder.shippingTask
          ? getShippingReportStatusVariant(salesOrder.shippingTask.reportStatus)
          : undefined,
        shippingStatusLabel: salesOrder.shippingTask
          ? getShippingFulfillmentStatusLabel(salesOrder.shippingTask.shippingStatus)
          : "待初始化发货",
        shippingStatusVariant: salesOrder.shippingTask
          ? getShippingFulfillmentStatusVariant(salesOrder.shippingTask.shippingStatus)
          : "neutral",
        hasException: Boolean(execution?.hasException),
        shippingProvider: salesOrder.shippingTask?.shippingProvider ?? null,
        trackingNumber: salesOrder.shippingTask?.trackingNumber ?? null,
        shippingPackageSummary: packageSummary || null,
        paymentRecordCount: execution?.paymentRecordCount ?? 0,
        openCollectionTaskCount: execution?.openCollectionTaskCount ?? 0,
        latestBatchExportNo: latestBatch?.exportNo ?? null,
        latestBatchExportedAt: latestBatch?.exportedAt ?? null,
        latestBatchFileReady: latestBatch ? Boolean(latestBatch.fileUrl) : undefined,
        shippingHref: buildFulfillmentShippingHref({
          keyword: order.tradeNo,
          supplierViewId: salesOrder.supplier.id,
          stageView: getSalesOrderShippingStage(execution),
        }),
        batchHref: buildFulfillmentBatchesHref({
          keyword: latestBatch?.exportNo || order.tradeNo,
          supplierId: salesOrder.supplier.id,
        }),
        detailHref: `/orders/${salesOrder.id}`,
      };
    },
  );

  const supplierAccordionSummary: SupplierFulfillmentSummary = {
    subOrderCount: totalSubOrders || plannedSupplierCount,
    supplierCount: actualSupplierCount || plannedSupplierCount,
    totalAmount: order.finalAmount,
    shippedCount: executionSummary?.shippedSubOrderCount ?? 0,
    pendingReportCount: executionSummary?.pendingReportSubOrderCount ?? 0,
    pendingTrackingCount: executionSummary?.pendingTrackingSubOrderCount ?? 0,
    exceptionCount: executionSummary?.exceptionSubOrderCount ?? 0,
  };

  // 父单级提醒计数: 仅保留可执行 chip, 不再把"分裂状态"暴露成独立卡片.
  const unreportedCount =
    executionSummary?.salesOrders.filter(
      (salesOrder) => salesOrder.reportStatus !== "REPORTED",
    ).length ?? 0;
  const shippedWithoutPaymentCount =
    executionSummary?.salesOrders.filter(
      (salesOrder) =>
        isShippingCompletedLike(salesOrder.shippingStatus) && !salesOrder.hasPaymentRecord,
    ).length ?? 0;
  const openCollectionCount =
    executionSummary?.salesOrders.filter(
      (salesOrder) => salesOrder.openCollectionTaskCount > 0,
    ).length ?? 0;

  const primaryShippingHref = buildFulfillmentShippingHref({
    keyword: order.tradeNo,
    stageView: getTradeOrderShippingStage(executionSummary),
  });
  const batchHref = buildFulfillmentBatchesHref({ keyword: order.tradeNo });
  const progressPhase = resolveOrderProgressPhase(order, executionSummary);
  const progressTimestamps = resolveOrderProgressTimestamps(order);
  const recycleGuard =
    notice?.recycleStatus === "blocked" && notice.guard ? notice.guard : order.recycleGuard;
  const finalizePreview =
    notice?.recycleStatus === "blocked" && notice.finalizePreview !== undefined
      ? notice.finalizePreview ?? null
      : order.finalizePreview;

  function openRecycleDialog() {
    setNotice((current) => (current?.recycleStatus === "blocked" ? current : null));
    setRecycleReason("mistaken_creation");
    setRecycleDialogOpen(true);
  }

  function closeRecycleDialog() {
    setRecycleDialogOpen(false);
    setRecycleReason("mistaken_creation");
  }

  function handleRecycleConfirm() {
    if (!recycleGuard.canMoveToRecycleBin) {
      return;
    }

    const formData = new FormData();
    formData.set("id", order.id);
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
        setNotice(result);
        return;
      }

      setNotice(result);
    });
  }

  // Phase C 退货面板上下文:
  // 1. primaryShippingTaskId — 取第一个已发货的 supplier 子单的 shippingTask.id, 用于"申请退货".
  // 2. shippingReturnPanelData — 把 Prisma 结果 normalize 成 panel 友好的字符串 / Date 形.
  const primaryShippingTaskId =
    order.salesOrders.find(
      (salesOrder) => salesOrder.shippingTask?.shippedAt != null,
    )?.shippingTask?.id ?? null;
  const shippingReturnPanelData: ShippingReturnPanelData | null =
    activeShippingReturn
      ? {
          id: activeShippingReturn.id,
          status: activeShippingReturn.status,
          reason: activeShippingReturn.reason,
          reasonDetail: activeShippingReturn.reasonDetail,
          expectedRefundAmount:
            typeof activeShippingReturn.expectedRefundAmount === "string"
              ? activeShippingReturn.expectedRefundAmount
              : activeShippingReturn.expectedRefundAmount.toString(),
          requestedAt: activeShippingReturn.requestedAt,
          requester: activeShippingReturn.requester,
          reviewedAt: activeShippingReturn.reviewedAt,
          reviewer: activeShippingReturn.reviewer,
          reviewNote: activeShippingReturn.reviewNote,
          rejectReason: activeShippingReturn.rejectReason,
          returnTrackingNumber: activeShippingReturn.returnTrackingNumber,
          returnCarrier: activeShippingReturn.returnCarrier,
          trackingFilledAt: activeShippingReturn.trackingFilledAt,
          receivedAt: activeShippingReturn.receivedAt,
          receivedRemark: activeShippingReturn.receivedRemark,
          refundRequestId: activeShippingReturn.refundRequestId,
          shippingTaskId: activeShippingReturn.shippingTaskId,
        }
      : null;
  // 仅在订单已发货 (任一 supplier 子单有 shippedAt) 或已有活跃退货时显示面板;
  // 同时 actions / userId 必须齐全 (page.tsx 透传).
  const showShippingReturnPanel =
    (primaryShippingTaskId !== null || shippingReturnPanelData !== null) &&
    requestShippingReturnAction !== undefined &&
    reviewShippingReturnAction !== undefined &&
    cancelShippingReturnAction !== undefined &&
    currentUserId !== undefined;

  return (
    <div className="space-y-6">
      {notice ? (
        <ActionBanner tone={notice.status === "success" ? "success" : "danger"}>
          {notice.message}
        </ActionBanner>
      ) : null}

      {/* a. OrderHero — 客户 / 订单号 / 金额 三栏, 单一主状态 chip */}
      <OrderHero
        tradeNo={order.tradeNo}
        tradeStatus={order.tradeStatus}
        reviewStatus={order.reviewStatus}
        createdAt={order.createdAt}
        finalAmount={order.finalAmount}
        collectedAmount={order.collectedAmount}
        remainingAmount={order.remainingAmount}
        customer={{
          name: order.customer.name,
          owner: order.customer.owner
            ? {
                name: order.customer.owner.name,
                username: order.customer.owner.username,
              }
            : null,
        }}
        hasActiveRevision={order.tradeStatus === "REVISION_PENDING"}
        activeShippingReturnStatus={shippingReturnPanelData?.status ?? null}
      />

      {/* 次要快捷入口 (返回列表 / 发货执行 / 批次 / 回收) - 单独 quick-link 行 */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={buildFulfillmentTradeOrdersHref()}
          className={detailActionClassName}
        >
          返回交易单列表
        </Link>
        <Link href={primaryShippingHref} className={detailActionClassName}>
          去发货执行
        </Link>
        <Link href={batchHref} className={detailActionClassName}>
          看批次记录
        </Link>
        <Link
          href={buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" })}
          className={detailActionClassName}
        >
          看催收任务
        </Link>
        <button
          type="button"
          onClick={openRecycleDialog}
          className={detailActionClassName}
        >
          {recycleGuard.canMoveToRecycleBin ? "移入回收站" : "查看阻断关系"}
        </button>
      </div>

      {/* b. OrderProgressTrack — 草稿 → 待审核 → 已审核 → 已报单 → 已发货 → 已收款 → 已完结 */}
      <OrderProgressTrack
        currentPhase={progressPhase}
        timestamps={progressTimestamps}
      />

      {/* c. OrderActionZone — 把 撤单 / 退货 (未来 退款) 合并到 tab 切换的行动卡 */}
      <OrderActionZone
        tabs={(() => {
          const tabs: OrderActionZoneTab[] = [];
          if (revisionPanel) {
            tabs.push({
              key: "revision",
              available: true,
              active: order.tradeStatus === "REVISION_PENDING",
              hint:
                order.tradeStatus === "REVISION_PENDING"
                  ? "撤单申请正在审批中, 主管复审后会逆向所有履约/收款。"
                  : "客户反悔或需调整数量时, 在此发起撤单 / 减量申请。",
              content: revisionPanel,
            });
          }
          if (showShippingReturnPanel) {
            tabs.push({
              key: "return",
              available: true,
              active: shippingReturnPanelData !== null,
              hint:
                shippingReturnPanelData !== null
                  ? "已存在退货流程, 跟进运单回填与到仓确认。"
                  : "客户已收货但要求退回时, 在此发起退货申请。",
              content: (
                <ShippingReturnPanel
                  tradeOrderId={order.id}
                  customerId={order.customer.id}
                  primaryShippingTaskId={primaryShippingTaskId}
                  activeShippingReturn={shippingReturnPanelData}
                  canRequest={canRequestShippingReturn ?? false}
                  canReview={canReviewShippingReturn ?? false}
                  currentUserId={currentUserId ?? ""}
                  requestAction={requestShippingReturnAction!}
                  reviewAction={reviewShippingReturnAction!}
                  cancelAction={cancelShippingReturnAction!}
                />
              ),
            });
          }
          return tabs;
        })()}
      />

      {/* d. OrderMetricGrid — 4 张可视化指标卡 (金额 / 回款环 / 履约条 / 异常) */}
      <OrderMetricGrid
        totalAmount={formatCurrency(order.finalAmount)}
        collectedAmount={formatCurrency(order.collectedAmount)}
        remainingAmount={formatCurrency(order.remainingAmount)}
        totalSubOrders={executionSummary?.totalSubOrderCount ?? totalSubOrders}
        shippedSubOrders={executionSummary?.shippedSubOrderCount ?? 0}
        pendingSubOrders={
          (executionSummary?.pendingReportSubOrderCount ?? 0) +
          (executionSummary?.pendingTrackingSubOrderCount ?? 0)
        }
        exceptionSubOrders={executionSummary?.exceptionSubOrderCount ?? 0}
        tooltips={{
          amount: `成交 ${order.items.length} 行 · 折扣 ${formatCurrency(order.discountAmount)} · ${getSalesOrderPaymentSchemeLabel(order.paymentScheme)}`,
          payment: `已确认 ${confirmedPaymentRecordCount} 条 · 催收中 ${openCollectionTaskCount}`,
          fulfillment: `待报单 ${executionSummary?.pendingReportSubOrderCount ?? 0} · 待物流 ${executionSummary?.pendingTrackingSubOrderCount ?? 0}`,
          exception: `待报单 ${executionSummary?.pendingReportSubOrderCount ?? 0} · 待物流 ${executionSummary?.pendingTrackingSubOrderCount ?? 0}`,
        }}
      />

      {/* 收货信息: 紧凑单行 */}
      <section
        className="rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm"
        aria-label="收货信息"
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            收货
          </span>
          <span className="text-sm font-semibold text-foreground">
            {order.receiverNameSnapshot}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {order.receiverPhoneSnapshot}
          </span>
          <span
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={order.receiverAddressSnapshot}
          >
            {order.receiverAddressSnapshot}
          </span>
        </div>
      </section>

      {/* 备注 / 驳回原因 / 继续编辑 / 审核操作 */}
      {(order.remark ||
        order.rejectReason ||
        canContinueEdit ||
        (canReview && order.tradeStatus === "PENDING_REVIEW")) && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="border-l-2 border-border/50 pl-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              备注与说明
            </div>
            <div className="mt-3 space-y-2.5 text-sm leading-6 text-muted-foreground">
              {order.remark ? <div>父单备注：{order.remark}</div> : null}
              {order.rejectReason ? <div>驳回原因：{order.rejectReason}</div> : null}
              {canContinueEdit && continueEditHref ? (
                <div>
                  当前父单仍可回到客户详情继续编辑；重新提交审核会按最新结构刷新子单。
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {canContinueEdit && continueEditHref ? (
              <div className="border-l-2 border-border/50 pl-4">
                <div className="text-sm font-medium text-foreground">回到客户详情继续编辑</div>
                <div className="mt-1 text-xs leading-6 text-muted-foreground">
                  适用于草稿或驳回父单，编辑完成后再重新提交审核。
                </div>
                <div className="mt-3">
                  <Link href={continueEditHref} className={detailActionClassName}>
                    去客户详情继续编辑
                  </Link>
                </div>
              </div>
            ) : null}

            {canReview && order.tradeStatus === "PENDING_REVIEW" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <form
                  action={reviewAction}
                  className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3.5"
                >
                  <input type="hidden" name="tradeOrderId" value={order.id} />
                  <input type="hidden" name="reviewStatus" value="APPROVED" />
                  <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
                  <div className="text-sm font-medium text-foreground">审核通过</div>
                  <button type="submit" className="crm-button crm-button-primary mt-3 w-full">
                    审核通过
                  </button>
                </form>

                <form
                  action={reviewAction}
                  className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-3.5"
                >
                  <input type="hidden" name="tradeOrderId" value={order.id} />
                  <input type="hidden" name="reviewStatus" value="REJECTED" />
                  <input type="hidden" name="redirectTo" value={`/orders/${order.id}`} />
                  <div className="text-sm font-medium text-foreground">驳回父单</div>
                  <textarea
                    name="rejectReason"
                    rows={3}
                    required
                    placeholder="填写驳回原因"
                    className="crm-textarea mt-3"
                  />
                  <button type="submit" className="crm-button crm-button-secondary mt-3 w-full">
                    提交驳回
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </section>
      )}

      {/* e. 商品行 — OrderItemCard 列表 */}
      <TradeOrderItemsSection order={order} />

      {/* f. SupplierFulfillmentAccordion — 默认折叠的供货商子单卡 */}
      <SupplierFulfillmentAccordion
        items={supplierAccordionItems}
        summary={supplierAccordionSummary}
        emptyHint={
          plannedSupplierCount > 0
            ? `当前父单尚未物化 supplier 子单 (规划 ${plannedSupplierCount} 个 supplier)。提交审核后自动生成。`
            : "当前父单尚未物化 supplier 子单。"
        }
      />

      <ParentOrderAlertsSection
        order={order}
        unreportedCount={unreportedCount}
        shippedWithoutPaymentCount={shippedWithoutPaymentCount}
        openCollectionCount={openCollectionCount}
      />

      {/* g. OrderTimeline — vertical timeline 取代关键时间线 + 操作日志 */}
      <OrderTimeline events={timelineEvents} />

      <TradeOrderRecycleDialog
        open={recycleDialogOpen}
        item={{
          tradeNo: order.tradeNo,
          customerName: order.customer.name,
          receiverName: order.receiverNameSnapshot,
          receiverPhone: order.receiverPhoneSnapshot,
          tradeStatus: order.tradeStatus,
          reviewStatus: order.reviewStatus,
          updatedAt: order.updatedAt,
        }}
        guard={recycleGuard}
        finalizePreview={finalizePreview ?? null}
        reason={recycleReason}
        onReasonChange={setRecycleReason}
        onClose={closeRecycleDialog}
        onConfirm={handleRecycleConfirm}
        pending={recyclePending}
      />
    </div>
  );
}
