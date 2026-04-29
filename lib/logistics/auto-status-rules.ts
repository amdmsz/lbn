import type { LogisticsTraceResult } from "@/lib/logistics/provider";

export type LogisticsTraceSignal =
  | "DELIVERED"
  | "RETURN_OR_REJECTED"
  | "IN_TRANSIT"
  | "QUERY_FAILED"
  | "UNKNOWN";

export const LOGISTICS_UNSIGNED_EXCEPTION_DAYS = 7;
export const LOGISTICS_CHECK_WINDOWS_DAYS = [3, 5, 7] as const;

const DELIVERED_STATUS_CODES = new Set(["SIGN", "SIGNED"]);
const RETURN_STATUS_CODES = new Set(["RETURN", "REJECT", "PROBLEM"]);
const IN_TRANSIT_STATUS_CODES = new Set([
  "COLLECT",
  "ACCEPT",
  "TRANSPORT",
  "IN_TRANSIT",
  "DISPATCH",
  "DELIVERING",
]);

const DELIVERED_KEYWORDS = ["签收", "已送达", "已妥投", "投递成功"];
const RETURN_KEYWORDS = ["退回", "拒收", "异常", "问题件", "无法派送"];

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function normalizeStatusCode(value?: string | null) {
  return value?.trim().toUpperCase() ?? "";
}

function includesAnyKeyword(value: string | null | undefined, keywords: string[]) {
  const normalized = value?.trim() ?? "";
  return Boolean(normalized) && keywords.some((keyword) => normalized.includes(keyword));
}

export function resolveLogisticsTraceSignal(trace: LogisticsTraceResult): LogisticsTraceSignal {
  if (trace.mode === "query_failed" || trace.mode === "not_configured") {
    return "QUERY_FAILED";
  }

  if (trace.mode !== "remote") {
    return "UNKNOWN";
  }

  const statusCode = normalizeStatusCode(trace.currentStatusCode ?? trace.latestEvent?.statusCode);
  const statusText = [
    trace.currentStatusLabel,
    trace.latestEvent?.description,
    trace.message,
  ].filter(Boolean).join(" / ");

  if (DELIVERED_STATUS_CODES.has(statusCode) || includesAnyKeyword(statusText, DELIVERED_KEYWORDS)) {
    return "DELIVERED";
  }

  if (RETURN_STATUS_CODES.has(statusCode) || includesAnyKeyword(statusText, RETURN_KEYWORDS)) {
    return "RETURN_OR_REJECTED";
  }

  if (IN_TRANSIT_STATUS_CODES.has(statusCode)) {
    return "IN_TRANSIT";
  }

  return "UNKNOWN";
}

export function getLogisticsMonitoringBaseDate(input: {
  shippedAt?: Date | null;
  taskCreatedAt: Date;
}) {
  return input.shippedAt ?? input.taskCreatedAt;
}

export function getUnsignedExceptionDeadlineAt(input: {
  shippedAt?: Date | null;
  taskCreatedAt: Date;
}) {
  return addDays(getLogisticsMonitoringBaseDate(input), LOGISTICS_UNSIGNED_EXCEPTION_DAYS);
}

export function isUnsignedShipmentOverdue(input: {
  now: Date;
  shippedAt?: Date | null;
  taskCreatedAt: Date;
}) {
  return input.now.getTime() >= getUnsignedExceptionDeadlineAt(input).getTime();
}

export function getNextCostAwareLogisticsCheckAt(input: {
  now: Date;
  shippedAt?: Date | null;
  taskCreatedAt: Date;
}) {
  const baseDate = getLogisticsMonitoringBaseDate(input);
  const nextWindow = LOGISTICS_CHECK_WINDOWS_DAYS.map((days) => addDays(baseDate, days))
    .find((windowAt) => windowAt.getTime() > input.now.getTime());

  return nextWindow ?? null;
}
