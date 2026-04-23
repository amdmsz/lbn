import { CUSTOMERS_PAGE_SIZE } from "@/lib/customers/metadata";
import type { CustomerCenterFilters } from "@/lib/customers/queries";

function appendArrayParams(params: URLSearchParams, key: string, values: string[]) {
  values.forEach((value) => params.append(key, value));
}

export function buildCustomersHref(
  filters: CustomerCenterFilters,
  overrides: Partial<CustomerCenterFilters> = {},
  pathname = "/customers",
) {
  const next: CustomerCenterFilters = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.search) {
    params.set("search", next.search);
  }

  if (next.productKeyword) {
    params.set("productKeyword", next.productKeyword);
  }

  appendArrayParams(params, "productKeys", next.productKeys);
  appendArrayParams(params, "tagIds", next.tagIds);
  appendArrayParams(params, "executionClasses", next.executionClasses);

  if (next.assignedFrom) {
    params.set("assignedFrom", next.assignedFrom);
  }

  if (next.assignedTo) {
    params.set("assignedTo", next.assignedTo);
  }

  if (next.teamId) {
    params.set("teamId", next.teamId);
  }

  if (next.salesId) {
    params.set("salesId", next.salesId);
  }

  if (next.pageSize !== CUSTOMERS_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
