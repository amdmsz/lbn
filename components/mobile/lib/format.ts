/**
 * 移动端 shell 共享格式化工具.
 * 从 mobile-app-shell.tsx 抽出 (Phase 1 plan 第 1 步).
 *
 * 收纳原则: 纯函数 + 无 React 依赖 + 无 props 依赖.
 * 不在这里的: formatRelativeDateTime (来自 @/lib/datetime), formatPhoneCallTime
 * (依赖项目 datetime + 业务上下文, 留主文件).
 */

import { formatRelativeDateTime } from "@/lib/customers/metadata";

export type DateLike = Date | string | null | undefined;

export function toDate(value: DateLike): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseMobileApiDate(value: string | null | undefined): Date | null {
  return toDate(value);
}

export function formatNullableRelativeDate(value: DateLike): string {
  const date = toDate(value);
  return date ? formatRelativeDateTime(date) : "暂无跟进";
}

export function normalizeDialValue(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function formatDialDisplayNumber(value: string): string {
  const compactValue = value.replace(/\s+/g, "");

  if (!compactValue || /[^\d+]/.test(compactValue.replace(/^\+/, ""))) {
    return compactValue;
  }

  const plusPrefix = compactValue.startsWith("+") ? "+" : "";
  let digits = plusPrefix ? compactValue.slice(1) : compactValue;
  let countryPrefix = plusPrefix;

  if (plusPrefix && digits.startsWith("86") && digits.length > 11) {
    countryPrefix = "+86 ";
    digits = digits.slice(2);
  }

  if (digits.length <= 3) {
    return `${countryPrefix}${digits}`;
  }

  if (digits.length <= 7) {
    return `${countryPrefix}${digits.slice(0, 3)} ${digits.slice(3)}`;
  }

  if (digits.length <= 11) {
    return `${countryPrefix}${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  }

  return `${countryPrefix}${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(
    7,
    11,
  )} ${digits.slice(11)}`;
}

export function splitDialMatchedDisplay(
  phone: string,
  dialNumber: string,
): { matched: string; rest: string } {
  const display = formatDialDisplayNumber(phone);
  const normalizedDialNumber = normalizeDialValue(dialNumber)
    .replace(/^\+86/, "")
    .replace(/^\+/, "");

  if (!normalizedDialNumber) {
    return { matched: "", rest: display };
  }

  let digitCount = 0;
  let splitIndex = 0;

  for (let index = 0; index < display.length; index++) {
    if (/\d/.test(display[index])) {
      digitCount += 1;
    }
    if (digitCount >= normalizedDialNumber.length) {
      splitIndex = index + 1;
      break;
    }
  }

  return {
    matched: display.slice(0, splitIndex),
    rest: display.slice(splitIndex),
  };
}

export function normalizeSearchValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function formatMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(amount);
}

export function isMaskedPhone(value: string): boolean {
  return value.includes("*");
}

export function formatCurrencyAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "¥0";
  return `¥${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

export function formatCallDuration(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}
