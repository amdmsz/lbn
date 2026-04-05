type ShippingLinkOptions = {
  reportStatus?: "" | "PENDING" | "REPORTED";
  shippingStatus?: "" | "PENDING" | "READY_TO_SHIP" | "SHIPPED" | "DELIVERED" | "COMPLETED" | "CANCELED";
  shippingStage?: "" | "SHIPPED_PLUS";
  hasTrackingNumber?: "" | "true" | "false";
};

type PaymentLinkOptions = {
  status?: "" | "SUBMITTED" | "CONFIRMED" | "REJECTED";
  sourceType?: "" | "SALES_ORDER" | "GIFT_RECORD";
};

type CollectionLinkOptions = {
  status?: "" | "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  statusView?: "" | "OPEN";
};

export function buildTradeOrderShippingHref(
  tradeNo: string,
  options: ShippingLinkOptions = {},
) {
  const params = new URLSearchParams();

  if (tradeNo) {
    params.set("keyword", tradeNo);
  }

  if (options.reportStatus) {
    params.set("reportStatus", options.reportStatus);
  }

  if (options.shippingStatus) {
    params.set("shippingStatus", options.shippingStatus);
  }

  if (options.shippingStage) {
    params.set("shippingStage", options.shippingStage);
  }

  if (options.hasTrackingNumber) {
    params.set("hasTrackingNumber", options.hasTrackingNumber);
  }

  const query = params.toString();
  return query ? `/shipping?${query}` : "/shipping";
}

export function buildTradeOrderPaymentHref(
  tradeNo: string,
  options: PaymentLinkOptions = {},
) {
  const params = new URLSearchParams();

  if (tradeNo) {
    params.set("keyword", tradeNo);
  }

  if (options.status) {
    params.set("status", options.status);
  }

  if (options.sourceType) {
    params.set("sourceType", options.sourceType);
  }

  const query = params.toString();
  return query ? `/payment-records?${query}` : "/payment-records";
}

export function buildTradeOrderCollectionHref(
  tradeNo: string,
  options: CollectionLinkOptions = {},
) {
  const params = new URLSearchParams();

  if (tradeNo) {
    params.set("keyword", tradeNo);
  }

  if (options.status) {
    params.set("status", options.status);
  }

  if (options.statusView) {
    params.set("statusView", options.statusView);
  }

  const query = params.toString();
  return query ? `/collection-tasks?${query}` : "/collection-tasks";
}
