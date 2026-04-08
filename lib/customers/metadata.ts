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
    label: "客户档案",
    description: "集中查看客户身份、标签、来源归并、线索回流和导入脉络。",
  },
  {
    value: "calls",
    label: "通话推进",
    description: "围绕首呼、回访节奏和最近一次通话结果继续推进客户。",
  },
  {
    value: "wechat",
    label: "微信推进",
    description: "查看加微状态、微信沉淀信息和后续私域跟进安排。",
  },
  {
    value: "live",
    label: "直播推进",
    description: "查看直播邀约、到场、观看和礼品达标等经营动作。",
  },
  {
    value: "orders",
    label: "成交结果",
    description: "围绕成交主单、提审、履约与 COD 结果回看成交推进情况。",
  },
  {
    value: "gifts",
    label: "礼品履约",
    description: "查看礼品资格、审核、运费与发货履约，不混入订单真相。",
  },
  {
    value: "logs",
    label: "操作日志",
    description: "查看客户及关联交易、履约动作的重要审计记录。",
  },
] as const;

export type CustomerDetailTab = (typeof customerDetailTabs)[number]["value"];

export const customerDetailTabGroups = [
  {
    value: "profile",
    label: "客户档案",
    description: "先看客户身份、来源和标签，再进入更细的经营记录。",
    tabs: ["profile"],
  },
  {
    value: "follow_up",
    label: "跟进记录",
    description: "围绕通话、微信和直播记录，继续承接客户推进节奏。",
    tabs: ["calls", "wechat", "live"],
  },
  {
    value: "results",
    label: "成交结果",
    description: "集中回看成交主单、礼品履约和后续经营结果。",
    tabs: ["orders", "gifts"],
  },
  {
    value: "logs",
    label: "操作日志",
    description: "保留客户与关联业务动作的审计时间线。",
    tabs: ["logs"],
  },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  description: string;
  tabs: readonly CustomerDetailTab[];
}>;

export type CustomerDetailTabGroup =
  (typeof customerDetailTabGroups)[number]["value"];
export type CustomerQueueKey = (typeof customerQueueOptions)[number]["value"];
export type CustomerPageSize = (typeof customerPageSizeOptions)[number];
export type CustomerWorkStatusKey = Exclude<CustomerQueueKey, "all">;

export const customerWorkStatusOptions = customerQueueOptions.filter(
  (item): item is (typeof customerQueueOptions)[number] & {
    value: CustomerWorkStatusKey;
  } => item.value !== "all",
);

const customerWorkStatusMeta: Record<
  CustomerWorkStatusKey,
  { label: string; variant: StatusBadgeVariant }
> = {
  new_imported: { label: "今日新增", variant: "info" },
  pending_first_call: { label: "待首呼", variant: "warning" },
  pending_follow_up: { label: "待回访", variant: "warning" },
  pending_wechat: { label: "待加微", variant: "info" },
  pending_invitation: { label: "待邀约", variant: "success" },
  pending_deal: { label: "待成交", variant: "info" },
};

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
  return customerWorkStatusMeta[status]?.label ?? "工作状态";
}

export function getCustomerWorkStatusVariant(status: CustomerWorkStatusKey) {
  return customerWorkStatusMeta[status]?.variant ?? "neutral";
}

export function getCustomerDetailTabMeta(tab: CustomerDetailTab) {
  return customerDetailTabs.find((item) => item.value === tab) ?? customerDetailTabs[0];
}

export function getCustomerDetailTabGroupMeta(tab: CustomerDetailTab) {
  return (
    customerDetailTabGroups.find((group) => group.tabs.some((item) => item === tab)) ??
    customerDetailTabGroups[0]
  );
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

export function formatRelativeDateTime(value: Date) {
  const diffMs = Date.now() - value.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} 小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 1) {
    return "昨天";
  }

  if (diffDays < 30) {
    return `${diffDays} 天前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
