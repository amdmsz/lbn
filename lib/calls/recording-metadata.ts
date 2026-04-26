export const CALL_RECORDING_STATUSES = [
  "LOCAL_PENDING",
  "UPLOADING",
  "UPLOADED",
  "PROCESSING",
  "READY",
  "FAILED",
  "EXPIRED",
  "DELETED",
] as const;

export type CallRecordingStatusValue = (typeof CALL_RECORDING_STATUSES)[number];

export const CALL_AI_ANALYSIS_STATUSES = [
  "PENDING",
  "TRANSCRIBING",
  "ANALYZING",
  "READY",
  "FAILED",
] as const;

export type CallAiAnalysisStatusValue =
  (typeof CALL_AI_ANALYSIS_STATUSES)[number];

export const CALL_QUALITY_REVIEW_STATUSES = [
  "PENDING",
  "REVIEWED",
  "NEEDS_COACHING",
  "EXCELLENT",
  "DISMISSED",
] as const;

export type CallQualityReviewStatusValue =
  (typeof CALL_QUALITY_REVIEW_STATUSES)[number];

export const MOBILE_RECORDING_CAPABILITIES = [
  "UNKNOWN",
  "SUPPORTED",
  "UNSUPPORTED",
  "BLOCKED",
] as const;

export type MobileRecordingCapabilityValue =
  (typeof MOBILE_RECORDING_CAPABILITIES)[number];

export const callRecordingStatusLabels: Record<CallRecordingStatusValue, string> = {
  LOCAL_PENDING: "本地待传",
  UPLOADING: "上传中",
  UPLOADED: "已上传",
  PROCESSING: "处理中",
  READY: "可播放",
  FAILED: "失败",
  EXPIRED: "已过期",
  DELETED: "已删除",
};

export const callAiAnalysisStatusLabels: Record<
  CallAiAnalysisStatusValue,
  string
> = {
  PENDING: "待处理",
  TRANSCRIBING: "转写中",
  ANALYZING: "分析中",
  READY: "已完成",
  FAILED: "失败",
};

export const callQualityReviewStatusLabels: Record<
  CallQualityReviewStatusValue,
  string
> = {
  PENDING: "待复核",
  REVIEWED: "已复核",
  NEEDS_COACHING: "需辅导",
  EXCELLENT: "优秀样本",
  DISMISSED: "已忽略",
};

export const mobileRecordingCapabilityLabels: Record<
  MobileRecordingCapabilityValue,
  string
> = {
  UNKNOWN: "未知",
  SUPPORTED: "支持",
  UNSUPPORTED: "不支持",
  BLOCKED: "被系统限制",
};

export function isCallRecordingStatus(value: string): value is CallRecordingStatusValue {
  return CALL_RECORDING_STATUSES.includes(value as CallRecordingStatusValue);
}

export function isCallAiAnalysisStatus(
  value: string,
): value is CallAiAnalysisStatusValue {
  return CALL_AI_ANALYSIS_STATUSES.includes(value as CallAiAnalysisStatusValue);
}

export function isMobileRecordingCapability(
  value: string,
): value is MobileRecordingCapabilityValue {
  return MOBILE_RECORDING_CAPABILITIES.includes(
    value as MobileRecordingCapabilityValue,
  );
}

export function formatRecordingFileSize(fileSizeBytes: number | null | undefined) {
  if (!fileSizeBytes || fileSizeBytes <= 0) {
    return "未知大小";
  }

  const mb = fileSizeBytes / 1024 / 1024;

  if (mb >= 1) {
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  }

  const kb = fileSizeBytes / 1024;
  return `${Math.max(1, Math.round(kb))} KB`;
}

export function parseJsonStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}
