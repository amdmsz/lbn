import type { FinancePaymentsExportItem, FinancePaymentsFilters } from "@/lib/finance/queries";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  getPaymentRecordChannelLabel,
  getPaymentRecordStatusLabel,
  getPaymentSourceLabel,
} from "@/lib/payments/metadata";

function escapeCsvValue(value: string) {
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvLine(values: Array<string | null | undefined>) {
  return values.map((value) => escapeCsvValue(value ?? "")).join(",");
}

function buildProductSpecSummary(item: FinancePaymentsExportItem) {
  if (item.salesOrder?.items.length) {
    return item.salesOrder.items
      .map((salesOrderItem) => {
        const title =
          salesOrderItem.titleSnapshot?.trim() ||
          salesOrderItem.productNameSnapshot.trim() ||
          salesOrderItem.skuNameSnapshot.trim();
        const spec = salesOrderItem.specSnapshot.trim();
        return `${title}${spec ? ` / ${spec}` : ""} x ${salesOrderItem.qty}`;
      })
      .join("；");
  }

  if (item.giftRecord?.giftName?.trim()) {
    return `礼品运费 / ${item.giftRecord.giftName.trim()}`;
  }

  return getPaymentSourceLabel(item.sourceType);
}

function buildCustomerSummary(item: FinancePaymentsExportItem) {
  if (!item.customer) {
    return "无客户";
  }

  return `${item.customer.name}（${item.customer.phone}）`;
}

function buildPaymentRecordSummary(item: FinancePaymentsExportItem) {
  const parts = [
    `金额 ${formatCurrency(item.amount)}`,
    getPaymentRecordStatusLabel(item.status),
    getPaymentRecordChannelLabel(item.channel),
  ];

  if (item.referenceNo?.trim()) {
    parts.push(`流水号 ${item.referenceNo.trim()}`);
  }

  if (item.salesOrder?.orderNo?.trim()) {
    parts.push(`订单 ${item.salesOrder.orderNo.trim()}`);
  }

  return parts.join(" / ");
}

export function buildFinancePaymentsExportHref(filters: FinancePaymentsFilters) {
  const params = new URLSearchParams();

  if (filters.orderNo) {
    params.set("orderNo", filters.orderNo);
  }

  if (filters.customerKeyword) {
    params.set("customerKeyword", filters.customerKeyword);
  }

  if (filters.salesId) {
    params.set("salesId", filters.salesId);
  }

  if (filters.channel) {
    params.set("channel", filters.channel);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.occurredFrom) {
    params.set("occurredFrom", filters.occurredFrom);
  }

  if (filters.occurredTo) {
    params.set("occurredTo", filters.occurredTo);
  }

  const query = params.toString();
  return query ? `/finance/payments/export?${params.toString()}` : "/finance/payments/export";
}

export function buildFinancePaymentsExportFileName() {
  const datePart = new Date().toISOString().slice(0, 10);
  return `finance-payments-${datePart}.csv`;
}

export function buildFinancePaymentsExportCsv(items: FinancePaymentsExportItem[]) {
  const header = ["产品规格", "客户", "收款记录", "时间", "备注", "运单号"];
  const rows = items.map((item) =>
    toCsvLine([
      buildProductSpecSummary(item),
      buildCustomerSummary(item),
      buildPaymentRecordSummary(item),
      formatDateTime(item.occurredAt),
      item.remark?.trim() ?? "",
      item.shippingTask?.trackingNumber?.trim() ?? "",
    ]),
  );

  return `\uFEFF${toCsvLine(header)}\n${rows.join("\n")}\n`;
}
