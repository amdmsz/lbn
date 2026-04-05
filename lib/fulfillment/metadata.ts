import type {
  CodCollectionStatus,
  GiftQualificationSource,
  GiftReviewStatus,
  LogisticsFollowUpTaskStatus,
  OrderType,
  PaymentStatus,
  SalesOrderPaymentMode,
  SalesOrderPaymentScheme,
  SalesOrderReviewStatus,
  ShippingFulfillmentStatus,
  ShippingReportStatus,
  ShippingStatus,
  ShippingTaskStatus,
} from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";

export const ORDERS_PAGE_SIZE = 10;
export const GIFTS_PAGE_SIZE = 10;
export const SHIPPING_PAGE_SIZE = 10;

const orderTypeMeta: Record<OrderType, { label: string }> = {
  NORMAL_ORDER: { label: "普通订单" },
  GIFT_FREIGHT_ORDER: { label: "礼品运费单" },
};

const paymentStatusMeta: Record<
  PaymentStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待支付", variant: "warning" },
  PAID: { label: "已支付", variant: "success" },
  FAILED: { label: "支付失败", variant: "danger" },
  REFUNDED: { label: "已退款", variant: "neutral" },
};

const shippingStatusMeta: Record<
  ShippingStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待处理", variant: "warning" },
  READY: { label: "待发货", variant: "info" },
  SHIPPED: { label: "已发货", variant: "success" },
  SIGNED: { label: "已签收", variant: "success" },
  FINISHED: { label: "已完成", variant: "success" },
  CANCELED: { label: "已取消", variant: "neutral" },
};

const giftQualificationSourceMeta: Record<
  GiftQualificationSource,
  { label: string }
> = {
  LIVE_SESSION: { label: "直播达标" },
  SALES_CAMPAIGN: { label: "销售活动" },
  MANUAL_APPROVAL: { label: "人工审批" },
  OTHER: { label: "其他" },
};

const giftReviewStatusMeta: Record<
  GiftReviewStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING_REVIEW: { label: "待审核", variant: "warning" },
  APPROVED: { label: "已通过", variant: "success" },
  REJECTED: { label: "已拒绝", variant: "danger" },
};

const shippingTaskStatusMeta: Record<
  ShippingTaskStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待处理", variant: "warning" },
  PROCESSING: { label: "处理中", variant: "info" },
  SHIPPED: { label: "已发货", variant: "success" },
  COMPLETED: { label: "已完成", variant: "success" },
  CANCELED: { label: "已取消", variant: "neutral" },
};

const salesOrderReviewStatusMeta: Record<
  SalesOrderReviewStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING_REVIEW: { label: "待审核", variant: "warning" },
  APPROVED: { label: "已通过", variant: "success" },
  REJECTED: { label: "已拒绝", variant: "danger" },
};

const salesOrderPaymentModeMeta: Record<
  SalesOrderPaymentMode,
  { label: string; variant: StatusBadgeVariant }
> = {
  DEPOSIT: { label: "定金", variant: "warning" },
  FULL_PAYMENT: { label: "全款", variant: "success" },
  COD: { label: "代收", variant: "info" },
};

const salesOrderPaymentSchemeMeta: Record<
  SalesOrderPaymentScheme,
  { label: string; variant: StatusBadgeVariant; description: string }
> = {
  FULL_PREPAID: {
    label: "全款预付",
    variant: "success",
    description: "成交金额全部由销售侧先收款。",
  },
  DEPOSIT_PLUS_BALANCE: {
    label: "定金 + 尾款",
    variant: "warning",
    description: "先收定金，剩余金额后续由销售继续跟进收款。",
  },
  FULL_COD: {
    label: "全额代收",
    variant: "info",
    description: "未提前收款，全部金额走货到付款。",
  },
  DEPOSIT_PLUS_COD: {
    label: "定金 + 代收",
    variant: "warning",
    description: "先收定金，剩余金额走货到付款。",
  },
};

const shippingReportStatusMeta: Record<
  ShippingReportStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待报单", variant: "warning" },
  REPORTED: { label: "已报单", variant: "info" },
};

