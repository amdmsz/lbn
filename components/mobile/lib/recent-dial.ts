/**
 * 移动端最近拨号本地缓存 + 派生数据.
 * 从 mobile-app-shell.tsx 抽出 (Phase 1 plan 第 5 个 helper 模块).
 *
 * 收纳原则: 围绕 RecentDialCustomer 这个本地存储对象,
 * 包含读取 / 写入 localStorage + 从 CustomerListItem 列表反推最近一次通话.
 */

import type { CustomerListItem } from "@/lib/customers/queries";
import type { MobileCallSource } from "@/lib/mobile/client-api";
import type { MobileCallMode } from "@/lib/mobile/dialpad-call-routing";

import { toDate } from "./format";

export type RecentDialCustomer = {
  customerId: string;
  customerName: string;
  phone: string;
  calledAt: string;
  callMode: MobileCallSource;
  resultLabel: string | null;
};

const RECENT_DIAL_CUSTOMER_STORAGE_KEY = "lbncrm.mobile.recent-dial-customer";

export function getRecentDialFromRecords(items: CustomerListItem[]): RecentDialCustomer | null {
  let latest: RecentDialCustomer | null = null;
  let latestTime = 0;

  for (const item of items) {
    for (const record of item.callRecords) {
      const callTime = toDate(record.callTime)?.getTime() ?? 0;

      if (callTime > latestTime) {
        latestTime = callTime;
        latest = {
          customerId: item.id,
          customerName: item.name,
          phone: item.phone,
          calledAt: new Date(callTime).toISOString(),
          callMode: record.callSource,
          resultLabel: record.resultLabel,
        };
      }
    }
  }

  return latest;
}

export function readRecentDialCustomer(): RecentDialCustomer | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_DIAL_CUSTOMER_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<RecentDialCustomer>;

    if (
      typeof parsed.customerId !== "string" ||
      typeof parsed.customerName !== "string" ||
      typeof parsed.phone !== "string" ||
      typeof parsed.calledAt !== "string"
    ) {
      return null;
    }

    const parsedResultLabel =
      typeof parsed.resultLabel === "string" ? parsed.resultLabel.trim() : null;
    return {
      customerId: parsed.customerId,
      customerName: parsed.customerName,
      phone: parsed.phone,
      calledAt: parsed.calledAt,
      callMode: "local-phone",
      resultLabel:
        parsedResultLabel === "本机通话" ||
        parsedResultLabel === "本机" ||
        parsedResultLabel === "CRM 外呼" ||
        parsedResultLabel === "外呼"
          ? "未填写"
          : parsedResultLabel,
    } satisfies RecentDialCustomer;
  } catch {
    return null;
  }
}

export function writeRecentDialCustomer(customer: RecentDialCustomer): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RECENT_DIAL_CUSTOMER_STORAGE_KEY,
    JSON.stringify(customer),
  );
}

export function createRecentDialCustomer(
  item: CustomerListItem,
  callMode: MobileCallMode,
  resultLabel: string | null = "未填写",
): RecentDialCustomer {
  return {
    customerId: item.id,
    customerName: item.name,
    phone: item.phone,
    calledAt: new Date().toISOString(),
    callMode,
    resultLabel,
  } satisfies RecentDialCustomer;
}
