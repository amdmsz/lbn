import type { CallResult } from "@prisma/client";

export type FollowUpEffectLevel = "STRONG" | "MEDIUM" | "WEAK" | "NEGATIVE";

export const callResultMeta: Record<
  CallResult,
  {
    label: string;
    effectLevel: FollowUpEffectLevel;
    resetsPublicPoolClock: boolean;
    claimProtectionDays: number;
    requiresSupervisorReview: boolean;
  }
> = {
  NOT_CONNECTED: {
    label: "未接通",
    effectLevel: "WEAK",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: false,
  },
  INVALID_NUMBER: {
    label: "空号/无效号码",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: true,
  },
  HUNG_UP: {
    label: "挂断",
    effectLevel: "WEAK",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: false,
  },
  CONNECTED_NO_TALK: {
    label: "接通未有效沟通",
    effectLevel: "MEDIUM",
    resetsPublicPoolClock: true,
    claimProtectionDays: 2,
    requiresSupervisorReview: false,
  },
  INTERESTED: {
    label: "有意向",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 7,
    requiresSupervisorReview: false,
  },
  WECHAT_PENDING: {
    label: "加微待通过",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 5,
    requiresSupervisorReview: false,
  },
  WECHAT_ADDED: {
    label: "已加微信",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 7,
    requiresSupervisorReview: false,
  },
  REFUSED_WECHAT: {
    label: "拒绝加微信",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: false,
  },
  NEED_CALLBACK: {
    label: "需要回拨",
    effectLevel: "MEDIUM",
    resetsPublicPoolClock: true,
    claimProtectionDays: 3,
    requiresSupervisorReview: false,
  },
  REFUSED_TO_BUY: {
    label: "拒绝购买",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: true,
  },
  BLACKLIST: {
    label: "黑名单",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: true,
  },
};

export const callResultOptions = Object.entries(callResultMeta).map(
  ([value, meta]) => ({
    value: value as CallResult,
    label: meta.label,
  }),
);

export function getCallResultLabel(result: CallResult) {
  return callResultMeta[result].label;
}

export function getCallResultEffectMeta(result: CallResult) {
  return callResultMeta[result];
}

export function formatDurationSeconds(durationSeconds: number) {
  if (durationSeconds < 60) {
    return `${durationSeconds} 秒`;
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  if (seconds === 0) {
    return `${minutes} 分钟`;
  }

  return `${minutes} 分 ${seconds} 秒`;
}
