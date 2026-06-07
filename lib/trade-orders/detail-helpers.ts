/**
 * lib/trade-orders/detail-helpers.ts
 *
 * 订单详情页 (components/trade-orders/trade-order-detail-section.tsx) 的
 * 派生/翻译 helper 集合, 从 detail-section 抽出以让主组件聚焦视觉/编排.
 *
 * 这些 helper 都是纯函数, 不依赖 React, 也不依赖 client runtime.
 */

import type { PaymentSnapshotRecord } from "@/components/trade-orders/payment-snapshot-card";
import type { OrderProgressPhase } from "@/components/trade-orders/order-progress-track";
import type {
  OrderTimelineEvent,
  OrderTimelineEventKind,
} from "@/components/trade-orders/order-timeline";
import type { SupplierFulfillmentItem } from "@/components/trade-orders/supplier-fulfillment-accordion";
import { formatDateTime } from "@/lib/customers/metadata";
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
  buildFulfillmentBatchesHref,
  buildFulfillmentShippingHref,
  type FulfillmentShippingStageView,
} from "@/lib/fulfillment/navigation";
import {
  normalizeShippingPackageSnapshots,
  summarizeShippingPackageSnapshots,
} from "@/lib/shipping/package-snapshots";
import { formatTradeOrderLineSummary } from "@/lib/trade-orders/display";
import {
  buildTradeOrderCollectionHref,
  buildTradeOrderPaymentHref,
} from "@/lib/trade-orders/execution-links";
import type { getTradeOrderDetail } from "@/lib/trade-orders/queries";

type TradeOrderDetailData = NonNullable<Awaited<ReturnType<typeof getTradeOrderDetail>>>;
type TradeOrderDetail = TradeOrderDetailData["order"];
type OperationLogItem = TradeOrderDetailData["operationLogs"][number];
type SalesOrderItem = TradeOrderDetail["salesOrders"][number];
type SalesOrderExecutionItem = NonNullable<
  TradeOrderDetail["executionSummary"]
>["salesOrders"][number];