const shippingFulfillmentStatusMeta: Record<
  ShippingFulfillmentStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "未进发货池", variant: "neutral" },
  READY_TO_SHIP: { label: "待发货", variant: "warning" },
  SHIPPED: { label: "已发货", variant: "success" },
  DELIVERED: { label: "已签收", variant: "success" },
  COMPLETED: { label: "已完成", variant: "success" },
  CANCELED: { label: "已取消", variant: "neutral" },
};

const logisticsFollowUpTaskStatusMeta: Record<
  LogisticsFollowUpTaskStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待跟进", variant: "warning" },
  IN_PROGRESS: { label: "跟进中", variant: "info" },
  DONE: { label: "已完成", variant: "success" },
  CANCELED: { label: "已关闭", variant: "neutral" },
};

const codCollectionStatusMeta: Record<
  CodCollectionStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING_COLLECTION: { label: "待回款", variant: "warning" },
  COLLECTED: { label: "已回款", variant: "success" },
  EXCEPTION: { label: "异常", variant: "danger" },
  REJECTED: { label: "拒收", variant: "danger" },
  UNCOLLECTED: { label: "未回款", variant: "warning" },
};

export const orderTypeOptions = Object.entries(orderTypeMeta).map(
  ([value, meta]) => ({
    value: value as OrderType,
    label: meta.label,
  }),
);

export const paymentStatusOptions = Object.entries(paymentStatusMeta).map(
  ([value, meta]) => ({
    value: value as PaymentStatus,
    label: meta.label,
  }),
);

export const shippingStatusOptions = Object.entries(shippingStatusMeta).map(
  ([value, meta]) => ({
    value: value as ShippingStatus,
    label: meta.label,
  }),
);

export const giftQualificationSourceOptions = Object.entries(
  giftQualificationSourceMeta,
).map(([value, meta]) => ({
  value: value as GiftQualificationSource,
  label: meta.label,
}));

export const giftReviewStatusOptions = Object.entries(giftReviewStatusMeta).map(
  ([value, meta]) => ({
    value: value as GiftReviewStatus,
    label: meta.label,
  }),
);

export const shippingTaskStatusOptions = Object.entries(
  shippingTaskStatusMeta,
).map(([value, meta]) => ({
  value: value as ShippingTaskStatus,
  label: meta.label,
}));

export const salesOrderReviewStatusOptions = Object.entries(
  salesOrderReviewStatusMeta,
).map(([value, meta]) => ({
  value: value as SalesOrderReviewStatus,
  label: meta.label,
}));

export const salesOrderPaymentModeOptions = Object.entries(
  salesOrderPaymentModeMeta,
).map(([value, meta]) => ({
  value: value as SalesOrderPaymentMode,
  label: meta.label,
}));

export const salesOrderPaymentSchemeOptions = Object.entries(
  salesOrderPaymentSchemeMeta,
).map(([value, meta]) => ({
  value: value as SalesOrderPaymentScheme,
  label: meta.label,
  description: meta.description,
}));

export const shippingReportStatusOptions = Object.entries(
  shippingReportStatusMeta,
).map(([value, meta]) => ({
  value: value as ShippingReportStatus,
  label: meta.label,
}));

export const shippingFulfillmentStatusOptions = Object.entries(
  shippingFulfillmentStatusMeta,
).map(([value, meta]) => ({
  value: value as ShippingFulfillmentStatus,
  label: meta.label,
}));

export const logisticsFollowUpTaskStatusOptions = Object.entries(
  logisticsFollowUpTaskStatusMeta,
).map(([value, meta]) => ({
  value: value as LogisticsFollowUpTaskStatus,
  label: meta.label,
}));

export const codCollectionStatusOptions = Object.entries(codCollectionStatusMeta).map(
  ([value, meta]) => ({
    value: value as CodCollectionStatus,
    label: meta.label,
  }),
);

export function getOrderTypeLabel(value: OrderType) {
  return orderTypeMeta[value].label;
}

export function getPaymentStatusLabel(value: PaymentStatus) {
  return paymentStatusMeta[value].label;
}

export function getPaymentStatusVariant(value: PaymentStatus) {
  return paymentStatusMeta[value].variant;
}

export function getShippingStatusLabel(value: ShippingStatus) {
  return shippingStatusMeta[value].label;
}

export function getShippingStatusVariant(value: ShippingStatus) {
  return shippingStatusMeta[value].variant;
}

export function getGiftQualificationSourceLabel(value: GiftQualificationSource) {
  return giftQualificationSourceMeta[value].label;
}

