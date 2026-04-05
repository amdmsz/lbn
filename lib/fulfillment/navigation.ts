import type { RoleCode } from "@prisma/client";

export const ORDER_FULFILLMENT_CENTER_PATH = "/fulfillment";

export type OrderFulfillmentView = "trade-orders" | "shipping" | "batches";
export type FulfillmentShippingStageView =
  | "PENDING_REPORT"
  | "PENDING_TRACKING"
  | "SHIPPED"
  | "EXCEPTION";

type SearchParamsValue = string | string[] | undefined;

type FulfillmentTradeOrdersParams = {
  keyword?: string;
  customerKeyword?: string;
  statusView?: "" | "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  supplierId?: string;
};

type FulfillmentShippingParams = {
  keyword?: string;
  supplierViewId?: string;
  stageView?: FulfillmentShippingStageView;
  isCod?: "" | "true" | "false";
};

type FulfillmentBatchParams = {
  keyword?: string;
  supplierId?: string;
  fileView?: "" | "READY" | "MISSING_FILE" | "LEGACY";
};

export function getOrderFulfillmentViewsForRole(
  role: RoleCode,
): OrderFulfillmentView[] {
  switch (role) {
    case "ADMIN":
    case "SUPERVISOR":
      return ["trade-orders", "shipping", "batches"];
    case "SALES":
      return ["trade-orders"];
    case "SHIPPER":
      return ["shipping", "batches"];
    default:
      return [];
  }
}

export function canAccessOrderFulfillmentView(
  role: RoleCode,
  view: OrderFulfillmentView,
) {
  return getOrderFulfillmentViewsForRole(role).includes(view);
}

export function getDefaultOrderFulfillmentView(
  role: RoleCode,
): OrderFulfillmentView {
  if (role === "SHIPPER") {
    return "shipping";
  }

  return "trade-orders";
}

export function resolveOrderFulfillmentView(
  role: RoleCode,
  rawView: string | null | undefined,
): OrderFulfillmentView {
  const normalized =
    rawView === "trade-orders" || rawView === "shipping" || rawView === "batches"
      ? rawView
      : null;

  if (normalized && canAccessOrderFulfillmentView(role, normalized)) {
    return normalized;
  }

  return getDefaultOrderFulfillmentView(role);
}

export function buildOrderFulfillmentHref(
  view: OrderFulfillmentView,
  extraParams?: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  params.set("tab", view);

  for (const [key, value] of Object.entries(extraParams ?? {})) {
    if (value === undefined || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  return `${ORDER_FULFILLMENT_CENTER_PATH}?${params.toString()}`;
}

export function buildOrderFulfillmentHrefFromSearchParams(
  view: OrderFulfillmentView,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  const params = new URLSearchParams();
  params.set("tab", view);

  for (const [key, value] of Object.entries(rawSearchParams ?? {})) {
    if (key === "tab") {
      continue;
    }

    const normalized = Array.isArray(value) ? value[0] : value;

    if (!normalized) {
      continue;
    }

    params.set(key, normalized);
  }

  return `${ORDER_FULFILLMENT_CENTER_PATH}?${params.toString()}`;
}

export function getOrderFulfillmentViewLabel(view: OrderFulfillmentView) {
  switch (view) {
    case "trade-orders":
      return "交易单";
    case "shipping":
      return "发货执行";
    case "batches":
      return "批次记录";
    default:
      return view;
  }
}

export function buildFulfillmentTradeOrdersHref(
  params: FulfillmentTradeOrdersParams = {},
) {
  return buildOrderFulfillmentHref("trade-orders", params);
}

export function buildFulfillmentShippingHref(
  params: FulfillmentShippingParams = {},
) {
  return buildOrderFulfillmentHref("shipping", params);
}

export function buildFulfillmentBatchesHref(
  params: FulfillmentBatchParams = {},
) {
  return buildOrderFulfillmentHref("batches", params);
}