/** 收款记录状态 → 销售/主管能看懂的标题. */
export function getPaymentRecordStatusSummaryLabel(
  value: "SUBMITTED" | "CONFIRMED" | "REJECTED",
) {
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

/** 催收任务类型 → 中文. */
export function getCollectionTaskTypeSummaryLabel(
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

/** 催收任务状态 → 中文. */
export function getCollectionTaskStatusSummaryLabel(
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

/** OperationLog.action → 时间线 widget 的标题 + tone kind. */
export function mapOperationLogActionToTimelineMeta(action: string): {
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
    default: {
      const tail = action.split(".").pop() ?? action;
      const humanTail = tail.replace(/_/g, " ");
      return { title: humanTail, kind: "review" };
    }
  }
}

/** 发货状态是否已经达到"发货后"阶段. */
export function isShippingCompletedLike(
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

/** 供货商子单的"商品摘要"短句, 用于 SupplierFulfillmentAccordion. */
export function getSalesOrderProductSummary(items: SalesOrderItem["items"]) {
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

/** 父单"去发货执行"链接的 stageView 推导. */
export function getTradeOrderShippingStage(
  summary: TradeOrderDetail["executionSummary"],
): FulfillmentShippingStageView | undefined {
  if (!summary) return undefined;
  if (summary.exceptionSubOrderCount > 0) return "EXCEPTION";
  if (summary.pendingTrackingSubOrderCount > 0) return "PENDING_TRACKING";
  if (summary.pendingReportSubOrderCount > 0) return "PENDING_REPORT";
  if (summary.shippedSubOrderCount > 0) return "SHIPPED";
  return undefined;
}

/** 子单"去发货执行"链接的 stageView 推导. */
export function getSalesOrderShippingStage(
  executionSummary: SalesOrderExecutionItem | undefined,
): FulfillmentShippingStageView | undefined {
  if (!executionSummary) return undefined;
  if (executionSummary.hasException) return "EXCEPTION";
  if (executionSummary.reportStatus !== "REPORTED" && !executionSummary.hasTrackingNumber) {
    return "PENDING_REPORT";
  }
  if (executionSummary.reportStatus === "REPORTED" && !executionSummary.hasTrackingNumber) {
    return "PENDING_TRACKING";
  }
  if (
    executionSummary.shippingStatus &&
    isShippingCompletedLike(executionSummary.shippingStatus)
  ) {
    return "SHIPPED";
  }
  return undefined;
}

/** 父单主流程当前阶段, 喂给 OrderProgressTrack. */
export function resolveOrderProgressPhase(
  order: TradeOrderDetail,
  summary: TradeOrderDetail["executionSummary"],
): OrderProgressPhase {
  if (order.tradeStatus === "CANCELED") return "CANCELED";
  if (order.tradeStatus === "REVISION_PENDING") return "REVISION_PENDING";
  if (order.tradeStatus === "DRAFT") return "DRAFT";
  if (order.tradeStatus === "PENDING_REVIEW") return "PENDING_REVIEW";
  if (order.tradeStatus === "REJECTED") return "PENDING_REVIEW";
  if (!summary || summary.totalSubOrderCount === 0) return "APPROVED";
  if (summary.allShipped && Number(order.remainingAmount) <= 0) return "COMPLETED";
  if (summary.allShipped) return "COLLECTED";
  if (summary.shippedSubOrderCount > 0) return "SHIPPED";
  if (summary.reportedSubOrderCount > 0) return "REPORTED";
  return "APPROVED";
}

/**
 * 把收款 + 催收归集成最近优先的 PaymentSnapshotRecord 列表 (前 2 条会显示在卡片内).
 */
export function buildPaymentSnapshotRecords(
  order: TradeOrderDetail,
): PaymentSnapshotRecord[] {
  type Seed = { record: PaymentSnapshotRecord; occurredAt: Date };
  const seeds: Seed[] = [
    ...order.paymentRecords.map((record) => ({
      occurredAt: record.occurredAt,
      record: {
        id: `payment-${record.id}`,
        label: getPaymentRecordStatusSummaryLabel(record.status),
        amount: formatCurrency(record.amount),
        occurredAt: formatDateTime(record.occurredAt),
        tone:
          record.status === "CONFIRMED"
            ? ("success" as const)
            : record.status === "REJECTED"
              ? ("danger" as const)
              : ("info" as const),
      } satisfies PaymentSnapshotRecord,
    })),
    ...order.collectionTasks.map((task) => ({
      occurredAt: task.createdAt,
      record: {
        id: `collection-${task.id}`,
        label: `${getCollectionTaskTypeSummaryLabel(task.taskType)} · ${getCollectionTaskStatusSummaryLabel(task.status)}`,
        amount: null,
        occurredAt: formatDateTime(task.createdAt),
        tone:
          task.status === "PENDING" || task.status === "IN_PROGRESS"
            ? ("warning" as const)
            : ("neutral" as const),
      } satisfies PaymentSnapshotRecord,
    })),
  ].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  return seeds.map((seed) => seed.record);
}

/**
 * 合并 OperationLog + shipping task + payment + collection 4 来源 → OrderTimeline events.
 * OrderTimeline 内部会按 occurredAt 倒序自排, 此处仅负责标准化字段.
 */
export function buildTimelineEvents(
  order: TradeOrderDetail,
  operationLogs: OperationLogItem[],
): OrderTimelineEvent[] {
  return [
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
      (paymentRecord): OrderTimelineEvent => ({
        id: `payment-${paymentRecord.id}`,
        kind: "pay",
        occurredAt: paymentRecord.occurredAt,
        title: getPaymentRecordStatusSummaryLabel(paymentRecord.status),
        detail: `${paymentRecord.salesOrder?.subOrderNo || paymentRecord.salesOrder?.orderNo || "未绑定子单"} · ${formatCurrency(paymentRecord.amount)}`,
        href: buildTradeOrderPaymentHref(order.tradeNo),
      }),
    ),
    ...order.collectionTasks.map(
      (collectionTask): OrderTimelineEvent => ({
        id: `collection-${collectionTask.id}`,
        kind: "collection",
        occurredAt: collectionTask.createdAt,
        title: getCollectionTaskTypeSummaryLabel(collectionTask.taskType),
        detail: `${collectionTask.salesOrder?.subOrderNo || collectionTask.salesOrder?.orderNo || "未绑定子单"} · ${getCollectionTaskStatusSummaryLabel(collectionTask.status)}`,
        href: buildTradeOrderCollectionHref(order.tradeNo, { statusView: "OPEN" }),
      }),
    ),
  ];
}

/**
 * 把 salesOrders + executionSummary normalize 成 SupplierFulfillmentAccordion 友好的
 * 字符串/链接形, 让该组件只做渲染.
 */
export function buildSupplierAccordionItems(
  order: TradeOrderDetail,
): SupplierFulfillmentItem[] {
  const executionMap = new Map(
    order.executionSummary?.salesOrders.map((salesOrder) => [salesOrder.id, salesOrder]) ?? [],
  );
  return order.salesOrders.map((salesOrder) => {
    const execution = executionMap.get(salesOrder.id);
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
  });
}

/** 物流卡片顶部副标题 (例 "已发货 1/2 · 待报单 1 · 异常 0"). */
export function buildFulfillmentSummaryLine(
  summary: TradeOrderDetail["executionSummary"],
): string | null {
  if (!summary || summary.totalSubOrderCount === 0) {
    return null;
  }
  const parts: string[] = [];
  parts.push(`已发货 ${summary.shippedSubOrderCount}/${summary.totalSubOrderCount}`);
  if (summary.pendingReportSubOrderCount > 0) {
    parts.push(`待报单 ${summary.pendingReportSubOrderCount}`);
  }
  if (summary.pendingTrackingSubOrderCount > 0) {
    parts.push(`待物流 ${summary.pendingTrackingSubOrderCount}`);
  }
  if (summary.exceptionSubOrderCount > 0) {
    parts.push(`异常 ${summary.exceptionSubOrderCount}`);
  }
  return parts.join(" · ");
}

/** 父单进度节点真实时间戳归集 (从 salesOrders.shippingTask 收集最早). */
export function resolveOrderProgressTimestamps(
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
