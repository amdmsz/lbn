import type { LeadSource, LeadStatus } from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";

export const LEADS_PAGE_SIZE = 10;
export const LEADS_PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100] as const;
export const MAX_BATCH_ASSIGNMENT_SIZE = 1000;
export const UNASSIGNED_OWNER_VALUE = "__UNASSIGNED__";

export const leadStatusMeta: Record<
  LeadStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  NEW: { label: "新线索", variant: "info" },
  ASSIGNED: { label: "已分配", variant: "warning" },
  FIRST_CALL_PENDING: { label: "待首呼", variant: "warning" },
  FOLLOWING: { label: "跟进中", variant: "info" },
  WECHAT_ADDED: { label: "已加微信", variant: "success" },
  LIVE_INVITED: { label: "已邀约直播", variant: "info" },
  LIVE_WATCHED: { label: "已观看直播", variant: "success" },
  ORDERED: { label: "已下单", variant: "success" },
  CONVERTED: { label: "已转化", variant: "success" },
  CLOSED_LOST: { label: "关闭流失", variant: "danger" },
  INVALID: { label: "无效线索", variant: "neutral" },
};

export const leadSourceMeta: Record<LeadSource, { label: string }> = {
  INFO_FLOW: { label: "信息流" },
};

export const leadStatusOptions = Object.entries(leadStatusMeta).map(
  ([value, meta]) => ({
    value: value as LeadStatus,
    label: meta.label,
  }),
);

export const leadSourceOptions = Object.entries(leadSourceMeta).map(
  ([value, meta]) => ({
    value: value as LeadSource,
    label: meta.label,
  }),
);

export function getLeadStatusLabel(status: LeadStatus) {
  return leadStatusMeta[status].label;
}

export function getLeadStatusVariant(status: LeadStatus) {
  return leadStatusMeta[status].variant;
}

export function getLeadSourceLabel(source: LeadSource) {
  return leadSourceMeta[source].label;
}

export function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