export function getGiftReviewStatusLabel(value: GiftReviewStatus) {
  return giftReviewStatusMeta[value].label;
}

export function getGiftReviewStatusVariant(value: GiftReviewStatus) {
  return giftReviewStatusMeta[value].variant;
}

export function getShippingTaskStatusLabel(value: ShippingTaskStatus) {
  return shippingTaskStatusMeta[value].label;
}

export function getShippingTaskStatusVariant(value: ShippingTaskStatus) {
  return shippingTaskStatusMeta[value].variant;
}

export function getSalesOrderReviewStatusLabel(value: SalesOrderReviewStatus) {
  return salesOrderReviewStatusMeta[value].label;
}

export function getSalesOrderReviewStatusVariant(value: SalesOrderReviewStatus) {
  return salesOrderReviewStatusMeta[value].variant;
}

export function getSalesOrderPaymentModeLabel(value: SalesOrderPaymentMode) {
  return salesOrderPaymentModeMeta[value].label;
}

export function getSalesOrderPaymentModeVariant(value: SalesOrderPaymentMode) {
  return salesOrderPaymentModeMeta[value].variant;
}

export function getSalesOrderPaymentSchemeLabel(value: SalesOrderPaymentScheme) {
  return salesOrderPaymentSchemeMeta[value].label;
}

export function getSalesOrderPaymentSchemeVariant(value: SalesOrderPaymentScheme) {
  return salesOrderPaymentSchemeMeta[value].variant;
}

export function getSalesOrderPaymentSchemeDescription(
  value: SalesOrderPaymentScheme,
) {
  return salesOrderPaymentSchemeMeta[value].description;
}

export function getShippingReportStatusLabel(value: ShippingReportStatus) {
  return shippingReportStatusMeta[value].label;
}

export function getShippingReportStatusVariant(value: ShippingReportStatus) {
  return shippingReportStatusMeta[value].variant;
}

export function getShippingFulfillmentStatusLabel(value: ShippingFulfillmentStatus) {
  return shippingFulfillmentStatusMeta[value].label;
}

export function getShippingFulfillmentStatusVariant(
  value: ShippingFulfillmentStatus,
) {
  return shippingFulfillmentStatusMeta[value].variant;
}

export function getLogisticsFollowUpTaskStatusLabel(value: LogisticsFollowUpTaskStatus) {
  return logisticsFollowUpTaskStatusMeta[value].label;
}

export function getLogisticsFollowUpTaskStatusVariant(value: LogisticsFollowUpTaskStatus) {
  return logisticsFollowUpTaskStatusMeta[value].variant;
}

export function getCodCollectionStatusLabel(value: CodCollectionStatus) {
  return codCollectionStatusMeta[value].label;
}

export function getCodCollectionStatusVariant(value: CodCollectionStatus) {
  return codCollectionStatusMeta[value].variant;
}

export function formatCurrency(value: { toString(): string } | number | string) {
  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return "¥0.00";
  }

  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function buildReceiverInfo(
  receiverName: string,
  receiverPhone: string,
  receiverAddress: string,
) {
  return [receiverName.trim(), receiverPhone.trim(), receiverAddress.trim()]
    .filter(Boolean)
    .join(" / ");
}

export function mapShippingTaskStatusToShippingStatus(status: ShippingTaskStatus) {
  switch (status) {
    case "PENDING":
    case "PROCESSING":
      return "READY";
    case "SHIPPED":
      return "SHIPPED";
    case "COMPLETED":
      return "FINISHED";
    case "CANCELED":
      return "CANCELED";
    default:
      return "PENDING";
  }
}

export function mapShippingStatusToShippingTaskStatus(status: ShippingStatus) {
  switch (status) {
    case "PENDING":
      return "PENDING";
    case "READY":
      return "PROCESSING";
    case "SHIPPED":
      return "SHIPPED";
    case "SIGNED":
    case "FINISHED":
      return "COMPLETED";
    case "CANCELED":
      return "CANCELED";
    default:
      return "PENDING";
  }
}

export function getFulfillmentSummary(
  trackingNumber: string | null | undefined,
  shippedAt: Date | null | undefined,
) {
  if (trackingNumber?.trim()) {
    return trackingNumber.trim();
  }

  if (shippedAt) {
    return "已登记发货";
  }

  return "未登记物流";
}
