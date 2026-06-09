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

  // queue 是 sidebar 队列选择 (pending_first_call / pending_wechat / ...).
  // 默认 "all" 不写 URL; 其他值必须落进 query, 否则翻页 / 改 pageSize / filter-toolbar
  // 重建 URL 时会丢掉 queue 选择 (parse 侧会 fallback "all").
  if (next.queue && next.queue !== "all") {
    params.set("queue", next.queue);
  }

  if (next.search) {
    params.set("search", next.search);
  }

  if (next.productKeyword) {
    params.set("productKeyword", next.productKeyword);
  }

  appendArrayParams(params, "productKeys", next.productKeys);
  appendArrayParams(params, "tagIds", next.tagIds);
  appendArrayParams(params, "executionClasses", next.executionClasses);
  // Wave 7-B: 客户分级 multi-select.
  appendArrayParams(params, "grades", next.grades);

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
