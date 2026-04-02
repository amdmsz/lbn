import type { CallResult } from "@prisma/client";

export const callResultMeta: Record<CallResult, { label: string }> = {
  NOT_CONNECTED: { label: "未接通" },
  INVALID_NUMBER: { label: "空号/无效号码" },
  HUNG_UP: { label: "挂断" },
  CONNECTED_NO_TALK: { label: "接通未有效沟通" },
  INTERESTED: { label: "有意向" },
  WECHAT_PENDING: { label: "加微待通过" },
  WECHAT_ADDED: { label: "已加微信" },
  REFUSED_WECHAT: { label: "拒绝加微信" },
  NEED_CALLBACK: { label: "需要回拨" },
  REFUSED_TO_BUY: { label: "拒绝购买" },
  BLACKLIST: { label: "黑名单" },
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
