import type { OutboundCallSessionStatus } from "@prisma/client";

export const OUTBOUND_CALL_SEAT_PROVIDERS = [
  "MOCK",
  "FREESWITCH",
  "CUSTOM_HTTP",
] as const;

export type OutboundCallSeatProvider =
  (typeof OUTBOUND_CALL_SEAT_PROVIDERS)[number];

export const outboundCallProviderLabels: Record<string, string> = {
  DISABLED: "关闭",
  MOCK: "Mock 联调",
  FREESWITCH: "FreeSWITCH / CTI Gateway",
  CUSTOM_HTTP: "自定义 HTTP CTI",
};

export const outboundCallCodecLabels: Record<string, string> = {
  PCMA: "PCMA / G.711A",
  PCMU: "PCMU / G.711U",
  OPUS: "OPUS",
  AUTO: "自动协商",
};

export const outboundCallRecordingImportModeLabels: Record<string, string> = {
  WEBHOOK_URL: "Webhook 回传录音 URL",
  CDR_PULL: "CDR 拉取",
  FILE_DROP: "文件落盘扫描",
  DISABLED: "暂不导入",
};

export const outboundCallSessionStatusLabels: Record<
  OutboundCallSessionStatus,
  string
> = {
  REQUESTED: "已请求",
  PROVIDER_ACCEPTED: "网关已接收",
  RINGING: "振铃中",
  ANSWERED: "已接通",
  ENDED: "已结束",
  FAILED: "失败",
  CANCELED: "已取消",
};

export const outboundCallFailureCodeLabels: Record<string, string> = {
  CUSTOMER_NO_ANSWER: "客户未接",
  CUSTOMER_BUSY: "客户忙线或拒接",
  CUSTOMER_REJECTED: "客户拒接",
  INVALID_NUMBER: "空号或号码无效",
  DIAL_FAILED: "拨号失败",
  PROVIDER_CONGESTION: "线路拥塞",
  CALL_CANCELED: "外呼已取消",
  PROVIDER_FAILED: "线路返回失败",
  START_FAILED: "外呼发起失败",
  CALL_FAILED: "外呼失败",
  NOANSWER: "客户未接",
  NO_ANSWER: "客户未接",
  BUSY: "客户忙线或拒接",
  REJECTED: "客户拒接",
  CHANUNAVAIL: "拨号失败",
  CONGESTION: "线路拥塞",
  CANCEL: "外呼已取消",
  CANCELED: "外呼已取消",
};

export function getOutboundCallFailureLabel(
  failureCode: string | null | undefined,
  failureMessage?: string | null,
) {
  const code = failureCode?.trim().toUpperCase();

  if (code && outboundCallFailureCodeLabels[code]) {
    return outboundCallFailureCodeLabels[code];
  }

  return failureMessage?.trim() || (code ? code : "外呼失败");
}

export function getOutboundCallSessionDisplay(input: {
  status: OutboundCallSessionStatus;
  failureCode?: string | null;
  failureMessage?: string | null;
  durationSeconds?: number | null;
}) {
  if (input.status === "FAILED") {
    return getOutboundCallFailureLabel(input.failureCode, input.failureMessage);
  }

  if (input.status === "CANCELED") {
    return "外呼已取消";
  }

  if (input.status === "ENDED") {
    return (input.durationSeconds ?? 0) > 0 ? "客户已接通" : "通话已结束";
  }

  return outboundCallSessionStatusLabels[input.status] ?? input.status;
}

export function maskPhoneForAudit(phone: string | null | undefined) {
  const normalized = phone?.replace(/\D/g, "") ?? "";

  if (normalized.length <= 4) {
    return normalized ? `****${normalized}` : "无号码";
  }

  return `****${normalized.slice(-4)}`;
}

export function normalizeDialedPhone(phone: string, dialPrefix?: string | null) {
  const compact = phone.replace(/[^\d+]/g, "");
  const prefix = dialPrefix?.trim();

  if (!prefix) {
    return compact;
  }

  return compact.startsWith(prefix) ? compact : `${prefix}${compact}`;
}
