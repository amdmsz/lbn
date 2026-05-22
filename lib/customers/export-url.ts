export type CustomersExportHrefFilters = {
  queue: string;
  executionClasses: string[];
  teamId: string;
  search: string;
  productKeys: string[];
  salesId: string;
  tagIds: string[];
  assignedFrom: string;
  assignedTo: string;
  productKeyword: string;
};

export function buildCustomersExportHref(filters: CustomersExportHrefFilters) {
  const params = new URLSearchParams();

  if (filters.queue && filters.queue !== "all") {
    params.set("queue", filters.queue);
  }

  filters.executionClasses.forEach((value) => params.append("executionClasses", value));

  if (filters.teamId) {
    params.set("teamId", filters.teamId);
  }

  if (filters.search) {
    params.set("search", filters.search);
  }

  filters.productKeys.forEach((value) => params.append("productKeys", value));

  if (filters.salesId) {
    params.set("salesId", filters.salesId);
  }

  filters.tagIds.forEach((value) => params.append("tagIds", value));

  if (filters.assignedFrom) {
    params.set("assignedFrom", filters.assignedFrom);
  }

  if (filters.assignedTo) {
    params.set("assignedTo", filters.assignedTo);
  }

  if (filters.productKeyword) {
    params.set("productKeyword", filters.productKeyword);
  }

  const query = params.toString();
  return query ? `/customers/export?${query}` : "/customers/export";
}
