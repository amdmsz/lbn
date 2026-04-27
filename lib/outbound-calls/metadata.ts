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
