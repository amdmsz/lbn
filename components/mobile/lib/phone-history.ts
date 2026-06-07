/**
 * 移动端通话历史 entry 构造 + 时间/结果过滤逻辑.
 * 从 mobile-app-shell.tsx 抽出 (Phase 1 plan 第 3 个 helper 模块).
 *
 * 收纳原则: 围绕 PhoneHistoryEntry 这个 UI 展示单元,
 * 包含模式标签 / 结果文案 / 结果分类 / 通话时间格式 / 时间过滤器
 * 以及把 CustomerListItem.callRecords + 最近一次拨号合成 entry 列表.
 *
 * 不在这里的: PhoneTimeFilterKey/PhoneResultFilterKey 的中文选项数组 (留主文件
 * 给 React useState 默认值使用, 不属于纯逻辑).
 */

import type { CustomerListItem } from "@/lib/customers/queries";
import type { MobileCallSource } from "@/lib/mobile/client-api";

import { getPhoneLocationLabel } from "./customer-modeling";
import { toDate, type DateLike } from "./format";
import type { RecentDialCustomer } from "./recent-dial";

export type PhoneHistoryEntry = {
  id: string;
  customer: CustomerListItem;
  title: string;
  phone: string;
  callMode: MobileCallSource;
  modeLabel: "外呼" | "本机";
  directionMark: "↗" | "↙";
  locationLabel: string;
  callTime: Date | null;
  result: CustomerListItem["callRecords"][number]["result"];
  resultCode: string | null;
  resultLabel: string;
  resultFilterKey: PhoneResultFilterKey;
  timeLabel: string;
};

export type PhoneTimeFilterKey = "all" | "today" | "week" | "month";

export type PhoneResultFilterKey =
  | "all"
  | "unfilled"
  | "missed"
  | "wechat-added"
  | "wechat-refused"
  | "wechat-pending"
  | "connected";

export function getCallModeLabel(
  callMode: MobileCallSource | null | undefined,
): PhoneHistoryEntry["modeLabel"] {
  return callMode === "local-phone" ? "本机" : "外呼";
}

export function getPhoneResultLabel(record: {
  result: string | null;
  resultCode: string | null;
  resultLabel?: string | null;
}): string {
  if (!record.result && !record.resultCode) {
    return "未填写";
  }

  const label = record.resultLabel?.trim();

  if (!label || label === "未记录") {
    return "未填写";
  }

  return label;
}

export function getPhoneResultFilterKey(
  record: CustomerListItem["callRecords"][number],
): PhoneResultFilterKey {
  if (!record.result && !record.resultCode) {
    return "unfilled";
  }

  switch (record.result) {
    case "NOT_CONNECTED":
    case "INVALID_NUMBER":
    case "HUNG_UP":
      return "missed";
    case "WECHAT_ADDED":
      return "wechat-added";
    case "REFUSED_WECHAT":
      return "wechat-refused";
    case "WECHAT_PENDING":
      return "wechat-pending";
    case "CONNECTED_NO_TALK":
    case "INTERESTED":
    case "NEED_CALLBACK":
      return "connected";
    default:
      return getPhoneResultLabel(record) === "未填写" ? "unfilled" : "connected";
  }
}

export function formatPhoneCallTime(value: DateLike): string {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfCallDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();

  if (startOfCallDay === startOfToday) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
      2,
      "0",
    )}`;
  }

  if (startOfCallDay === startOfToday - 24 * 60 * 60 * 1000) {
    return "昨天";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function getStartOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function isDateToday(value: Date | null): boolean {
  if (!value) {
    return false;
  }

  return getStartOfDay(value).getTime() === getStartOfDay(new Date()).getTime();
}

export function isDateInPhoneTimeFilter(value: Date | null, filter: PhoneTimeFilterKey): boolean {
  if (filter === "all") {
    return true;
  }

  if (!value) {
    return false;
  }

  const now = new Date();
  const startOfToday = getStartOfDay(now);

  if (filter === "today") {
    return value.getTime() >= startOfToday.getTime();
  }

  if (filter === "week") {
    const start = new Date(startOfToday);
    start.setDate(start.getDate() - 6);
    return value.getTime() >= start.getTime();
  }

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return value.getTime() >= startOfMonth.getTime();
}

export function buildRecentPhoneHistoryEntry(
  items: CustomerListItem[],
  recentDialCustomer: RecentDialCustomer | null,
): PhoneHistoryEntry | null {
  if (!recentDialCustomer) {
    return null;
  }

  const customer = items.find((item) => item.id === recentDialCustomer.customerId);
  const callTime = toDate(recentDialCustomer.calledAt);

  if (!customer || !callTime) {
    return null;
  }

  const hasPersistedRecord = customer.callRecords.some((record) => {
    const recordTime = toDate(record.callTime)?.getTime() ?? 0;

    return Math.abs(recordTime - callTime.getTime()) < 2 * 60 * 1000;
  });

  if (hasPersistedRecord) {
    return null;
  }

  const modeLabel = getCallModeLabel(recentDialCustomer.callMode);

  return {
    id: `recent-${recentDialCustomer.customerId}-${recentDialCustomer.calledAt}`,
    customer,
    title: recentDialCustomer.customerName || customer.name || recentDialCustomer.phone,
    phone: recentDialCustomer.phone,
    callMode: recentDialCustomer.callMode,
    modeLabel,
    directionMark: "↗" as const,
    locationLabel: getPhoneLocationLabel(customer),
    callTime,
    result: null,
    resultCode: null,
    resultLabel: recentDialCustomer.resultLabel?.trim() || "未填写",
    resultFilterKey: "unfilled" as const,
    timeLabel: formatPhoneCallTime(callTime),
  } satisfies PhoneHistoryEntry;
}

export function buildPhoneHistoryEntries(
  items: CustomerListItem[],
  recentDialCustomer: RecentDialCustomer | null,
): PhoneHistoryEntry[] {
  const entries: PhoneHistoryEntry[] = [];
  const recentEntry = buildRecentPhoneHistoryEntry(items, recentDialCustomer);

  if (recentEntry) {
    entries.push(recentEntry);
  }

  for (const customer of items) {
    for (const record of customer.callRecords.slice(0, 4)) {
      const modeLabel = getCallModeLabel(record.callSource);
      const callTime = toDate(record.callTime);

      entries.push({
        id: record.id,
        customer,
        title: customer.name || customer.phone,
        phone: customer.phone,
        callMode: record.callSource,
        modeLabel,
        directionMark: "↗",
        locationLabel: getPhoneLocationLabel(customer),
        callTime,
        result: record.result,
        resultCode: record.resultCode,
        resultLabel: getPhoneResultLabel(record),
        resultFilterKey: getPhoneResultFilterKey(record),
        timeLabel: formatPhoneCallTime(record.callTime),
      });
    }
  }

  return entries
    .sort((left, right) => {
      return (right.callTime?.getTime() ?? 0) - (left.callTime?.getTime() ?? 0);
    })
    .slice(0, 30);
}
