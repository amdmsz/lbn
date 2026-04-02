import {
  CollectionTaskStatus,
  CollectionTaskType,
  PaymentCollectionChannel,
  PaymentPlanStageType,
  PaymentPlanStatus,
  PaymentPlanSubjectType,
  PaymentRecordChannel,
  PaymentRecordStatus,
  PaymentSourceType,
} from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/fulfillment/metadata";

const paymentSourceLabels: Record<PaymentSourceType, string> = {
  SALES_ORDER: "销售订单",
  GIFT_RECORD: "礼品运费",
};

const paymentPlanSubjectMeta: Record<
  PaymentPlanSubjectType,
  { label: string; variant: StatusBadgeVariant }
> = {
  GOODS: { label: "货款", variant: "info" },
  FREIGHT: { label: "运费", variant: "warning" },
};

const paymentPlanStageMeta: Record<
  PaymentPlanStageType,
  { label: string; variant: StatusBadgeVariant }
> = {
  FULL: { label: "全额", variant: "neutral" },
  DEPOSIT: { label: "定金", variant: "warning" },
  BALANCE: { label: "尾款", variant: "info" },
};

const paymentCollectionChannelMeta: Record<
  PaymentCollectionChannel,
  { label: string; variant: StatusBadgeVariant }
> = {
  PREPAID: { label: "预付", variant: "success" },
  COD: { label: "代收", variant: "info" },
};

const paymentPlanStatusMeta: Record<
  PaymentPlanStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待收款", variant: "warning" },
  SUBMITTED: { label: "待确认", variant: "info" },
  PARTIALLY_COLLECTED: { label: "部分确认", variant: "warning" },
  COLLECTED: { label: "已收清", variant: "success" },
  CANCELED: { label: "已取消", variant: "neutral" },
};

const paymentRecordStatusMeta: Record<
  PaymentRecordStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  SUBMITTED: { label: "待确认", variant: "warning" },
  CONFIRMED: { label: "已确认", variant: "success" },
  REJECTED: { label: "已驳回", variant: "danger" },
};

const paymentRecordChannelMeta: Record<PaymentRecordChannel, { label: string }> = {
  ORDER_FORM_DECLARED: { label: "订单录入已收" },
  BANK_TRANSFER: { label: "银行转账" },
  WECHAT_TRANSFER: { label: "微信转账" },
  ALIPAY_TRANSFER: { label: "支付宝转账" },
  COD: { label: "货到付款" },
  CASH: { label: "现金" },
  OTHER: { label: "其他" },
};

const collectionTaskTypeMeta: Record<
  CollectionTaskType,
  { label: string; variant: StatusBadgeVariant }
> = {
  BALANCE_COLLECTION: { label: "尾款催收", variant: "warning" },
  COD_COLLECTION: { label: "代收跟进", variant: "info" },
  FREIGHT_COLLECTION: { label: "运费催收", variant: "warning" },
  GENERAL_COLLECTION: { label: "通用收款跟进", variant: "neutral" },
};

const collectionTaskStatusMeta: Record<
  CollectionTaskStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待处理", variant: "warning" },
  IN_PROGRESS: { label: "跟进中", variant: "info" },
  COMPLETED: { label: "已完成", variant: "success" },
  CANCELED: { label: "已取消", variant: "neutral" },
};

export const paymentSourceOptions = Object.entries(paymentSourceLabels).map(([value, label]) => ({
  value: value as PaymentSourceType,
  label,
}));

export const paymentRecordChannelOptions = Object.entries(paymentRecordChannelMeta).map(
  ([value, meta]) => ({
    value: value as PaymentRecordChannel,
    label: meta.label,
  }),
);

export const paymentRecordStatusOptions = Object.entries(paymentRecordStatusMeta).map(
  ([value, meta]) => ({
    value: value as PaymentRecordStatus,
    label: meta.label,
  }),
);

export const collectionTaskStatusOptions = Object.entries(collectionTaskStatusMeta).map(
  ([value, meta]) => ({
    value: value as CollectionTaskStatus,
    label: meta.label,
  }),
);

export const collectionTaskTypeOptions = Object.entries(collectionTaskTypeMeta).map(
  ([value, meta]) => ({
    value: value as CollectionTaskType,
    label: meta.label,
  }),
);

export function getPaymentSourceLabel(value: PaymentSourceType) {
  return paymentSourceLabels[value];
}

export function getPaymentPlanSubjectLabel(value: PaymentPlanSubjectType) {
  return paymentPlanSubjectMeta[value].label;
}

export function getPaymentPlanSubjectVariant(value: PaymentPlanSubjectType) {
  return paymentPlanSubjectMeta[value].variant;
}

export function getPaymentPlanStageLabel(value: PaymentPlanStageType) {
  return paymentPlanStageMeta[value].label;
}

export function getPaymentPlanStageVariant(value: PaymentPlanStageType) {
  return paymentPlanStageMeta[value].variant;
}

export function getPaymentCollectionChannelLabel(value: PaymentCollectionChannel) {
  return paymentCollectionChannelMeta[value].label;
}

export function getPaymentCollectionChannelVariant(value: PaymentCollectionChannel) {
  return paymentCollectionChannelMeta[value].variant;
}

export function getPaymentPlanStatusLabel(value: PaymentPlanStatus) {
  return paymentPlanStatusMeta[value].label;
}

export function getPaymentPlanStatusVariant(value: PaymentPlanStatus) {
  return paymentPlanStatusMeta[value].variant;
}

export function getPaymentRecordStatusLabel(value: PaymentRecordStatus) {
  return paymentRecordStatusMeta[value].label;
}

export function getPaymentRecordStatusVariant(value: PaymentRecordStatus) {
  return paymentRecordStatusMeta[value].variant;
}

export function getPaymentRecordChannelLabel(value: PaymentRecordChannel) {
  return paymentRecordChannelMeta[value].label;
}

export function getCollectionTaskTypeLabel(value: CollectionTaskType) {
  return collectionTaskTypeMeta[value].label;
}

export function getCollectionTaskTypeVariant(value: CollectionTaskType) {
  return collectionTaskTypeMeta[value].variant;
}

export function getCollectionTaskStatusLabel(value: CollectionTaskStatus) {
  return collectionTaskStatusMeta[value].label;
}

export function getCollectionTaskStatusVariant(value: CollectionTaskStatus) {
  return collectionTaskStatusMeta[value].variant;
}

export function getPaymentPlanProgressSummary(input: {
  plannedAmount: string;
  submittedAmount: string;
  confirmedAmount: string;
  remainingAmount: string;
}) {
  return `计划 ${formatCurrency(input.plannedAmount)} / 已录入 ${formatCurrency(
    input.submittedAmount,
  )} / 已确认 ${formatCurrency(input.confirmedAmount)} / 待收 ${formatCurrency(
    input.remainingAmount,
  )}`;
}
