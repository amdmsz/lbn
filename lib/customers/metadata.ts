import type {
  CustomerLevel,
  CustomerStatus,
  LeadSource,
  RoleCode,
} from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";
import { getLeadSourceLabel } from "@/lib/leads/metadata";

export const CUSTOMERS_PAGE_SIZE = 10;
export const customerPageSizeOptions = [10, 20, 30, 50, 100] as const;

export const customerStatusMeta: Record<
  CustomerStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  ACTIVE: { label: "活跃", variant: "success" },
  DORMANT: { label: "沉默", variant: "warning" },
  LOST: { label: "流失", variant: "danger" },
  BLACKLISTED: { label: "黑名单", variant: "neutral" },
};

export const customerLevelMeta: Record<CustomerLevel, { label: string }> = {
  NEW: { label: "新客户" },
  REGULAR: { label: "常规客户" },
  VIP: { label: "VIP" },
};

export const customerQueueOptions = [
  {
    value: "all",
    label: "全部",
    description: "查看当前范围下的全部客户。",
  },
  {
    value: "new_imported",
    label: "新导入",
    description: "当天有新导入线索并已落到当前客户的客户。",
  },
  {
    value: "pending_first_call",
    label: "待首呼",
    description: "已承接但还没有通话记录的客户。",
  },
  {
    value: "pending_follow_up",
    label: "待回访",
    description: "存在逾期待办或下一次跟进时间已到的客户。",
  },
  {
    value: "pending_wechat",
    label: "待加微",
    description: "已经进入加微动作但还没有形成成功加微结果的客户。",
  },
  {
    value: "pending_invitation",
    label: "待邀约",
    description: "已经形成有效微信触点，但还没有直播邀约记录的客户。",
  },
  {
    value: "pending_deal",
    label: "待成交",
    description: "已经进入邀约或成交推进阶段，但还没有已支付订单的客户。",
  },
] as const;

export const customerRoleHeaderMeta: Record<
  RoleCode,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  ADMIN: {
    eyebrow: "组织范围",
    title: "客户中心",
    description: "先看当前范围，再按团队和销售快速下钻。",
  },
  SUPERVISOR: {
    eyebrow: "团队范围",
    title: "客户中心",
    description: "围绕团队承接、回访和邀约推进日常工作。",
  },
  SALES: {
    eyebrow: "我的客户",
    title: "客户中心",
    description: "围绕我的客户推进首呼、回访与邀约。",
  },
  OPS: {
    eyebrow: "客户中心",
    title: "客户中心",
    description: "当前角色不开放客户中心。",
  },
  SHIPPER: {
    eyebrow: "客户中心",
    title: "客户中心",
    description: "当前角色不开放客户中心。",
  },
};

export const customerDetailTabs = [
  {
    value: "profile",
    label: "基本资料",
    description: "查看客户摘要、负责人、来源、标签、导入与关联线索。",
  },
  {
    value: "calls",
    label: "通话记录",
    description: "集中查看通话结果、回访节奏和最近拨打情况。",
  },
  {
    value: "wechat",
    label: "微信记录",
    description: "查看加微状态、微信沉淀信息和后续跟进计划。",
  },
  {
    value: "live",
    label: "直播记录",
    description: "查看邀约、观看、到场和直播相关推进情况。",
  },
  {
    value: "orders",
    label: "订单记录",
    description: "查看订单、支付和发货状态，判断成交推进结果。",
  },
  {
    value: "gifts",
    label: "礼品记录",
    description: "查看礼品资格、审核、履约和收件信息。",
  },
  {
    value: "logs",
    label: "操作日志",
    description: "查看客户相关的重要操作记录，便于审计和追溯。",
  },
] as const;

export type CustomerDetailTab = (typeof customerDetailTabs)[number]["value"];
export type CustomerQueueKey = (typeof customerQueueOptions)[number]["value"];
export type CustomerPageSize = (typeof customerPageSizeOptions)[number];
export type CustomerWorkStatusKey = Exclude<CustomerQueueKey, "all">;

export const customerWorkStatusOptions = customerQueueOptions.filter(
  (item): item is (typeof customerQueueOptions)[number] & {
    value: CustomerWorkStatusKey;
  } => item.value !== "all",
);

export function getCustomerStatusLabel(status: CustomerStatus) {
  return customerStatusMeta[status].label;
}

export function getCustomerStatusVariant(status: CustomerStatus) {
  return customerStatusMeta[status].variant;
}

export function getCustomerLevelLabel(level: CustomerLevel) {
  return customerLevelMeta[level].label;
}

export function getCustomerQueueLabel(queue: CustomerQueueKey) {
  return customerQueueOptions.find((item) => item.value === queue)?.label ?? "客户队列";
}

export function getCustomerWorkStatusLabel(status: CustomerWorkStatusKey) {
  return customerWorkStatusOptions.find((item) => item.value === status)?.label ?? "工作状态";
}

export function getCustomerDetailTabMeta(tab: CustomerDetailTab) {
  return customerDetailTabs.find((item) => item.value === tab) ?? customerDetailTabs[0];
}

export function formatRegion(...parts: Array<string | null | undefined>) {
  const region = parts.filter(Boolean).join(" / ");
  return region || "未填写";
}

export function summarizeLeadSources(sources: LeadSource[]) {
  if (sources.length === 0) {
    return "无关联线索";
  }

  const uniqueSources = [...new Set(sources)];
  const labels = uniqueSources.slice(0, 2).map((source) => getLeadSourceLabel(source));

  if (uniqueSources.length > 2) {
    labels.push(`+${uniqueSources.length - 2}`);
  }

  return labels.join(" / ");
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
