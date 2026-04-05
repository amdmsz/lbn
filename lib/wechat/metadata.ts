import type { WechatAddStatus } from "@prisma/client";
import type { FollowUpEffectLevel } from "@/lib/calls/metadata";

export const wechatAddedStatusMeta: Record<
  WechatAddStatus,
  {
    label: string;
    effectLevel: FollowUpEffectLevel;
    resetsPublicPoolClock: boolean;
    claimProtectionDays: number;
    requiresSupervisorReview: boolean;
  }
> = {
  PENDING: {
    label: "加微待通过",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 5,
    requiresSupervisorReview: false,
  },
  ADDED: {
    label: "已加微",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 7,
    requiresSupervisorReview: false,
  },
  REJECTED: {
    label: "加微失败",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: false,
  },
  BLOCKED: {
    label: "已拉黑",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: true,
  },
};

export const wechatAddedStatusOptions = [
  { value: "PENDING", label: "加微待通过" },
  { value: "ADDED", label: "已加微" },
  { value: "REJECTED", label: "加微失败" },
  { value: "BLOCKED", label: "已拉黑" },
] as const;

export function getWechatAddedStatusLabel(status: WechatAddStatus) {
  return wechatAddedStatusMeta[status].label;
}

export function getWechatAddedStatusEffectMeta(status: WechatAddStatus) {
  return wechatAddedStatusMeta[status];
}

export function parseWechatTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatWechatTags(value: unknown) {
  if (!Array.isArray(value)) {
    return "无标签";
  }

  const items = value.filter((item) => typeof item === "string" && item.trim());

  if (items.length === 0) {
    return "无标签";
  }

  return items.join(" / ");
}
