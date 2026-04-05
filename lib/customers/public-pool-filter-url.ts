import { CUSTOMERS_PAGE_SIZE } from "@/lib/customers/metadata";

export type CustomerPublicPoolFilterShape = {
  view: "pool" | "recycle" | "records";
  segment: "all" | "claimable" | "locked" | "today_new" | "expiring_soon";
  search: string;
  reason: string;
  teamId: string;
  hasOrders: "all" | "yes" | "no";
  page: number;
  pageSize: number;
};

export type CustomerDetailNavigationContext = {
  from?: "public-pool";
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
  if (!context?.from || !context.returnTo) {
    return href;
  }

  const [pathname, rawQuery = ""] = href.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set("from", context.from);
  params.set("returnTo", context.returnTo);

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
