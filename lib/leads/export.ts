import type {
  LeadListFilters,
  LeadUnassignedExportItem,
} from "@/lib/leads/queries";
import {
  LEADS_PAGE_SIZE,
  formatDateTime,
  getLeadSourceLabel,
  getLeadStatusLabel,
} from "@/lib/leads/metadata";

function escapeCsvValue(value: string) {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function toCsvLine(values: Array<string | null | undefined>) {
  return values.map((value) => escapeCsvValue(value ?? "")).join(",");
}

function buildRegion(item: LeadUnassignedExportItem) {
  return [item.province, item.city, item.district]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" / ");
}

function buildTagSummary(item: LeadUnassignedExportItem) {
  return item.leadTags.map((record) => record.tag.name).join("；");
}

export function buildLeadUnassignedExportHref(filters: LeadListFilters) {
  const params = new URLSearchParams();

  if (filters.name) {
    params.set("name", filters.name);
  }

  if (filters.phone) {
    params.set("phone", filters.phone);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.tagId) {
    params.set("tagId", filters.tagId);
  }

  if (filters.quick) {
    params.set("quick", filters.quick);
  }

  if (filters.importBatchId) {
    params.set("importBatchId", filters.importBatchId);
  }

  if (filters.createdFrom) {
    params.set("createdFrom", filters.createdFrom);
  }

  if (filters.createdTo) {
    params.set("createdTo", filters.createdTo);
  }

  if (filters.pageSize !== LEADS_PAGE_SIZE) {
    params.set("pageSize", String(filters.pageSize));
  }

  const query = params.toString();
  return query ? `/leads/export?${query}` : "/leads/export";
}

export function buildLeadUnassignedExportFileName() {
  const datePart = new Date().toISOString().slice(0, 10);
  return `unassigned-leads-${datePart}.csv`;
}

export function buildLeadUnassignedExportCsv(items: LeadUnassignedExportItem[]) {
  const header = [
    "线索ID",
    "姓名",
    "手机号",
    "来源",
    "来源详情",
    "活动/批次",
    "意向商品",
    "是否首购",
    "状态",
    "地区",
    "详细地址",
    "标签",
    "备注",
    "创建时间",
    "更新时间",
  ];
  const rows = items.map((item) =>
    toCsvLine([
      item.id,
      item.name?.trim() || "",
      item.phone,
      getLeadSourceLabel(item.source),
      item.sourceDetail?.trim() || "",
      item.campaignName?.trim() || "",
      item.interestedProduct?.trim() || "",
      item.isFirstPurchase ? "是" : "否",
      getLeadStatusLabel(item.status),
      buildRegion(item),
      item.address?.trim() || "",
      buildTagSummary(item),
      item.remark?.trim() || "",
      formatDateTime(item.createdAt),
      formatDateTime(item.updatedAt),
    ]),
  );

  return `\uFEFF${toCsvLine(header)}\n${rows.join("\n")}\n`;
}
