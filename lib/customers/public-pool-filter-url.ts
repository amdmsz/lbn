import { CUSTOMERS_PAGE_SIZE } from "@/lib/customers/metadata";

export type CustomerPublicPoolFilterShape = {
  view: "pool" | "recycle" | "records";
  segment:
    | "all"
    | "claimable"
    | "locked"
    | "today_new"
    | "expiring_soon"
    | "unreachable";
  search: string;
  reason: string;
  teamId: string;
  hasOrders: "all" | "yes" | "no";
  // 回收工作台·未接通回流筛选 (拨打关系以选定业务员为参照)
  ownerId: string;
  calledRange: "any" | "never" | "within1d" | "within7d" | "within30d";
  callOutcome: "all" | "unreachable";
  // 公海工作台·目标销售拨打关系分桶
  targetSalesId: string;
  dialBucket: "all" | "never" | "within1d" | "within7d" | "within30d";
  page: number;
  pageSize: number;
};

export type CustomerDetailNavigationContext = {
  from?: "public-pool" | "mobile";
  mode?: "mobile" | "popup";
  returnTo?: string | null;
};

export function buildCustomerPublicPoolHref(
  filters: CustomerPublicPoolFilterShape,
  overrides: Partial<CustomerPublicPoolFilterShape> = {},
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.view !== "pool") {
    params.set("view", next.view);
  }

  if (next.segment !== "all") {
    params.set("segment", next.segment);
  }

  if (next.search) {
    params.set("search", next.search);
  }

  if (next.reason) {
    params.set("reason", next.reason);
  }

  if (next.teamId) {
    params.set("teamId", next.teamId);
  }

  if (next.hasOrders !== "all") {
    params.set("hasOrders", next.hasOrders);
  }

  if (next.ownerId) {
    params.set("ownerId", next.ownerId);
  }

  if (next.calledRange !== "any") {
    params.set("calledRange", next.calledRange);
  }

  if (next.callOutcome !== "all") {
    params.set("callOutcome", next.callOutcome);
  }

  if (next.targetSalesId) {
    params.set("targetSalesId", next.targetSalesId);
  }

  if (next.dialBucket !== "all") {
    params.set("dialBucket", next.dialBucket);
  }

  if (next.pageSize !== CUSTOMERS_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/customers/public-pool?${query}` : "/customers/public-pool";
}

export function appendCustomerDetailNavigationContext(
  href: string,
  context?: CustomerDetailNavigationContext | null,
) {
  if (!context) {
    return href;
  }

  const [pathname, rawQuery = ""] = href.split("?");
  const params = new URLSearchParams(rawQuery);

  if (context.mode) {
    params.set("mode", context.mode);
  }

  if (context.from && context.returnTo) {
    params.set("from", context.from);
    params.set("returnTo", context.returnTo);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildCustomerPublicPoolCustomerDetailHref(
  customerId: string,
  filters: CustomerPublicPoolFilterShape,
  overrides: Partial<CustomerPublicPoolFilterShape> = {},
) {
  return appendCustomerDetailNavigationContext(`/customers/${customerId}`, {
    from: "public-pool",
    returnTo: buildCustomerPublicPoolHref(filters, overrides),
  });
}

export function buildCustomerPublicPoolSettingsHref(teamId = "") {
  const params = new URLSearchParams();

  if (teamId) {
    params.set("teamId", teamId);
  }

  const query = params.toString();
  return query
    ? `/customers/public-pool/settings?${query}`
    : "/customers/public-pool/settings";
}

export function buildCustomerPublicPoolReportsHref(options?: {
  teamId?: string;
  windowDays?: 7 | 30;
  lingerDays?: number;
}) {
  const params = new URLSearchParams();

  if (options?.teamId) {
    params.set("teamId", options.teamId);
  }

  if (options?.windowDays && options.windowDays !== 7) {
    params.set("windowDays", String(options.windowDays));
  }

  if (options?.lingerDays && options.lingerDays !== 14) {
    params.set("lingerDays", String(options.lingerDays));
  }

  const query = params.toString();
  return query
    ? `/customers/public-pool/reports?${query}`
    : "/customers/public-pool/reports";
}
