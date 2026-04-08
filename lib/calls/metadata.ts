import type { CallResult } from "@prisma/client";

export const CALL_RESULT_EFFECT_LEVELS = [
  "STRONG",
  "MEDIUM",
  "WEAK",
  "NEGATIVE",
] as const;

export type CallResultEffectLevelValue =
  (typeof CALL_RESULT_EFFECT_LEVELS)[number];

export const CALL_RESULT_WECHAT_SYNC_ACTIONS = [
  "NONE",
  "PENDING",
  "ADDED",
  "REFUSED",
] as const;

export type CallResultWechatSyncActionValue =
  (typeof CALL_RESULT_WECHAT_SYNC_ACTIONS)[number];

export const SYSTEM_CALL_RESULT_VALUES = [
  "NOT_CONNECTED",
  "INVALID_NUMBER",
  "HUNG_UP",
  "CONNECTED_NO_TALK",
  "INTERESTED",
  "WECHAT_PENDING",
  "WECHAT_ADDED",
  "REFUSED_WECHAT",
  "NEED_CALLBACK",
  "REFUSED_TO_BUY",
  "BLACKLIST",
] as const satisfies readonly CallResult[];

export type SystemCallResultValue = (typeof SYSTEM_CALL_RESULT_VALUES)[number];

export type CallResultDefinition = {
  code: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  isEnabled: boolean;
  sortOrder: number;
  effectLevel: CallResultEffectLevelValue;
  resetsPublicPoolClock: boolean;
  claimProtectionDays: number;
  requiresSupervisorReview: boolean;
  wechatSyncAction: CallResultWechatSyncActionValue;
};

export type CallResultOption = {
  value: string;
  label: string;
};

const systemCallResultBase: Record<
  SystemCallResultValue,
  Omit<CallResultDefinition, "code" | "isSystem" | "isEnabled" | "sortOrder">
> = {
  NOT_CONNECTED: {
    label: "未接通",
    description: "本次通话未建立有效连接。",
    effectLevel: "WEAK",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: false,
    wechatSyncAction: "NONE",
  },
  INVALID_NUMBER: {
    label: "空号/无效号码",
    description: "号码无效，需要主管关注线索质量。",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: true,
    wechatSyncAction: "NONE",
  },
  HUNG_UP: {
    label: "挂断",
    description: "已接触但未形成有效沟通。",
    effectLevel: "WEAK",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: false,
    wechatSyncAction: "NONE",
  },
  CONNECTED_NO_TALK: {
    label: "接通未有效沟通",
    description: "已接通，但未完成有效推进。",
    effectLevel: "MEDIUM",
    resetsPublicPoolClock: true,
    claimProtectionDays: 2,
    requiresSupervisorReview: false,
    wechatSyncAction: "NONE",
  },
  INTERESTED: {
    label: "有意向",
    description: "客户表现出明确意向，可继续推进。",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 7,
    requiresSupervisorReview: false,
    wechatSyncAction: "NONE",
  },
  WECHAT_PENDING: {
    label: "加微待通过",
    description: "通话结果已推进到待加微阶段。",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 5,
    requiresSupervisorReview: false,
    wechatSyncAction: "PENDING",
  },
  WECHAT_ADDED: {
    label: "已加微信",
    description: "通话结果已推进到成功加微。",
    effectLevel: "STRONG",
    resetsPublicPoolClock: true,
    claimProtectionDays: 7,
    requiresSupervisorReview: false,
    wechatSyncAction: "ADDED",
  },
  REFUSED_WECHAT: {
    label: "拒绝加微信",
    description: "客户明确拒绝加微。",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: false,
    wechatSyncAction: "REFUSED",
  },
  NEED_CALLBACK: {
    label: "需要回拨",
    description: "客户要求稍后再联系。",
    effectLevel: "MEDIUM",
    resetsPublicPoolClock: true,
    claimProtectionDays: 3,
    requiresSupervisorReview: false,
    wechatSyncAction: "NONE",
  },
  REFUSED_TO_BUY: {
    label: "拒绝购买",
    description: "客户明确表达拒购态度。",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: true,
    wechatSyncAction: "NONE",
  },
  BLACKLIST: {
    label: "黑名单",
    description: "客户进入高风险或不再联系状态。",
    effectLevel: "NEGATIVE",
    resetsPublicPoolClock: false,
    claimProtectionDays: 0,
    requiresSupervisorReview: true,
    wechatSyncAction: "NONE",
  },
};

export const systemCallResultDefinitions = SYSTEM_CALL_RESULT_VALUES.map(
  (code, index) =>
    ({
      code,
      isSystem: true,
      isEnabled: true,
      sortOrder: (index + 1) * 10,
      ...systemCallResultBase[code],
    }) satisfies CallResultDefinition,
);

const systemCallResultDefinitionMap = Object.fromEntries(
  systemCallResultDefinitions.map((item) => [item.code, item]),
) as Record<SystemCallResultValue, CallResultDefinition>;

export const callResultEffectLevelLabels: Record<
  CallResultEffectLevelValue,
  string
> = {
  STRONG: "强有效",
  MEDIUM: "中有效",
  WEAK: "弱动作",
  NEGATIVE: "负向动作",
};

export const callResultWechatSyncActionLabels: Record<
  CallResultWechatSyncActionValue,
  string
> = {
  NONE: "不联动微信",
  PENDING: "同步为加微待通过",
  ADDED: "同步为已加微",
  REFUSED: "同步为拒绝加微",
};

export function isSystemCallResultCode(
  code: string,
): code is SystemCallResultValue {
  return SYSTEM_CALL_RESULT_VALUES.includes(code as SystemCallResultValue);
}

export function mapCallResultCodeToLegacyEnum(code: string) {
  return isSystemCallResultCode(code) ? code : null;
}

export function getDefaultSystemCallResultDefinition(code: SystemCallResultValue) {
  return systemCallResultDefinitionMap[code];
}

export function resolveStoredCallResultCode(input: {
  resultCode?: string | null;
  result?: CallResult | null;
}) {
  return input.resultCode?.trim() || input.result || null;
}

export function buildCallResultOptionItems(
  definitions: CallResultDefinition[],
): CallResultOption[] {
  return [...definitions]
    .filter((item) => item.isEnabled)
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.label.localeCompare(right.label, "zh-Hans-CN");
    })
    .map((item) => ({
      value: item.code,
      label: item.label,
    }));
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
