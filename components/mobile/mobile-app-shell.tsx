"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Delete,
  FileText,
  Mic,
  Package,
  PackageCheck,
  PhoneCall,
  RefreshCw,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  IoBackspace,
  IoCall,
  IoCallSharp,
  IoChatbubble,
  IoChevronBack,
  IoKeypad,
  IoOptionsOutline,
  IoPersonCircle,
  IoSearch as IoSearchIcon,
  IoTime,
} from "react-icons/io5";
import type { RoleCode } from "@prisma/client";
import type { CallResultOption } from "@/lib/calls/metadata";
import { MobileCallFollowUpSheet } from "@/components/customers/mobile-call-followup-sheet";
import { MobileOrderComposer } from "@/components/mobile/mobile-order-composer";
import {
  readNativeConnectionProfile,
  readNativeRecorderReadiness,
  reloadNativeApp,
  requestNativeRecorderPermissions,
  saveNativeConnectionProfile,
  summarizeNativeRecorderReadiness,
  testNativeConnection,
  type NativeConnectionProfile,
  type NativeRecorderReadiness,
} from "@/lib/calls/native-mobile-call";
import {
  startMobileCallFollowUpDial,
  type MobileCallTriggerSource,
} from "@/lib/calls/mobile-call-followup";
import {
  formatRegion,
  formatRelativeDateTime,
} from "@/lib/customers/metadata";
import type {
  CustomerCenterData,
  CustomerListItem,
  CustomerOperatingDashboardData,
} from "@/lib/customers/queries";
import {
  fetchMobileCustomers,
  fetchMobileCustomerDetail,
  uploadMobileCustomerAvatar,
  updateMobileCustomerRemark,
  type MobileApiCustomerListItem,
  type MobileApiPagination,
  type MobileCustomerDetail,
} from "@/lib/mobile/client-api";
import type {
  NavigationGroup,
  NavigationIconName,
  NavigationItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

type MobileTab = "messages" | "customers" | "dialpad" | "search" | "apps" | "me";
type MobileCallMode = "crm-outbound" | "local-phone";
type DateLike = Date | string | null | undefined;
type MobileIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
type CustomerExecutionClassValue = "A" | "B" | "C" | "D" | "E";
type MobileModuleView =
  | {
      kind: "orders";
      title: string;
      description: string;
    }
  | {
      kind: "recordings";
      title: string;
      description: string;
    }
  | {
      kind: "generic";
      title: string;
      description: string;
      href: string;
      iconName: NavigationIconName;
    };

type MobileCurrentUser = {
  name: string;
  username: string;
  role: RoleCode;
  roleName: string;
  teamName: string | null;
};

type RecentDialCustomer = {
  customerId: string;
  customerName: string;
  phone: string;
  calledAt: string;
  callMode: MobileCallMode;
  resultLabel: string | null;
};

type MobileOutboundNotice = {
  tone: "pending" | "success" | "failed";
  title: string;
  description: string;
};
type MobileCustomersApiState = {
  items: MobileApiCustomerListItem[] | null;
  pagination: MobileApiPagination | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  lastSyncedAt: Date | null;
};

const tabs: Array<{
  key: MobileTab;
  label: string;
  icon: MobileIcon;
}> = [
  { key: "messages", label: "通话", icon: IoTime },
  { key: "customers", label: "通讯录", icon: IoPersonCircle },
  { key: "dialpad", label: "拨号盘", icon: IoKeypad },
  { key: "search", label: "搜索", icon: IoSearchIcon },
];

const customerExecutionClassOptions: Array<{
  value: CustomerExecutionClassValue;
  label: string;
}> = [
  { value: "A", label: "A 已复购" },
  { value: "B", label: "B 已加微" },
  { value: "C", label: "C 已邀约" },
  { value: "D", label: "D 未接通" },
  { value: "E", label: "E 拒加" },
];

const RECENT_DIAL_CUSTOMER_STORAGE_KEY = "lbncrm.mobile.recent-dial-customer";
const MOBILE_CALL_MODE_STORAGE_KEY = "lbncrm.mobile.call-mode";
const CUSTOMER_PHOTO_STORAGE_PREFIX = "lbncrm.mobile.customer-photo.";

const keypadRows = [
  [
    { value: "1", letters: "" },
    { value: "2", letters: "ABC" },
    { value: "3", letters: "DEF" },
  ],
  [
    { value: "4", letters: "GHI" },
    { value: "5", letters: "JKL" },
    { value: "6", letters: "MNO" },
  ],
  [
    { value: "7", letters: "PQRS" },
    { value: "8", letters: "TUV" },
    { value: "9", letters: "WXYZ" },
  ],
  [
    { value: "*", letters: "" },
    { value: "0", letters: "+" },
    { value: "#", letters: "" },
  ],
];

const roleMobileLabels: Record<RoleCode, string> = {
  ADMIN: "管理员",
  SUPERVISOR: "主管",
  SALES: "销售",
  OPS: "运营",
  SHIPPER: "发货员",
};

function toDate(value: DateLike) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMobileApiDate(value: string | null | undefined) {
  const parsed = toDate(value);
  return parsed ?? null;
}

function formatNullableRelativeDate(value: DateLike) {
  const date = toDate(value);
  return date ? formatRelativeDateTime(date) : "暂无跟进";
}

function normalizeDialValue(value: string) {
  return value.replace(/[^\d+]/g, "");
}

function formatDialDisplayNumber(value: string) {
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

function splitDialMatchedDisplay(phone: string, dialNumber: string) {
  const display = formatDialDisplayNumber(phone);
  const normalizedDialNumber = normalizeDialValue(dialNumber)
    .replace(/^\+86/, "")
    .replace(/^\+/, "");

  if (!normalizedDialNumber) {
    return {
      matched: "",
      rest: display,
    };
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

function normalizeSearchValue(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function formatMoney(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "0";
  }

  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(amount);
}

function isMaskedPhone(value: string) {
  return value.includes("*");
}

function parseMobileCallMode(value: string | null | undefined): MobileCallMode | null {
  return value === "crm-outbound" || value === "local-phone" ? value : null;
}

function generateClientCallCorrelationId(callMode: MobileCallMode) {
  const randomPart =
    typeof window !== "undefined" && "crypto" in window && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return `${callMode}:${randomPart}`;
}

function readStoredCallMode() {
  if (typeof window === "undefined") {
    return "crm-outbound";
  }

  try {
    return parseMobileCallMode(window.localStorage.getItem(MOBILE_CALL_MODE_STORAGE_KEY)) ?? "crm-outbound";
  } catch {
    return "crm-outbound";
  }
}

function writeStoredCallMode(value: MobileCallMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MOBILE_CALL_MODE_STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable in restricted WebViews; the in-memory state still works.
  }
}

function getCustomerPhotoStorageKey(customerId: string) {
  return `${CUSTOMER_PHOTO_STORAGE_PREFIX}${customerId}`;
}

function readStoredCustomerPhoto(customerId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(getCustomerPhotoStorageKey(customerId));
  } catch {
    return null;
  }
}

function readImageFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("照片读取失败。"));
    };
    reader.onerror = () => reject(new Error("照片读取失败。"));
    reader.readAsDataURL(file);
  });
}

function formatCurrencyAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "¥0";
  }

  return `¥${new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function formatCallDuration(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(
    2,
    "0",
  )}`;
}

function formatMobileDetailCallLabel(record: {
  result: string | null;
  resultCode: string | null;
  latestActionEvent?: { action: string; failureCode?: string | null } | null;
}) {
  if (record.resultCode || record.result) {
    return record.resultCode || record.result || "未填写";
  }

  switch (record.latestActionEvent?.action) {
    case "call.provider_requested":
      return "外呼提交中";
    case "call.provider_accepted":
      return "外呼已提交";
    case "call.provider_ringing":
      return "外呼振铃中";
    case "call.provider_answered":
      return "外呼已接通";
    case "call.provider_ended":
      return "外呼已结束";
    case "call.provider_canceled":
      return "外呼已取消";
    case "call.provider_failed":
      return "外呼失败";
    case "call.recording_imported":
      return "录音已归档";
    case "call.recording_failed":
      return "录音归档失败";
    case "call.native_dispatched":
      return "本机已拨出";
    case "call.native_permission_denied":
      return "本机权限不足";
    case "call.offhook_detected":
      return "本机已接通";
    case "call.idle_detected":
      return "本机已结束";
    case "call.recording_started":
      return "本机录音中";
    case "call.recording_file_ready":
      return "本机录音待上传";
    case "call.recording_unsupported":
      return "本机录音不支持";
    case "call.upload_started":
      return "录音上传中";
    case "call.upload_completed":
      return "录音已上传";
    case "call.upload_failed":
      return "录音上传失败";
    case "call.followup_saved":
      return "已保存跟进";
    default:
      return "未填写";
  }
}

function createMobileApiCustomerListItem(
  item: MobileApiCustomerListItem,
  fallback?: CustomerListItem,
) {
  const latestCall = item.latestCall
    ? [
        {
          id: item.latestCall.id,
          callTime: new Date(item.latestCall.callTime),
          durationSeconds: item.latestCall.durationSeconds,
          callSource: item.latestCall.callSource,
          result: item.latestCall.result as CustomerListItem["callRecords"][number]["result"],
          resultCode: item.latestCall.resultCode,
          resultLabel: formatMobileDetailCallLabel(item.latestCall),
          remark: fallback?.callRecords.find((record) => record.id === item.latestCall?.id)
            ?.remark ?? null,
          nextFollowUpAt: parseMobileApiDate(item.latestCall.nextFollowUpAt),
          sales: fallback?.owner
            ? {
                name: fallback.owner.name,
                username: fallback.owner.username,
              }
            : {
                name: item.owner?.name ?? "",
                username: item.owner?.username ?? "",
              },
        },
      ]
    : (fallback?.callRecords ?? []);

  return {
    id: item.id,
    name: item.name,
    phone: item.phoneMasked,
    province: item.region || fallback?.province || null,
    city: fallback?.city ?? null,
    district: fallback?.district ?? null,
    address: fallback?.address ?? null,
    status: item.status as CustomerListItem["status"],
    ownershipMode: item.ownershipMode as CustomerListItem["ownershipMode"],
    createdAt: new Date(item.createdAt),
    avatarUrl: item.avatarUrl ?? fallback?.avatarUrl ?? null,
    assignedAt: parseMobileApiDate(item.assignedAt) ?? fallback?.assignedAt ?? null,
    latestImportAt: fallback?.latestImportAt ?? null,
    latestFollowUpAt: parseMobileApiDate(item.lastFollowUpAt),
    lastEffectiveFollowUpAt: parseMobileApiDate(item.lastFollowUpAt),
    latestTradeAt: parseMobileApiDate(item.latestOrder?.createdAt),
    lifetimeTradeAmount:
      fallback?.lifetimeTradeAmount ?? item.latestOrder?.finalAmount ?? "0",
    approvedTradeOrderCount:
      fallback?.approvedTradeOrderCount ??
      (item.latestOrder?.tradeStatus === "APPROVED" ? 1 : 0),
    executionClass: item.level,
    newImported: fallback?.newImported ?? false,
    pendingFirstCall: fallback?.pendingFirstCall ?? !item.latestCall,
    latestInterestedProduct: fallback?.latestInterestedProduct ?? null,
    latestPurchasedProduct:
      fallback?.latestPurchasedProduct ?? item.latestOrder?.tradeNo ?? null,
    remark: fallback?.remark ?? null,
    workingStatuses:
      fallback?.workingStatuses ??
      (item.latestFollowUpTask ? (["pending_follow_up"] as CustomerListItem["workingStatuses"]) : []),
    recycleGuard: fallback?.recycleGuard ?? (null as unknown as CustomerListItem["recycleGuard"]),
    recycleFinalizePreview: fallback?.recycleFinalizePreview ?? null,
    owner:
      item.owner ??
      fallback?.owner ??
      null,
    leads: fallback?.leads ?? [],
    callRecords: latestCall,
    _count: fallback?._count ?? {
      leads: 0,
      callRecords: latestCall.length,
    },
    customerTags: fallback?.customerTags ?? [],
  } satisfies CustomerListItem;
}

function mergeMobileApiCustomerItems(
  current: readonly MobileApiCustomerListItem[],
  next: readonly MobileApiCustomerListItem[],
) {
  const itemsById = new Map<string, MobileApiCustomerListItem>();

  for (const item of current) {
    itemsById.set(item.id, item);
  }

  for (const item of next) {
    itemsById.set(item.id, item);
  }

  return Array.from(itemsById.values());
}

function getCustomerPrimaryProduct(item: CustomerListItem) {
  return (
    item.latestInterestedProduct?.trim() ||
    item.leads.find((lead) => lead.interestedProduct?.trim())?.interestedProduct?.trim() ||
    item.latestPurchasedProduct?.trim() ||
    ""
  );
}

function getCustomerDialProductSignal(item: CustomerListItem) {
  const interestedProduct =
    item.latestInterestedProduct?.trim() ||
    item.leads.find((lead) => lead.interestedProduct?.trim())?.interestedProduct?.trim() ||
    "";

  if (interestedProduct) {
    return {
      label: "意向商品",
      value: interestedProduct,
    };
  }

  const purchasedProduct = item.latestPurchasedProduct?.trim() || "";

  if (purchasedProduct) {
    return {
      label: "已购商品",
      value: purchasedProduct,
    };
  }

  return null;
}

function getCustomerAssignmentLabel(
  item: CustomerListItem,
  detail?: MobileCustomerDetail | null,
) {
  const assignedAt = toDate(detail?.assignedAt ?? item.assignedAt);

  return assignedAt ? formatRelativeDateTime(assignedAt) : "未分配";
}

function getRecentDialFromRecords(items: CustomerListItem[]) {
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

type PhoneHistoryEntry = {
  id: string;
  customer: CustomerListItem;
  title: string;
  phone: string;
  callMode: MobileCallMode;
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

type PhoneTimeFilterKey = "all" | "today" | "week" | "month";
type PhoneResultFilterKey =
  | "all"
  | "unfilled"
  | "missed"
  | "wechat-added"
  | "wechat-refused"
  | "wechat-pending"
  | "connected";

const phoneTimeFilterOptions: Array<{
  value: PhoneTimeFilterKey;
  label: string;
}> = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "week", label: "近 7 天" },
  { value: "month", label: "本月" },
];

const phoneResultFilterOptions: Array<{
  value: PhoneResultFilterKey;
  label: string;
}> = [
  { value: "all", label: "全部结果" },
  { value: "unfilled", label: "未填写" },
  { value: "missed", label: "未接通" },
  { value: "wechat-added", label: "已加微" },
  { value: "wechat-refused", label: "拒加" },
  { value: "wechat-pending", label: "待加微" },
  { value: "connected", label: "已接通" },
];

function getCallModeLabel(callMode: MobileCallMode | null | undefined): PhoneHistoryEntry["modeLabel"] {
  return callMode === "local-phone" ? "本机" : "外呼";
}

function getPhoneResultLabel(record: {
  result: string | null;
  resultCode: string | null;
  resultLabel?: string | null;
}) {
  if (!record.result && !record.resultCode) {
    return "未填写";
  }

  const label = record.resultLabel?.trim();

  if (!label || label === "未记录") {
    return "未填写";
  }

  return label;
}

function getPhoneResultFilterKey(record: CustomerListItem["callRecords"][number]): PhoneResultFilterKey {
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

function formatPhoneCallTime(value: DateLike) {
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

function getStartOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function isDateToday(value: Date | null) {
  if (!value) {
    return false;
  }

  return getStartOfDay(value).getTime() === getStartOfDay(new Date()).getTime();
}

function isDateInPhoneTimeFilter(value: Date | null, filter: PhoneTimeFilterKey) {
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

function getPhoneLocationLabel(item: CustomerListItem) {
  return formatRegion(item.province, item.city, item.district) || "未知";
}

function getContactAddressLabel(item: CustomerListItem) {
  return (
    [item.province, item.city, item.district, item.address]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" / ") || "未填写"
  );
}

function getCustomerDetailAddressLabel(
  item: CustomerListItem,
  detail: MobileCustomerDetail | null,
) {
  return (
    [
      detail?.profile.province ?? item.province,
      detail?.profile.city ?? item.city,
      detail?.profile.district ?? item.district,
      detail?.profile.address ?? item.address,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" / ") || "未填写地址"
  );
}

function buildRecentPhoneHistoryEntry(
  items: CustomerListItem[],
  recentDialCustomer: RecentDialCustomer | null,
) {
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

function buildPhoneHistoryEntries(
  items: CustomerListItem[],
  recentDialCustomer: RecentDialCustomer | null,
) {
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

function readRecentDialCustomer() {
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
    const callMode =
      parsed.callMode === "local-phone" || parsed.callMode === "crm-outbound"
        ? parsed.callMode
        : parsedResultLabel?.includes("本机")
          ? "local-phone"
          : "crm-outbound";

    return {
      customerId: parsed.customerId,
      customerName: parsed.customerName,
      phone: parsed.phone,
      calledAt: parsed.calledAt,
      callMode,
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

function writeRecentDialCustomer(customer: RecentDialCustomer) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    RECENT_DIAL_CUSTOMER_STORAGE_KEY,
    JSON.stringify(customer),
  );
}

function createRecentDialCustomer(
  item: CustomerListItem,
  callMode: MobileCallMode,
  resultLabel: string | null = "未填写",
) {
  return {
    customerId: item.id,
    customerName: item.name,
    phone: item.phone,
    calledAt: new Date().toISOString(),
    callMode,
    resultLabel,
  } satisfies RecentDialCustomer;
}

function getNavigationIcon(iconName: NavigationIconName) {
  const iconMap: Record<NavigationIconName, MobileIcon> = {
    dashboard: BarChart3,
    leads: FileText,
    leadImports: FileText,
    customers: UsersRound,
    callRecordings: Mic,
    suppliers: BriefcaseBusiness,
    products: Package,
    liveSessions: CalendarDays,
    recycleBin: Delete,
    orders: ClipboardList,
    fulfillmentCenter: PackageCheck,
    paymentRecords: CreditCard,
    collectionTasks: WalletCards,
    shipping: Truck,
    shippingExportBatches: FileText,
    reports: BarChart3,
    settings: Settings,
  };

  return iconMap[iconName];
}

function getModuleFromNavigationItem(item: NavigationItem): MobileModuleView {
  if (
    item.href === "/fulfillment" ||
    item.href === "/orders" ||
    item.href === "/payment-records" ||
    item.href === "/collection-tasks" ||
    item.href === "/shipping" ||
    item.href === "/shipping/export-batches"
  ) {
    return {
      kind: "orders",
      title: item.title,
      description: item.description,
    };
  }

  if (item.href === "/call-recordings") {
    return {
      kind: "recordings",
      title: item.title,
      description: item.description,
    };
  }

  return {
    kind: "generic",
    title: item.title,
    description: item.description,
    href: item.href,
    iconName: item.iconName,
  };
}

function findDialCustomer(items: CustomerListItem[], dialNumber: string) {
  const normalizedDialNumber = normalizeDialValue(dialNumber);

  if (!normalizedDialNumber) {
    return null;
  }

  return (
    items.find((item) => {
      const phone = normalizeDialValue(item.phone);
      return phone === normalizedDialNumber || phone.endsWith(normalizedDialNumber);
    }) ?? null
  );
}

function filterDialCustomers(items: CustomerListItem[], query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  const normalizedPhoneQuery = normalizeDialValue(query);

  if (!normalizedQuery && !normalizedPhoneQuery) {
    return [];
  }

  return items
    .filter((item) => {
      const name = normalizeSearchValue(item.name);
      const phone = normalizeDialValue(item.phone);

      return (
        name.includes(normalizedQuery) ||
        phone.includes(normalizedPhoneQuery) ||
        normalizeSearchValue(item.owner?.name ?? "").includes(normalizedQuery)
      );
    })
    .slice(0, 5);
}

function updateBrowserTabParam(tab: MobileTab) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  params.set("tab", tab);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `/mobile?${query}` : "/mobile");
}

function MobileHeader({
  title,
  action,
  compact = false,
}: Readonly<{
  title: string;
  action?: React.ReactNode;
  compact?: boolean;
}>) {
  return (
    <header
      className={cn(
        "lbn-mobile-safe-x flex items-center justify-between",
        compact ? "pb-2 pt-1" : "pb-3 pt-1",
      )}
    >
      <h1 className="min-w-0 truncate text-[30px] font-semibold leading-none tracking-normal text-[#20242c]">
        {title}
      </h1>
      {action ? <div className="ml-3 flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

function IconBubble({
  icon: Icon,
  tone,
}: Readonly<{
  icon: MobileIcon;
  tone: "blue" | "green" | "slate" | "red" | "amber" | "violet";
}>) {
  const toneClassName = {
    blue: "bg-[#eaf3ff] text-[#1677ff]",
    green: "bg-[#e9f9ef] text-[#12b76a]",
    slate: "bg-[#eef2f6] text-[#667085]",
    red: "bg-[#fff0f2] text-[#ff4d67]",
    amber: "bg-[#fff7df] text-[#f5a400]",
    violet: "bg-[#f2edff] text-[#7755e7]",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]",
        toneClassName,
      )}
    >
      <Icon className="h-6 w-6" aria-hidden />
    </span>
  );
}

function MessageRow({
  icon,
  tone,
  title,
  value,
  onClick,
}: Readonly<{
  icon: MobileIcon;
  tone: "blue" | "green" | "slate" | "red" | "amber" | "violet";
  title: string;
  value: string;
  onClick?: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-black/5 px-[var(--lbn-mobile-x)] py-3.5 text-left last:border-b-0"
    >
      <IconBubble icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium leading-6 text-[#20242c]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-[#8b93a1]">{value}</span>
      </span>
      <ChevronRight className="h-5 w-5 text-[#c5cad3]" aria-hidden />
    </button>
  );
}

function MessagesTab({
  data,
  recentDialCustomer,
  callMode,
  canCreateCallRecord,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  data: CustomerCenterData;
  recentDialCustomer: RecentDialCustomer | null;
  callMode: MobileCallMode;
  canCreateCallRecord: boolean;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  const historyEntries = useMemo(
    () => buildPhoneHistoryEntries(data.queueItems, recentDialCustomer),
    [data.queueItems, recentDialCustomer],
  );
  const fallbackCustomers = data.queueItems.slice(0, 8);
  const [viewMode, setViewMode] = useState<"history" | "today">("history");
  const [filterOpen, setFilterOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<PhoneTimeFilterKey>("all");
  const [resultFilter, setResultFilter] = useState<PhoneResultFilterKey>("all");
  const effectiveTimeFilter = viewMode === "today" ? "today" : timeFilter;
  const filteredEntries = useMemo(
    () =>
      historyEntries.filter((entry) => {
        return (
          isDateInPhoneTimeFilter(entry.callTime, effectiveTimeFilter) &&
          (resultFilter === "all" || entry.resultFilterKey === resultFilter)
        );
      }),
    [effectiveTimeFilter, historyEntries, resultFilter],
  );
  const todayEntries = useMemo(
    () => historyEntries.filter((entry) => isDateToday(entry.callTime)),
    [historyEntries],
  );
  const todayStats = useMemo(
    () => ({
      calls: todayEntries.length,
      missed: todayEntries.filter((entry) => entry.resultFilterKey === "missed").length,
      wechatAdded: todayEntries.filter((entry) => entry.resultFilterKey === "wechat-added").length,
      refused: todayEntries.filter((entry) => entry.resultFilterKey === "wechat-refused").length,
    }),
    [todayEntries],
  );
  const activeFilterCount =
    (timeFilter === "all" ? 0 : 1) + (resultFilter === "all" ? 0 : 1);

  return (
    <section className="lbn-phone-page">
      <PhonePageHeader
        title={viewMode === "today" ? "今日数据" : "通话"}
        left={
          <button
            type="button"
            onClick={() => setViewMode((value) => (value === "history" ? "today" : "history"))}
            className="lbn-phone-nav-button lbn-phone-press h-12 px-5 text-[17px] font-medium text-black"
          >
            {viewMode === "history" ? "今日" : "全部"}
          </button>
        }
        right={
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((value) => !value)}
              className="lbn-phone-nav-button lbn-phone-press h-12 w-12 text-black"
              aria-label="通话筛选"
              aria-expanded={filterOpen}
            >
              <IoOptionsOutline className="h-7 w-7" aria-hidden />
              {activeFilterCount > 0 ? (
                <span className="lbn-phone-filter-dot" aria-hidden />
              ) : null}
            </button>
            {filterOpen ? (
              <div className="lbn-phone-filter-popover">
                <div className="text-[15px] font-semibold text-[#8e8e93]">时间</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {phoneTimeFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTimeFilter(option.value)}
                      className={cn(
                        "lbn-phone-filter-chip lbn-phone-press",
                        timeFilter === option.value && "is-active",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-5 text-[15px] font-semibold text-[#8e8e93]">结果</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {phoneResultFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setResultFilter(option.value)}
                      className={cn(
                        "lbn-phone-filter-chip lbn-phone-press",
                        resultFilter === option.value && "is-active",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTimeFilter("all");
                    setResultFilter("all");
                  }}
                  className="mt-5 h-10 w-full rounded-full text-[15px] font-medium text-[#0a84ff] active:bg-black/5"
                >
                  清除筛选
                </button>
              </div>
            ) : null}
          </div>
        }
      />

      {viewMode === "today" ? (
        <PhoneTodayPanel
          entries={todayEntries}
          stats={todayStats}
          callMode={callMode}
          canCreateCallRecord={canCreateCallRecord}
          onSelectCustomer={onSelectCustomer}
          onStartCall={onStartCall}
        />
      ) : (
        <div className="lbn-phone-list">
          {filteredEntries.length > 0 ? (
            filteredEntries.map((entry) => (
              <PhoneHistoryRow
                key={entry.id}
                entry={entry}
                callMode={callMode}
                canCreateCallRecord={canCreateCallRecord}
                onSelectCustomer={onSelectCustomer}
                onStartCall={onStartCall}
              />
            ))
          ) : historyEntries.length > 0 ? (
            <div className="px-8 py-16 text-center text-[16px] text-[#8e8e93]">
              当前筛选下没有通话记录
            </div>
          ) : (
            fallbackCustomers.map((customer) => (
              <PhoneFallbackCallRow
                key={customer.id}
                customer={customer}
                callMode={callMode}
                canCreateCallRecord={canCreateCallRecord}
                onSelectCustomer={onSelectCustomer}
                onStartCall={onStartCall}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
}

function PhoneHistoryRow({
  entry,
  callMode,
  canCreateCallRecord,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  entry: PhoneHistoryEntry;
  callMode: MobileCallMode;
  canCreateCallRecord: boolean;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  return (
    <div className="lbn-phone-call-row">
      <button
        type="button"
        onClick={() => onSelectCustomer(entry.customer)}
        className="lbn-phone-row-main lbn-phone-press flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <PhoneAvatar name={entry.title} photoUrl={entry.customer.avatarUrl} />
        <span className="min-w-0 flex-1 border-b border-[#e5e5ea] py-4">
          <span className="flex min-w-0 items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-[23px] font-semibold leading-7 text-black">
              {entry.title}
            </span>
            <span className="shrink-0 text-[20px] font-light text-[#8e8e93]">
              {entry.timeLabel}
            </span>
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[16px] leading-5 text-[#8e8e93]">
            <span className="text-[#b7b7bd]">{entry.directionMark}</span>
            <span className="lbn-phone-mode-badge">{entry.modeLabel}</span>
            <span className="truncate">{entry.resultLabel}</span>
          </span>
        </span>
      </button>
      <PhoneCircleCallButton
        label={`拨打 ${entry.title}`}
        disabled={!canCreateCallRecord}
        onClick={() => onStartCall(entry.customer, "card", callMode)}
      />
    </div>
  );
}

function PhoneFallbackCallRow({
  customer,
  callMode,
  canCreateCallRecord,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  customer: CustomerListItem;
  callMode: MobileCallMode;
  canCreateCallRecord: boolean;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  return (
    <div className="lbn-phone-call-row">
      <button
        type="button"
        onClick={() => onSelectCustomer(customer)}
        className="lbn-phone-row-main lbn-phone-press flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <PhoneAvatar name={customer.name} photoUrl={customer.avatarUrl} />
        <span className="min-w-0 flex-1 border-b border-[#e5e5ea] py-4">
          <span className="block truncate text-[23px] font-semibold leading-7 text-black">
            {customer.phone}
          </span>
          <span className="mt-1 block truncate text-[16px] leading-5 text-[#8e8e93]">
            {getCallModeLabel(callMode)} 未填写
          </span>
        </span>
      </button>
      <PhoneCircleCallButton
        label={`拨打 ${customer.name}`}
        disabled={!canCreateCallRecord}
        onClick={() => onStartCall(customer, "card", callMode)}
      />
    </div>
  );
}

function PhoneTodayPanel({
  entries,
  stats,
  callMode,
  canCreateCallRecord,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  entries: PhoneHistoryEntry[];
  stats: {
    calls: number;
    missed: number;
    wechatAdded: number;
    refused: number;
  };
  callMode: MobileCallMode;
  canCreateCallRecord: boolean;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  return (
    <div className="lbn-phone-today px-5 pb-6">
      <section className="lbn-phone-today-hero">
        <div>
          <div className="text-[15px] font-medium text-[#8e8e93]">今日通话</div>
          <div className="mt-1 text-[54px] font-light leading-none text-black tabular-nums">
            {stats.calls}
          </div>
        </div>
        <div className="text-right text-[14px] leading-5 text-[#8e8e93]">
          <div>已加微 {stats.wechatAdded}</div>
          <div>未接通 {stats.missed}</div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "未接通", value: stats.missed },
          { label: "已加微", value: stats.wechatAdded },
          { label: "拒加", value: stats.refused },
        ].map((item) => (
          <div key={item.label} className="lbn-phone-today-stat">
            <div className="text-[26px] font-light leading-none text-black tabular-nums">
              {item.value}
            </div>
            <div className="mt-1 text-[13px] font-medium text-[#8e8e93]">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 px-1 text-[15px] font-semibold text-[#8e8e93]">今日记录</div>
      <div className="lbn-phone-list -mx-5 mt-1">
        {entries.length > 0 ? (
          entries.map((entry) => (
            <PhoneHistoryRow
              key={entry.id}
              entry={entry}
              callMode={callMode}
              canCreateCallRecord={canCreateCallRecord}
              onSelectCustomer={onSelectCustomer}
              onStartCall={onStartCall}
            />
          ))
        ) : (
          <div className="px-8 py-14 text-center text-[16px] text-[#8e8e93]">
            今天还没有通话记录
          </div>
        )}
      </div>
    </div>
  );
}

function PhoneAvatar({
  name,
  size = "md",
  photoUrl = null,
}: Readonly<{
  name: string;
  size?: "sm" | "md" | "lg";
  photoUrl?: string | null;
}>) {
  const sizeClassName = {
    sm: "h-9 w-9",
    md: "h-[58px] w-[58px]",
    lg: "h-[92px] w-[92px]",
  }[size];

  return (
    <span
      className={cn(
        "lbn-phone-avatar inline-flex shrink-0 items-center justify-center rounded-full",
        sizeClassName,
      )}
      aria-label={name}
    >
      {photoUrl ? (
        <span
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${photoUrl})` }}
          aria-hidden
        />
      ) : (
        <>
          <span className="lbn-phone-avatar-head" />
          <span className="lbn-phone-avatar-body" />
        </>
      )}
    </span>
  );
}

function PhoneCircleCallButton({
  label,
  disabled,
  onClick,
}: Readonly<{
  label: string;
  disabled?: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="lbn-phone-call-button lbn-phone-press inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full text-[#198cff] disabled:text-[#c7c7cc]"
      aria-label={label}
    >
      <IoCallSharp className="h-6 w-6" aria-hidden />
    </button>
  );
}

function PhonePageHeader({
  title,
  left,
  right,
}: Readonly<{
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}>) {
  return (
    <header className="lbn-phone-header">
      <div className="flex min-w-[76px] justify-start">{left}</div>
      <h1 className="min-w-0 flex-1 truncate text-center text-[21px] font-semibold text-black">
        {title}
      </h1>
      <div className="flex min-w-[76px] justify-end">{right}</div>
    </header>
  );
}

function isCustomerExecutionClassValue(value: string): value is CustomerExecutionClassValue {
  return customerExecutionClassOptions.some((item) => item.value === value);
}

function normalizeExecutionClasses(values: readonly string[]) {
  return values.filter(isCustomerExecutionClassValue);
}

function CustomersTab({
  data,
  mobileCustomersState,
  mobileCustomersApiEnabled,
  searchText,
  callMode,
  canCreateCallRecord,
  onRefreshCustomers,
  onLoadMoreCustomers,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  data: CustomerCenterData;
  mobileCustomersState: MobileCustomersApiState;
  mobileCustomersApiEnabled: boolean;
  searchText: string;
  callMode: MobileCallMode;
  canCreateCallRecord: boolean;
  onRefreshCustomers: () => void;
  onLoadMoreCustomers: () => void;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  const fallbackItemMap = useMemo(
    () => new Map(data.queueItems.map((item) => [item.id, item])),
    [data.queueItems],
  );
  const apiItems = useMemo(
    () =>
      mobileCustomersState.items?.map((item) =>
        createMobileApiCustomerListItem(item, fallbackItemMap.get(item.id)),
      ) ?? null,
    [fallbackItemMap, mobileCustomersState.items],
  );
  const sourceItems = apiItems ?? data.queueItems;
  const localQuery = normalizeSearchValue(searchText);
  const [filterOpen, setFilterOpen] = useState(false);
  const [classFilter, setClassFilter] = useState<CustomerExecutionClassValue | "all">("all");
  const [assignedTimeFilter, setAssignedTimeFilter] = useState<PhoneTimeFilterKey>("all");
  const filteredItems = useMemo(() => {
    return sourceItems.filter((item) => {
      if (classFilter !== "all" && item.executionClass !== classFilter) {
        return false;
      }

      if (!isDateInPhoneTimeFilter(toDate(item.assignedAt), assignedTimeFilter)) {
        return false;
      }

      if (!localQuery) {
        return true;
      }

      return (
        normalizeSearchValue(item.name).includes(localQuery) ||
        normalizeSearchValue(getCustomerPrimaryProduct(item)).includes(localQuery) ||
        normalizeDialValue(item.phone).includes(normalizeDialValue(searchText)) ||
        normalizeSearchValue(getContactAddressLabel(item)).includes(localQuery)
      );
    });
  }, [assignedTimeFilter, classFilter, sourceItems, localQuery, searchText]);
  const totalCount =
    mobileCustomersState.pagination?.total ??
    (apiItems ? filteredItems.length : data.pagination.totalCount);
  const hasMore =
    mobileCustomersState.pagination?.hasMore ??
    (!apiItems && data.pagination.page < data.pagination.totalPages);
  const listCountLabel =
    mobileCustomersState.pagination?.total === null
      ? `${sourceItems.length}+ 位`
      : `${totalCount} 位`;
  const activeFilterCount =
    (classFilter === "all" ? 0 : 1) + (assignedTimeFilter === "all" ? 0 : 1);

  return (
    <section className="lbn-phone-page">
      <PhonePageHeader
        title="联系人"
        left={
          <span className="lbn-phone-header-count" aria-label={`当前客户数量 ${listCountLabel}`}>
            {mobileCustomersState.loading ? "同步中" : listCountLabel}
          </span>
        }
        right={
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen((value) => !value)}
              className="lbn-phone-nav-button lbn-phone-press h-12 w-12 text-black"
              aria-label="联系人筛选"
              aria-expanded={filterOpen}
            >
              <IoOptionsOutline className="h-7 w-7" aria-hidden />
              {activeFilterCount > 0 ? (
                <span className="lbn-phone-filter-dot" aria-hidden />
              ) : null}
            </button>
            {filterOpen ? (
              <div className="lbn-phone-filter-popover">
                <div className="text-[15px] font-semibold text-[#8e8e93]">客户阶段</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { value: "all" as const, label: "全部客户" },
                    ...customerExecutionClassOptions,
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setClassFilter(option.value)}
                      className={cn(
                        "lbn-phone-filter-chip lbn-phone-press",
                        classFilter === option.value && "is-active",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="mt-5 text-[15px] font-semibold text-[#8e8e93]">分配时间</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {phoneTimeFilterOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAssignedTimeFilter(option.value)}
                      className={cn(
                        "lbn-phone-filter-chip lbn-phone-press",
                        assignedTimeFilter === option.value && "is-active",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClassFilter("all");
                    setAssignedTimeFilter("all");
                  }}
                  className="mt-5 h-10 w-full rounded-full text-[15px] font-medium text-[#0a84ff] active:bg-black/5"
                >
                  清除筛选
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRefreshCustomers();
                    setFilterOpen(false);
                  }}
                  disabled={!mobileCustomersApiEnabled || mobileCustomersState.loading}
                  className="mt-1 h-10 w-full rounded-full text-[15px] font-medium text-[#8e8e93] active:bg-black/5 disabled:text-[#c7c7cc]"
                >
                  {mobileCustomersState.loading ? "同步中..." : "重新同步"}
                </button>
              </div>
            ) : null}
          </div>
        }
      />

      <div className="lbn-phone-list px-5">
        <div className="mb-1 flex items-center justify-end px-1 text-[13px] text-[#8e8e93]">
          {mobileCustomersState.error ? <span>同步失败</span> : null}
        </div>

        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <div key={item.id} className="lbn-phone-contact-row">
              <button
                type="button"
                onClick={() => onSelectCustomer(item)}
                className="flex min-w-0 flex-1 items-center gap-4 text-left"
              >
                <PhoneAvatar name={item.name} photoUrl={item.avatarUrl} />
                <span className="lbn-phone-contact-main">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="min-w-0 shrink-0 truncate text-[21px] font-semibold leading-7 text-black">
                      {item.name}
                    </span>
                    <span className="min-w-0 truncate text-[11px] font-medium leading-4 text-[#8e8e93]">
                      {getCustomerPrimaryProduct(item) || "未填写"}
                    </span>
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 leading-5">
                    <span className="shrink-0 text-[12px] font-medium tabular-nums text-[#8e8e93]">
                      {item.phone}
                    </span>
                    <span className="shrink-0 text-[12px] text-[#c7c7cc]">·</span>
                    <span className="min-w-0 truncate text-[15px] font-light text-[#8e8e93]">
                      {getContactAddressLabel(item)}
                    </span>
                  </span>
                </span>
              </button>
              <PhoneCircleCallButton
                label={`拨打 ${item.name}`}
                disabled={!canCreateCallRecord}
                onClick={() => onStartCall(item, "card", callMode)}
              />
            </div>
          ))
        ) : (
          <div className="px-5 py-16 text-center text-[16px] text-[#8e8e93]">
            当前通讯录暂无客户
          </div>
        )}

        {apiItems ? (
          <button
            type="button"
            onClick={onLoadMoreCustomers}
            disabled={!hasMore || mobileCustomersState.loading || mobileCustomersState.loadingMore}
            className="mt-3 h-12 w-full rounded-full text-[15px] font-medium text-[#2f80ed] disabled:text-[#c7c7cc]"
          >
            {mobileCustomersState.loadingMore
              ? "加载中..."
              : hasMore
                ? "查看更多"
                : "已显示全部"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SearchTab({
  data,
  searchText,
  setSearchText,
  callMode,
  canCreateCallRecord,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  data: CustomerCenterData;
  searchText: string;
  setSearchText: (value: string) => void;
  callMode: MobileCallMode;
  canCreateCallRecord: boolean;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  const normalizedQuery = normalizeSearchValue(searchText);
  const normalizedDialQuery = normalizeDialValue(searchText);
  const results = useMemo(() => {
    if (!normalizedQuery && !normalizedDialQuery) {
      return data.queueItems.slice(0, 12);
    }

    return data.queueItems
      .filter((item) => {
        return (
          normalizeSearchValue(item.name).includes(normalizedQuery) ||
          normalizeSearchValue(getCustomerPrimaryProduct(item)).includes(normalizedQuery) ||
          normalizeDialValue(item.phone).includes(normalizedDialQuery)
        );
      })
      .slice(0, 30);
  }, [data.queueItems, normalizedDialQuery, normalizedQuery]);

  return (
    <section className="lbn-phone-page">
      <PhonePageHeader title="搜索" />
      <div className="px-5">
        <form
          onSubmit={(event) => event.preventDefault()}
          className="lbn-phone-search-field"
        >
          <IoSearchIcon className="h-8 w-8 shrink-0 text-black" aria-hidden />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜索"
            className="min-w-0 flex-1 bg-transparent text-[24px] font-light text-black outline-none placeholder:text-[#8e8e93]"
          />
        </form>

        <div className="mt-5">
          <div className="mb-2 px-1 text-[15px] font-semibold text-[#8e8e93]">
            {searchText ? `${results.length} 个结果` : "最近联系人"}
          </div>
          <div className="lbn-phone-list -mx-1">
            {results.map((item) => (
              <div key={item.id} className="lbn-phone-contact-row">
                <button
                  type="button"
                  onClick={() => onSelectCustomer(item)}
                  className="lbn-phone-row-main lbn-phone-press flex min-w-0 flex-1 items-center gap-4 text-left"
                >
                  <PhoneAvatar name={item.name} photoUrl={item.avatarUrl} />
                  <span className="min-w-0 flex-1 border-b border-[#e5e5ea] py-4">
                    <span className="block truncate text-[22px] font-semibold leading-7 text-black">
                      {item.name}
                    </span>
                    <span className="mt-1 block truncate text-[16px] leading-5 text-[#8e8e93]">
                      {item.phone} · {getCustomerPrimaryProduct(item) || getPhoneLocationLabel(item)}
                    </span>
                  </span>
                </button>
                <PhoneCircleCallButton
                  label={`拨打 ${item.name}`}
                  disabled={!canCreateCallRecord}
                  onClick={() => onStartCall(item, "card", callMode)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DialpadTab({
  items,
  dialNumber,
  setDialNumber,
  callMode,
  onCallModeChange,
  canCreateCallRecord,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  items: CustomerListItem[];
  dialNumber: string;
  setDialNumber: (value: string) => void;
  callMode: MobileCallMode;
  onCallModeChange: (value: MobileCallMode) => void;
  canCreateCallRecord: boolean;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  const matchedCustomer = findDialCustomer(items, dialNumber);
  const suggestions = filterDialCustomers(items, dialNumber).filter(
    (item) => item.id !== matchedCustomer?.id,
  );
  const previewCustomer = matchedCustomer ?? suggestions[0] ?? null;
  const displayNumber = formatDialDisplayNumber(dialNumber);
  const normalizedNumber = normalizeDialValue(dialNumber);
  const previewProductSignal = previewCustomer
    ? getCustomerDialProductSignal(previewCustomer)
    : null;
  const previewPhoneDisplay = previewCustomer
    ? splitDialMatchedDisplay(previewCustomer.phone, dialNumber)
    : null;
  const [linePickerOpen, setLinePickerOpen] = useState(false);

  function appendDialValue(value: string) {
    setDialNumber(`${dialNumber}${value}`);
  }

  function startDial(mode: MobileCallMode) {
    if (!normalizedNumber) {
      return;
    }

    if (matchedCustomer && canCreateCallRecord) {
      onStartCall(matchedCustomer, "card", mode);
      return;
    }

    window.location.assign(`tel:${normalizedNumber}`);
  }

  function startPrimaryDial() {
    startDial(callMode);
  }

  return (
    <section className="lbn-mobile-dialpad-page">
      <header className="lbn-mobile-dialpad-header">
        <div className="relative">
          <button
            type="button"
            onClick={() => setLinePickerOpen((value) => !value)}
            className="lbn-phone-line-switch lbn-phone-press"
            aria-label="切换呼叫线路"
            aria-expanded={linePickerOpen}
          >
            <span className="lbn-phone-line-chip">
              {callMode === "crm-outbound" ? "外呼" : "本机"}
            </span>
            <span className="lbn-phone-line-chevrons" aria-hidden>
              <span />
              <span />
            </span>
          </button>
          {linePickerOpen ? (
            <div className="lbn-phone-line-popover">
              <p className="px-5 pb-3 pt-4 text-[16px] text-[#8e8e93]">
                选择现在要使用的线路。
              </p>
              {[
                { value: "crm-outbound" as const, label: "使用外呼" },
                { value: "local-phone" as const, label: "使用本机" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onCallModeChange(option.value);
                    setLinePickerOpen(false);
                  }}
                  className="lbn-phone-popover-option lbn-phone-press flex w-full items-center gap-3 px-5 py-3 text-left"
                >
                  <span className="w-5 text-[24px] leading-none text-black">
                    {callMode === option.value ? "✓" : ""}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[21px] font-medium leading-6 text-black">
                      {option.label}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "lbn-phone-cti-dot",
            canCreateCallRecord ? "is-ready" : "is-offline",
          )}
          role="status"
          aria-label={canCreateCallRecord ? "CTI Ready" : "CTI Offline"}
        />
      </header>

      <div className="lbn-mobile-dialpad-display">
        {displayNumber ? (
          <div className="lbn-mobile-dial-display-number">
            {displayNumber}
          </div>
        ) : (
          <div className="h-[64px]" aria-hidden />
        )}

        {dialNumber && previewCustomer && previewPhoneDisplay ? (
          <button
            type="button"
            onClick={() => onSelectCustomer(previewCustomer)}
            className="lbn-phone-match-card lbn-phone-press"
          >
            <PhoneAvatar name={previewCustomer.name} size="sm" photoUrl={previewCustomer.avatarUrl} />
            <span className="min-w-0 flex-1 truncate text-[20px] font-light text-[#8e8e93]">
              {previewCustomer.name}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[20px] font-light">
              <span className="text-black">{previewPhoneDisplay.matched}</span>
              <span className="text-[#8e8e93]">{previewPhoneDisplay.rest}</span>
            </span>
          </button>
        ) : null}

        {dialNumber && previewProductSignal ? (
          <div className="lbn-phone-dial-product" title={previewProductSignal.value}>
            <span>{previewProductSignal.label}</span>
            <strong>{previewProductSignal.value}</strong>
          </div>
        ) : null}
      </div>

      <div className="lbn-mobile-ios-dialpad" aria-label="拨号键盘">
        {keypadRows.map((row) => (
          <div
            key={row.map((item) => item.value).join("")}
            className="grid grid-cols-3 justify-items-center gap-x-[var(--lbn-mobile-ios-key-gap-x)] gap-y-[var(--lbn-mobile-ios-key-gap-y)]"
          >
            {row.map((key) => (
              <button
                key={key.value}
                type="button"
                onClick={() => appendDialValue(key.value)}
                className="lbn-mobile-ios-key lbn-phone-press flex flex-col items-center justify-center rounded-full text-black"
              >
                <span className="lbn-mobile-ios-key-number tabular-nums">
                  {key.value}
                </span>
                <span className="lbn-mobile-ios-key-letters">
                  {key.letters}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="lbn-mobile-ios-actions">
        <div aria-hidden />
        <button
          type="button"
          onClick={startPrimaryDial}
          disabled={!normalizedNumber}
          className="lbn-mobile-ios-call-button lbn-phone-press mx-auto inline-flex items-center justify-center rounded-full bg-[#34c759] text-white disabled:bg-[#d1d5db] disabled:shadow-none"
          aria-label="拨打电话"
        >
          <IoCall className="h-10 w-10" aria-hidden />
        </button>
        <div className="flex items-center justify-center">
          {dialNumber ? (
            <button
              type="button"
              onClick={() => setDialNumber(dialNumber.slice(0, -1))}
              className="lbn-phone-press inline-flex h-12 w-12 items-center justify-center rounded-full text-[#8e8e93]"
              aria-label="删除一位号码"
            >
              <IoBackspace className="h-8 w-8" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        当前线路为 {callMode === "crm-outbound" ? "外呼" : "本机"}
      </div>
    </section>
  );
}

function AppTile({
  icon: Icon,
  label,
  tone,
  onClick,
}: Readonly<{
  icon: MobileIcon;
  label: string;
  tone: "blue" | "green" | "red" | "amber" | "violet" | "slate";
  onClick: () => void;
}>) {
  return (
    <button type="button" onClick={onClick} className="min-w-0 text-center">
      <IconBubble icon={Icon} tone={tone} />
      <span className="mt-2 block truncate text-[15px] font-medium text-[#20242c]">
        {label}
      </span>
    </button>
  );
}

function AppSection({
  title,
  children,
}: Readonly<{
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-[22px] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(16,24,40,0.04)]">
      <h2 className="text-[20px] font-semibold text-[#20242c]">{title}</h2>
      <div className="mt-5 grid grid-cols-4 gap-x-4 gap-y-6">{children}</div>
    </section>
  );
}

function OrderCustomerMiniRow({
  customer,
  onClick,
}: Readonly<{
  customer: CustomerListItem;
  onClick: () => void;
}>) {
  const product = getCustomerPrimaryProduct(customer) || customer.latestPurchasedProduct || "暂无商品";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-black/5 px-5 py-3.5 text-left last:border-b-0"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf3ff] text-[14px] font-semibold text-[#1677ff]">
        {customer.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-[15px] font-semibold text-[#20242c]">
            {customer.name}
          </span>
          <span className="shrink-0 text-[12px] text-[#98a1af]">
            {customer.approvedTradeOrderCount} 单
          </span>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[#667085]">
          {product} · ¥{formatMoney(customer.lifetimeTradeAmount)}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-[#c5cad3]" aria-hidden />
    </button>
  );
}

function AppsTab({
  data,
  canAccessCallRecordings,
  openCustomers,
  openDialpad,
  openMessages,
  onOpenModule,
  onOpenOrder,
}: Readonly<{
  data: CustomerCenterData;
  canAccessCallRecordings: boolean;
  openCustomers: (queue?: string) => void;
  openDialpad: () => void;
  openMessages: () => void;
  onOpenModule: (module: MobileModuleView) => void;
  onOpenOrder: (customer: CustomerListItem) => void;
}>) {
  const orderCustomers = data.queueItems
    .filter((item) => {
      return (
        item.approvedTradeOrderCount > 0 ||
        Number(item.lifetimeTradeAmount) > 0 ||
        Boolean(getCustomerPrimaryProduct(item))
      );
    })
    .slice(0, 5);
  const visibleRevenue = data.queueItems.reduce(
    (sum, item) => sum + Number(item.lifetimeTradeAmount || 0),
    0,
  );
  const orderModule = {
    kind: "orders",
    title: "订单中心",
    description: "交易单、收款、催收和履约入口。",
  } satisfies MobileModuleView;
  const executionRows: Array<{
    title: string;
    description: string;
    icon: MobileIcon;
    onClick: () => void;
  }> = [
    {
      title: "交易单",
      description: "查看审核状态、成交金额与供应商拆单结果。",
      icon: PackageCheck,
      onClick: () => onOpenModule(orderModule),
    },
    {
      title: "收款",
      description: "跟进定金、尾款、到付与收款确认。",
      icon: CreditCard,
      onClick: () =>
        onOpenModule({
          kind: "orders",
          title: "收款记录",
          description: "查看收款提交、确认与驳回结果。",
        }),
    },
    {
      title: "履约",
      description: "查看发货执行、物流节点和异常跟进。",
      icon: Truck,
      onClick: () =>
        onOpenModule({
          kind: "orders",
          title: "发货履约",
          description: "查看发货执行、批次和物流跟进。",
        }),
    },
    {
      title: "质检",
      description: "回看通话录音、AI 摘要和风险信号。",
      icon: ShieldCheck,
      onClick: () =>
        canAccessCallRecordings
          ? onOpenModule({
              kind: "recordings",
              title: "录音质检",
              description: "筛选录音、回看 AI 总结和质检信号。",
            })
          : openMessages(),
    },
  ];

  return (
    <section>
      <MobileHeader
        title="订单"
        action={
          <button
            type="button"
            onClick={() => openCustomers()}
            className="inline-flex h-10 items-center rounded-full bg-[#1677ff] px-3 text-[13px] font-semibold text-white shadow-[0_12px_22px_rgba(22,119,255,0.18)]"
          >
            <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden />
            客户建单
          </button>
        }
      />
      <div className="lbn-mobile-safe-x lbn-mobile-stack">
        <div className="lbn-mobile-card-radius overflow-hidden bg-[#20242c] text-white shadow-[0_18px_42px_rgba(16,24,40,0.18)]">
          <div className="px-[var(--lbn-mobile-x)] py-[var(--lbn-mobile-gap)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-white/45">
                  Trade Console
                </div>
                <h2 className="mt-1 text-[21px] font-semibold leading-7">移动成交台</h2>
                <p className="mt-1 text-[12px] leading-5 text-white/58">
                  从客户意向直接进入下单、收款与履约跟进。
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenModule(orderModule)}
                className="inline-flex h-9 shrink-0 items-center rounded-full bg-white/10 px-3 text-[12px] font-semibold text-white"
              >
                总览
              </button>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-[var(--lbn-mobile-gap-sm)]">
              {[
                { label: "客户", value: data.summary.customerCount },
                {
                  label: "成交客户",
                  value: data.queueItems.filter((item) => item.approvedTradeOrderCount > 0)
                    .length,
                },
                { label: "成交额", value: formatCurrencyAmount(visibleRevenue) },
              ].map((item) => (
                <div
                  key={item.label}
                  className="lbn-mobile-control-radius min-w-0 border border-white/10 bg-white/[0.07] px-3 py-3"
                >
                  <div className="truncate text-[18px] font-semibold tabular-nums text-white">
                    {item.value}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-white/48">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 border-t border-white/10 bg-white/[0.04]">
            {[
              { label: "建单", icon: ClipboardList, onClick: () => openCustomers() },
              { label: "外呼", icon: PhoneCall, onClick: openDialpad },
              {
                label: "催收",
                icon: WalletCards,
                onClick: () =>
                  onOpenModule({
                    kind: "orders",
                    title: "催收任务",
                    description: "跟进尾款、COD 和运费催收任务。",
                  }),
              },
              {
                label: "商品",
                icon: Package,
                onClick: () =>
                  onOpenModule({
                    kind: "generic",
                    title: "商品中心",
                    description: "维护商品、SKU 和供应商相关主数据。",
                    href: "/products",
                    iconName: "products",
                  }),
              },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.onClick}
                  className="flex min-h-[var(--lbn-mobile-dial-key-height)] flex-col items-center justify-center gap-1 border-r border-white/10 text-[12px] font-semibold text-white/82 last:border-r-0"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="lbn-mobile-card-radius overflow-hidden bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
          <div className="flex items-center justify-between border-b border-black/5 px-[var(--lbn-mobile-x)] py-[var(--lbn-mobile-gap)]">
            <div>
              <h2 className="text-[18px] font-semibold text-[#20242c]">优先建单客户</h2>
              <p className="mt-0.5 text-[12px] text-[#98a1af]">有意向、复购或成交信号的客户</p>
            </div>
            <button
              type="button"
              onClick={() => openCustomers()}
              className="text-[12px] font-semibold text-[#1677ff]"
            >
              全部
            </button>
          </div>
          {orderCustomers.length > 0 ? (
            orderCustomers.map((customer) => (
              <OrderCustomerMiniRow
                key={customer.id}
                customer={customer}
                onClick={() => onOpenOrder(customer)}
              />
            ))
          ) : (
            <div className="px-[var(--lbn-mobile-x)] py-8 text-center text-[14px] text-[#98a1af]">
              当前范围暂无意向或成交客户
            </div>
          )}
        </div>

        <div className="lbn-mobile-card-radius overflow-hidden bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
          <div className="border-b border-black/5 px-[var(--lbn-mobile-x)] py-[var(--lbn-mobile-gap)]">
            <h2 className="text-[18px] font-semibold text-[#20242c]">执行入口</h2>
            <p className="mt-0.5 text-[12px] text-[#98a1af]">保留工作台密度，不做图标宫格</p>
          </div>
          <div className="divide-y divide-black/[0.05]">
            {executionRows.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={item.onClick}
                  className="flex w-full items-center gap-3 px-[var(--lbn-mobile-x)] py-3.5 text-left active:bg-[#f7f8fb]"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f2f8ff] text-[#1677ff]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[#20242c]">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#667085]">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-[#c5cad3]" aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ConnectionSettingsDrawer({
  profile,
  onClose,
  onSaved,
}: Readonly<{
  profile: NativeConnectionProfile | null;
  onClose: () => void;
  onSaved: (profile: NativeConnectionProfile) => void;
}>) {
  const [serverUrl, setServerUrl] = useState(
    profile?.serverUrl ?? profile?.defaultServerUrl ?? "https://crm.cclbn.com/mobile",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function testCurrentConnection() {
    setPending(true);
    setMessage("正在检测连接...");

    try {
      const result = await testNativeConnection(serverUrl);
      setMessage(
        result.ok
          ? `连接正常，HTTP ${result.status ?? 200}`
          : result.message ?? `连接失败，HTTP ${result.status ?? 0}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "连接检测失败。");
    } finally {
      setPending(false);
    }
  }

  async function saveAndReload() {
    setPending(true);
    setMessage("正在保存代理地址...");

    try {
      const nextProfile = await saveNativeConnectionProfile(serverUrl);
      onSaved(nextProfile);
      setMessage("已保存，正在重新连接 CRM。");
      await reloadNativeApp();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "代理地址保存失败。");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[74] md:hidden">
      <button
        type="button"
        aria-label="关闭连接设置"
        onClick={onClose}
        className="absolute inset-0 bg-black/28 backdrop-blur-[8px]"
      />
      <section className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#f7f8fb] px-5 pb-6 pt-4 shadow-[0_-22px_60px_rgba(16,24,40,0.18)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d0d5dd]" />

        <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(16,24,40,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#98a1af]">
                Proxy
              </p>
              <h2 className="mt-1 text-[22px] font-semibold text-[#20242c]">
                连接代理
              </h2>
              <p className="mt-2 text-[13px] leading-5 text-[#667085]">
                手机不在公司 WiFi 时填写公网 HTTPS 代理入口，入口需反代到 CRM 服务器。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f2f4f7] text-[#667085]"
              aria-label="关闭"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <label className="mt-5 grid gap-2 text-[13px] font-medium text-[#667085]">
            CRM / 代理地址
            <input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="https://crm.cclbn.com/mobile"
              className="h-12 rounded-[16px] border border-black/5 bg-[#fbfcfe] px-3 text-[15px] text-[#20242c] outline-none"
            />
          </label>

          {message ? (
            <p className="mt-3 rounded-[14px] bg-[#f7f8fb] px-3 py-2 text-[12px] leading-5 text-[#667085]">
              {message}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={testCurrentConnection}
              className="h-12 rounded-[16px] bg-[#eaf3ff] text-[15px] font-semibold text-[#1677ff] disabled:opacity-60"
            >
              检测
            </button>
            <button
              type="button"
              disabled={pending || !serverUrl.trim()}
              onClick={saveAndReload}
              className="h-12 rounded-[16px] bg-[#1677ff] text-[15px] font-semibold text-white shadow-[0_14px_28px_rgba(22,119,255,0.22)] disabled:bg-[#d0d5dd] disabled:shadow-none"
            >
              保存并重连
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function NativeRecorderCard({
  readiness,
  checking,
  initializing,
  onRefresh,
  onRequestPermissions,
  onOpenDialpad,
}: Readonly<{
  readiness: NativeRecorderReadiness;
  checking: boolean;
  initializing: boolean;
  onRefresh: () => void;
  onRequestPermissions: () => void;
  onOpenDialpad: () => void;
}>) {
  const ready = readiness.status === "ready";
  const blocked = readiness.status === "blocked";
  const needsSetup = readiness.nativeAvailable && !ready;
  const statusLabel = checking
    ? "检测中"
    : ready
      ? "就绪"
      : blocked
        ? "受限"
        : needsSetup
          ? "待授权"
          : "回退";

  return (
    <section className="mt-5 rounded-[22px] bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]",
            ready
              ? "bg-[#e9f9ef] text-[#12b76a]"
              : blocked
                ? "bg-[#fff0f2] text-[#ff4d67]"
                : "bg-[#eaf3ff] text-[#1677ff]",
          )}
        >
          <Mic className="h-6 w-6" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[17px] font-semibold text-[#20242c]">
              原生外呼检测
            </h2>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                ready
                  ? "bg-[#e9f9ef] text-[#12b76a]"
                  : blocked
                    ? "bg-[#fff0f2] text-[#ff4d67]"
                    : "bg-[#f2f8ff] text-[#1677ff]",
              )}
            >
              {statusLabel}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-[#667085]">
            {checking ? "正在读取 Android 原生插件与权限状态。" : readiness.description}
          </p>
        </div>
      </div>

      {readiness.detail ? (
        <div className="mt-3 flex items-center gap-2 rounded-[16px] bg-[#f7f8fb] px-3 py-2 text-[12px] text-[#667085]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#98a1af]" aria-hidden />
          <span className="min-w-0 truncate">{readiness.detail}</span>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {needsSetup ? (
          <button
            type="button"
            disabled={checking || initializing}
            onClick={onRequestPermissions}
            className="inline-flex h-11 items-center justify-center rounded-[15px] bg-[#1677ff] px-3 text-[14px] font-semibold text-white shadow-[0_12px_24px_rgba(22,119,255,0.22)] disabled:bg-[#d0d5dd] disabled:shadow-none"
          >
            {initializing ? "授权中..." : "授权并检测"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenDialpad}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[15px] bg-[#1677ff] px-3 text-[14px] font-semibold text-white shadow-[0_12px_24px_rgba(22,119,255,0.22)]"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            去拨号
          </button>
        )}

        <button
          type="button"
          disabled={checking || initializing}
          onClick={onRefresh}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-[15px] bg-[#f2f4f7] px-3 text-[14px] font-semibold text-[#475467] disabled:opacity-60"
        >
          <RefreshCw
            className={cn("h-4 w-4", checking ? "animate-spin" : "")}
            aria-hidden
          />
          {checking ? "检测中" : "重新检测"}
        </button>
      </div>
    </section>
  );
}

function MeTab({
  user,
  data,
  nativeRecorderReadiness,
  nativeRecorderChecking,
  nativeRecorderInitializing,
  navigationGroups,
  openMessages,
  openCustomers,
  openDialpad,
  onRefreshNativeRecorder,
  onRequestNativeRecorderPermissions,
  onOpenModule,
}: Readonly<{
  user: MobileCurrentUser;
  data: CustomerCenterData;
  nativeRecorderReadiness: NativeRecorderReadiness;
  nativeRecorderChecking: boolean;
  nativeRecorderInitializing: boolean;
  navigationGroups: NavigationGroup[];
  openMessages: () => void;
  openCustomers: (queue?: string) => void;
  openDialpad: () => void;
  onRefreshNativeRecorder: () => void;
  onRequestNativeRecorderPermissions: () => void;
  onOpenModule: (module: MobileModuleView) => void;
}>) {
  const [connectionProfile, setConnectionProfile] =
    useState<NativeConnectionProfile | null>(null);
  const [connectionDrawerOpen, setConnectionDrawerOpen] = useState(false);

  useEffect(() => {
    let canceled = false;

    void readNativeConnectionProfile().then((profile) => {
      if (!canceled) {
        setConnectionProfile(profile);
      }
    });

    return () => {
      canceled = true;
    };
  }, []);

  const profileRows = [
    {
      icon: UserRound,
      tone: "blue" as const,
      title: "个人资料",
      value: user.username,
      onClick: undefined,
    },
    {
      icon: BarChart3,
      tone: "red" as const,
      title: "统计",
      value: `${data.summary.customerCount} 位客户`,
      onClick: openMessages,
    },
    {
      icon: Settings,
      tone: "slate" as const,
      title: "设置",
      value: user.roleName || roleMobileLabels[user.role],
      onClick: () =>
        onOpenModule({
          kind: "generic",
          title: "设置中心",
          description: "账号、团队、标签、字典和通话结果统一入口。",
          href: "/settings",
          iconName: "settings",
        }),
    },
    {
      icon: PhoneCall,
      tone: "amber" as const,
      title: "外呼助手",
      value: nativeRecorderChecking ? "检测中" : nativeRecorderReadiness.title,
      onClick: openDialpad,
    },
    {
      icon: SlidersHorizontal,
      tone: "violet" as const,
      title: "连接代理",
      value: connectionProfile?.serverUrl ?? "公网代理/服务器入口",
      onClick: () => setConnectionDrawerOpen(true),
    },
  ];

  function openNavigationItem(item: NavigationItem) {
    if (item.href === "/dashboard") {
      openMessages();
      return;
    }

    if (item.href === "/customers") {
      openCustomers();
      return;
    }

    onOpenModule(getModuleFromNavigationItem(item));
  }

  return (
    <section>
      <MobileHeader title="我的" />

      <div className="px-5">
        <div className="rounded-[24px] bg-white px-5 py-6 shadow-[0_16px_36px_rgba(16,24,40,0.055)]">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#eaf3ff] text-[#1677ff]">
              <UserRound className="h-9 w-9" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-[24px] font-semibold text-[#20242c]">
                {user.name || user.username}
              </h2>
              <div className="mt-1 flex min-w-0 flex-wrap gap-2">
                <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[12px] text-[#667085]">
                  {user.roleName || roleMobileLabels[user.role]}
                </span>
                {user.teamName ? (
                  <span className="max-w-[140px] truncate rounded-full bg-[#f2f8ff] px-2.5 py-1 text-[12px] text-[#1677ff]">
                    {user.teamName}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: "客户", value: data.summary.customerCount },
              { label: "待首呼", value: data.summary.pendingFirstCallCount },
              { label: "待回访", value: data.summary.pendingFollowUpCount },
            ].map((item) => (
              <div key={item.label} className="rounded-[16px] bg-[#f7f8fb] px-3 py-3">
                <div className="text-[22px] font-semibold text-[#20242c]">{item.value}</div>
                <div className="mt-1 text-[12px] text-[#98a1af]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[22px] bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
          {profileRows.map((row) => (
            <MessageRow
              key={row.title}
              icon={row.icon}
              tone={row.tone}
              title={row.title}
              value={row.value}
              onClick={row.onClick}
            />
          ))}
        </div>

        <NativeRecorderCard
          readiness={nativeRecorderReadiness}
          checking={nativeRecorderChecking}
          initializing={nativeRecorderInitializing}
          onRefresh={onRefreshNativeRecorder}
          onRequestPermissions={onRequestNativeRecorderPermissions}
          onOpenDialpad={openDialpad}
        />

        <div className="mt-5 grid gap-4">
          {navigationGroups.map((group) => (
            <section
              key={group.key}
              className="overflow-hidden rounded-[22px] bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]"
            >
              <div className="border-b border-black/5 px-5 py-4">
                <h2 className="text-[18px] font-semibold text-[#20242c]">{group.title}</h2>
                <p className="mt-1 line-clamp-1 text-[12px] text-[#98a1af]">
                  {group.description}
                </p>
              </div>
              {group.sections.flatMap((section) => section.items).map((item) => (
                <MessageRow
                  key={`${group.key}-${item.href}`}
                  icon={getNavigationIcon(item.iconName)}
                  tone="slate"
                  title={item.title}
                  value={item.description}
                  onClick={() => openNavigationItem(item)}
                />
              ))}
            </section>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          className="mt-5 h-12 w-full rounded-[16px] bg-white text-[15px] font-semibold text-[#d92d20] shadow-[0_10px_24px_rgba(16,24,40,0.04)]"
        >
          退出登录
        </button>
      </div>

      {connectionDrawerOpen ? (
        <ConnectionSettingsDrawer
          profile={connectionProfile}
          onClose={() => setConnectionDrawerOpen(false)}
          onSaved={setConnectionProfile}
        />
      ) : null}
    </section>
  );
}

function CustomerDetailDrawer({
  customer,
  callMode,
  onCallModeChange,
  callResultOptions,
  canCreateCallRecord,
  onStartCall,
  onOpenOrder,
  onAvatarUpdated,
  onRemarkUpdated,
  onClose,
}: Readonly<{
  customer: CustomerListItem | null;
  callMode: MobileCallMode;
  onCallModeChange: (value: MobileCallMode) => void;
  callResultOptions: readonly CallResultOption[];
  canCreateCallRecord: boolean;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
  onOpenOrder: (customer: CustomerListItem) => void;
  onAvatarUpdated: (customerId: string, avatarUrl: string | null) => void;
  onRemarkUpdated: (customerId: string, remark: string | null) => void;
  onClose: () => void;
}>) {
  const [detailState, setDetailState] = useState<{
    customerId: string;
    detail: MobileCustomerDetail | null;
    error: string | null;
  } | null>(null);
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [callHistoryExpanded, setCallHistoryExpanded] = useState(false);
  const [customerPhotoUrl, setCustomerPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [remarkEditing, setRemarkEditing] = useState(false);
  const [remarkDraft, setRemarkDraft] = useState("");
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [remarkError, setRemarkError] = useState<string | null>(null);
  const detailSectionRef = useRef<HTMLDivElement>(null);
  const customerId = customer?.id ?? null;

  useEffect(() => {
    if (!customerId) {
      return;
    }

    let canceled = false;

    void fetchMobileCustomerDetail(customerId)
      .then((payload) => {
        if (canceled) {
          return;
        }

        setDetailState({
          customerId,
          detail: payload.customer,
          error: null,
        });
        setCustomerPhotoUrl(
          payload.customer.avatarUrl ?? customer?.avatarUrl ?? readStoredCustomerPhoto(customerId),
        );
      })
      .catch((error) => {
        if (canceled) {
          return;
        }

        setDetailState({
          customerId,
          detail: null,
          error: error instanceof Error ? error.message : "客户详情加载失败。",
        });
      });

    return () => {
      canceled = true;
    };
  }, [customer?.avatarUrl, customerId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!customerId) {
        setCustomerPhotoUrl(null);
        setRemarkDraft("");
        setRemarkEditing(false);
        setRemarkError(null);
        setRemarkSaving(false);
        return;
      }

      setCustomerPhotoUrl(customer?.avatarUrl ?? readStoredCustomerPhoto(customerId));
      setPhotoError(null);
      setPhotoUploading(false);
      setCallHistoryExpanded(false);
      setLinePickerOpen(false);
      setRemarkError(null);
      setRemarkSaving(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [customer?.avatarUrl, customerId]);

  const detailRemarkForSync =
    detailState?.customerId === customerId ? detailState.detail?.profile.remark : undefined;

  useEffect(() => {
    if (!customerId || remarkEditing) {
      return;
    }

    const syncedRemark =
      detailRemarkForSync !== undefined ? detailRemarkForSync ?? "" : customer?.remark ?? "";

    setRemarkDraft(syncedRemark);
  }, [customer?.remark, customerId, detailRemarkForSync, remarkEditing]);

  if (!customer) {
    return null;
  }

  const activeDetailState =
    detailState?.customerId === customer.id ? detailState : null;
  const detail = activeDetailState?.detail ?? null;
  const detailError = activeDetailState?.error ?? null;
  const detailLoading = !activeDetailState;
  const addressLabel = getCustomerDetailAddressLabel(customer, detail);
  const displayPhone = detail?.phone ?? customer.phone;
  const displayRemark = detail ? detail.profile.remark : customer.remark;
  const assignmentLabel = getCustomerAssignmentLabel(customer, detail);
  const productSignal = getCustomerDialProductSignal(customer);
  const callResultLabelMap = new Map(
    callResultOptions.map((option) => [option.value, option.label]),
  );
  const detailCallRecords = detail
    ? detail.timeline.callRecords.map((record) => {
        const resolvedCode = record.resultCode?.trim() || record.result || null;

        return {
          ...record,
          resultLabel: resolvedCode
            ? callResultLabelMap.get(resolvedCode) ?? resolvedCode
            : "未填写",
        };
      })
    : customer.callRecords;
  const latestCall = detailCallRecords[0] ?? null;
  const visibleCallRecords = callHistoryExpanded
    ? detailCallRecords
    : detailCallRecords.slice(0, 1);
  const callSummary = latestCall
    ? `${getCallModeLabel(latestCall.callSource)} ${getPhoneResultLabel(latestCall)} · ${formatNullableRelativeDate(latestCall.callTime)}`
    : "暂无记录";

  function startCall(mode: MobileCallMode) {
    if (!canCreateCallRecord || !customer) {
      return;
    }

    onStartCall(customer, "detail", mode);
  }

  function startPreferredCall() {
    startCall(callMode);
  }

  function sendSms() {
    const phone = displayPhone.trim().replace(/\s+/g, "");

    if (!phone || isMaskedPhone(phone)) {
      return;
    }

    window.location.assign(`sms:${phone}`);
  }

  function openOrder() {
    if (!customer) {
      return;
    }

    onOpenOrder(customer);
    onClose();
  }

  function scrollToDetails() {
    detailSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function handleCustomerPhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    const activeCustomerId = customer?.id ?? null;

    if (!file || !activeCustomerId) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setPhotoError("请选择图片文件。");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("照片不能超过 2MB。");
      return;
    }

    const previousPhotoUrl = customerPhotoUrl;
    setPhotoUploading(true);

    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      setCustomerPhotoUrl(dataUrl);
      const payload = await uploadMobileCustomerAvatar(activeCustomerId, file);
      setCustomerPhotoUrl(payload.customer.avatarUrl);
      onAvatarUpdated(activeCustomerId, payload.customer.avatarUrl);
      setDetailState((current) => {
        if (current?.customerId !== activeCustomerId || !current.detail) {
          return current;
        }

        return {
          ...current,
          detail: {
            ...current.detail,
            avatarUrl: payload.customer.avatarUrl,
          },
        };
      });
      setPhotoError(null);
    } catch (error) {
      setCustomerPhotoUrl(previousPhotoUrl);
      setPhotoError(error instanceof Error ? error.message : "照片上传失败。");
    } finally {
      setPhotoUploading(false);
    }
  }

  function startRemarkEditing() {
    setRemarkDraft(displayRemark ?? "");
    setRemarkError(null);
    setRemarkEditing(true);
  }

  async function saveRemark() {
    const activeCustomerId = customer?.id;

    if (!activeCustomerId) {
      return;
    }

    const nextRemark = remarkDraft.trim();

    setRemarkSaving(true);
    setRemarkError(null);

    try {
      const payload = await updateMobileCustomerRemark(activeCustomerId, nextRemark);
      const savedRemark = payload.customer.remark;

      setDetailState((current) => {
        if (current?.customerId !== activeCustomerId || !current.detail) {
          return current;
        }

        return {
          ...current,
          detail: {
            ...current.detail,
            profile: {
              ...current.detail.profile,
              remark: savedRemark,
            },
          },
        };
      });
      onRemarkUpdated(activeCustomerId, savedRemark);
      setRemarkDraft(savedRemark ?? "");
      setRemarkEditing(false);
    } catch (error) {
      setRemarkError(error instanceof Error ? error.message : "备注保存失败。");
    } finally {
      setRemarkSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[62] bg-[#d8e2ef]">
      <section className="lbn-phone-contact-detail">
        <header className="flex shrink-0 items-center justify-between px-5 pb-4 pt-[max(18px,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onClose}
            className="lbn-phone-detail-control lbn-phone-press inline-flex h-12 w-12 items-center justify-center rounded-full text-white"
            aria-label="返回通讯录"
          >
            <IoChevronBack className="h-8 w-8" aria-hidden />
          </button>
          <span
            className={cn("lbn-phone-cti-dot", canCreateCallRecord && "is-ready")}
            role="status"
            aria-label={canCreateCallRecord ? "通话可用" : "通话不可用"}
            title={canCreateCallRecord ? "通话可用" : "通话不可用"}
          />
        </header>

        <div className="lbn-mobile-scrollbar-none min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(112px+env(safe-area-inset-bottom))]">
          <div className="flex flex-col items-center pt-12 text-center text-white">
            <PhoneAvatar name={customer.name} size="lg" photoUrl={customerPhotoUrl} />
            <div className="relative mt-8">
              <button
                type="button"
                onClick={() => setLinePickerOpen((value) => !value)}
                className="lbn-phone-detail-line-switch lbn-phone-press"
                aria-expanded={linePickerOpen}
              >
                <span>始终使用：</span>
                <strong>{callMode === "crm-outbound" ? "外呼" : "本机"}</strong>
              </button>
              {linePickerOpen ? (
                <div className="lbn-phone-line-popover lbn-phone-detail-line-popover">
                  {[
                    { value: "crm-outbound" as const, label: "外呼" },
                    { value: "local-phone" as const, label: "本机" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onCallModeChange(option.value);
                        setLinePickerOpen(false);
                      }}
                      className="lbn-phone-popover-option lbn-phone-press flex w-full items-center gap-3 px-5 py-3 text-left"
                    >
                      <span className="w-5 text-[24px] leading-none text-black">
                        {callMode === option.value ? "✓" : ""}
                      </span>
                      <span className="block text-[21px] font-medium leading-6 text-black">
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <h2 className="mt-2 max-w-full truncate text-[42px] font-semibold leading-tight">
              {customer.name}
            </h2>
            <div className="mt-8 grid w-full grid-cols-4 gap-4">
              <button
                type="button"
                disabled={!displayPhone || isMaskedPhone(displayPhone)}
                onClick={sendSms}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white disabled:opacity-45"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <IoChatbubble className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">信息</span>
              </button>
              <button
                type="button"
                disabled={!canCreateCallRecord}
                onClick={startPreferredCall}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white disabled:opacity-45"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <IoCall className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">通话</span>
              </button>
              <button
                type="button"
                onClick={openOrder}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <ClipboardList className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">下单</span>
              </button>
              <button
                type="button"
                onClick={scrollToDetails}
                className="lbn-phone-press flex min-w-0 flex-col items-center gap-2 text-white"
              >
                <span className="lbn-phone-detail-action inline-flex h-16 w-16 items-center justify-center rounded-full">
                  <FileText className="h-7 w-7" aria-hidden />
                </span>
                <span className="truncate text-[12px]">详情</span>
              </button>
            </div>
          </div>

          <label className="lbn-phone-glass-card lbn-phone-press mt-6 block cursor-pointer overflow-hidden rounded-[28px] text-white">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleCustomerPhotoChange}
            />
            <span className="flex items-center gap-3 px-5 py-5">
              <PhoneAvatar name={customer.name} size="sm" photoUrl={customerPhotoUrl} />
              <span className="min-w-0 flex-1 truncate text-[22px]">联系人照片与海报</span>
              <span className="text-[15px] text-white/72">
                {photoUploading ? "上传中" : customerPhotoUrl ? "更换" : "上传"}
              </span>
              <ChevronRight className="h-7 w-7" aria-hidden />
            </span>
            {photoError ? (
              <span className="block border-t border-white/14 px-5 py-3 text-left text-[13px] text-white/74">
                {photoError}
              </span>
            ) : null}
          </label>

          <div className="lbn-phone-glass-card mt-4 rounded-[28px] px-5 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[18px] text-white/86">电话</div>
                <div className="mt-1 text-[24px] font-light">{displayPhone}</div>
                <div className="mt-3 max-w-[13rem] break-words text-left text-[18px] leading-6 text-white/78">
                  {addressLabel}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[15px] text-white/58">分配时间</div>
                <div className="mt-1 max-w-[9.5rem] truncate text-[16px] text-white/88">
                  {assignmentLabel}
                </div>
              </div>
            </div>
            <div className="my-5 h-px bg-white/18" />
            <div className="flex items-center justify-between gap-3">
              <div className="text-[20px] text-white/90">备注</div>
              {!remarkEditing ? (
                <button
                  type="button"
                  onClick={startRemarkEditing}
                  className="lbn-phone-press rounded-full px-3 py-1 text-[15px] text-white/74 active:bg-white/12"
                >
                  编辑
                </button>
              ) : null}
            </div>
            {remarkEditing ? (
              <div className="mt-3">
                <textarea
                  value={remarkDraft}
                  onChange={(event) => setRemarkDraft(event.target.value)}
                  maxLength={1000}
                  rows={4}
                  autoFocus
                  placeholder="输入客户备注"
                  className="min-h-28 w-full resize-none rounded-[22px] border border-white/18 bg-white/14 px-4 py-3 text-[16px] leading-6 text-white outline-none backdrop-blur-xl placeholder:text-white/48 focus:border-white/30"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[13px] text-white/54">
                    {remarkDraft.trim().length}/1000
                  </span>
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRemarkDraft(displayRemark ?? "");
                        setRemarkError(null);
                        setRemarkEditing(false);
                      }}
                      disabled={remarkSaving}
                      className="lbn-phone-press h-10 rounded-full px-4 text-[15px] text-white/72 disabled:opacity-45"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveRemark()}
                      disabled={remarkSaving}
                      className="lbn-phone-press h-10 rounded-full bg-white px-5 text-[15px] font-medium text-[#0a84ff] disabled:opacity-45"
                    >
                      {remarkSaving ? "保存中" : "保存"}
                    </button>
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={startRemarkEditing}
                className="lbn-phone-press mt-2 block min-h-12 w-full rounded-[18px] px-0 py-1 text-left text-[16px] leading-6 text-white/72"
              >
                {displayRemark || (detailLoading ? "正在同步客户资料..." : "暂无备注")}
              </button>
            )}
            {remarkError ? <p className="mt-3 text-[13px] text-white/72">{remarkError}</p> : null}
            {detailError ? (
              <p className="mt-3 text-[13px] text-white/72">{detailError}</p>
            ) : null}
          </div>

          <div className="lbn-phone-glass-card mt-4 overflow-hidden rounded-[28px] text-white">
            <button
              type="button"
              onClick={() => setCallHistoryExpanded((value) => !value)}
              className="lbn-phone-press block w-full px-5 py-4 text-left"
            >
              <span className="block text-[20px]">通话记录：{callSummary}</span>
              <span className="mt-1 block text-[15px] text-white/70">
                {callHistoryExpanded ? "收起通话记录" : "展开通话记录"}
              </span>
            </button>
            {callHistoryExpanded ? (
              <div className="border-t border-white/16 px-5 py-2">
                {visibleCallRecords.length > 0 ? (
                  visibleCallRecords.map((record) => (
                    <div
                      key={record.id}
                      className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 py-3 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[16px] text-white">
                          {getCallModeLabel(record.callSource)} {getPhoneResultLabel(record)}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-white/60">
                          {formatNullableRelativeDate(record.callTime)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[13px] text-white/60">
                        {record.durationSeconds > 0
                          ? formatCallDuration(record.durationSeconds)
                          : "未计时"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-[15px] text-white/66">暂无通话记录</div>
                )}
              </div>
            ) : null}
          </div>

          <div
            ref={detailSectionRef}
            className="lbn-phone-glass-card mt-4 rounded-[28px] px-5 py-5 text-white"
          >
            <div className="text-[20px] text-white/90">客户详情</div>
            <div className="mt-4 grid gap-3 text-left">
              {[
                ["姓名", customer.name],
                ["电话", displayPhone],
                ["地址", addressLabel],
                ["微信", detail?.wechatId || "未填写"],
                ["承接人", customer.owner?.name || "未分配"],
                ["分配时间", assignmentLabel],
                ["客户等级", customer.executionClass],
                ["商品", productSignal ? `${productSignal.label}：${productSignal.value}` : "暂无"],
                ["成交单数", `${customer.approvedTradeOrderCount} 单`],
                ["最近跟进", formatNullableRelativeDate(customer.latestFollowUpAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex min-w-0 items-start gap-4">
                  <span className="w-20 shrink-0 text-[15px] text-white/58">{label}</span>
                  <span className="min-w-0 flex-1 break-words text-[16px] text-white/88">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MobileModulePanel({
  module,
  data,
  onClose,
  openCustomers,
  openDialpad,
  openMessages,
  onSelectCustomer,
}: Readonly<{
  module: MobileModuleView | null;
  data: CustomerCenterData;
  onClose: () => void;
  openCustomers: (queue?: string) => void;
  openDialpad: () => void;
  openMessages: () => void;
  onSelectCustomer: (customer: CustomerListItem) => void;
}>) {
  if (!module) {
    return null;
  }

  const orderCustomers = data.queueItems
    .filter((item) => item.approvedTradeOrderCount > 0 || Boolean(getCustomerPrimaryProduct(item)))
    .slice(0, 6);
  const recordingCustomers = data.queueItems
    .filter((item) => item.callRecords.length > 0)
    .slice(0, 6);
  const callRecordCount = data.queueItems.reduce(
    (sum, item) => sum + item.callRecords.length,
    0,
  );
  const Icon =
    module.kind === "generic" ? getNavigationIcon(module.iconName) : module.kind === "orders" ? PackageCheck : Mic;

  return (
    <div className="fixed inset-0 z-[66] overflow-hidden bg-[#f7f8fb]">
      <section className="lbn-mobile-panel mx-auto flex w-full max-w-[520px] flex-col overflow-hidden bg-[#f7f8fb]">
        <header
          className="z-10 flex shrink-0 items-center gap-3 border-b border-black/5 bg-[#f7f8fb]/95 px-5 pb-4 backdrop-blur-xl"
          style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#475467] shadow-[0_8px_20px_rgba(16,24,40,0.04)]"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold text-[#20242c]">{module.title}</h1>
            <p className="mt-0.5 line-clamp-1 text-[12px] text-[#98a1af]">
              {module.description}
            </p>
          </div>
        </header>

        <div className="lbn-mobile-scrollbar-none grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-5">
          <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_16px_36px_rgba(16,24,40,0.055)]">
            <div className="flex items-center gap-4">
              <IconBubble
                icon={Icon}
                tone={module.kind === "orders" ? "green" : module.kind === "recordings" ? "red" : "blue"}
              />
              <div className="min-w-0">
                <h2 className="truncate text-[20px] font-semibold text-[#20242c]">
                  {module.title}
                </h2>
                <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#667085]">
                  {module.description}
                </p>
              </div>
            </div>
          </div>

          {module.kind === "orders" ? (
            <>
              <AppSection title="执行入口">
                <AppTile icon={ClipboardList} label="客户建单" tone="blue" onClick={() => openCustomers()} />
                <AppTile icon={PackageCheck} label="交易单" tone="green" onClick={() => openCustomers()} />
                <AppTile icon={CreditCard} label="收款" tone="amber" onClick={() => openCustomers()} />
                <AppTile icon={WalletCards} label="催收" tone="red" onClick={() => openCustomers()} />
                <AppTile icon={Truck} label="履约" tone="violet" onClick={() => openCustomers()} />
                <AppTile icon={PhoneCall} label="跟进" tone="green" onClick={openDialpad} />
              </AppSection>

              <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
                <div className="border-b border-black/5 px-5 py-4">
                  <h2 className="text-[18px] font-semibold text-[#20242c]">客户订单线索</h2>
                </div>
                {orderCustomers.length > 0 ? (
                  orderCustomers.map((customer) => (
                    <OrderCustomerMiniRow
                      key={customer.id}
                      customer={customer}
                      onClick={() => onSelectCustomer(customer)}
                    />
                  ))
                ) : (
                  <div className="px-5 py-8 text-center text-[14px] text-[#98a1af]">
                    当前范围暂无订单线索
                  </div>
                )}
              </div>
            </>
          ) : null}

          {module.kind === "recordings" ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "录音客户", value: recordingCustomers.length },
                  { label: "通话记录", value: callRecordCount },
                  { label: "客户池", value: data.summary.customerCount },
                ].map((item) => (
                  <div key={item.label} className="rounded-[18px] bg-white px-3 py-3">
                    <div className="text-[22px] font-semibold text-[#20242c]">{item.value}</div>
                    <div className="mt-1 truncate text-[12px] text-[#98a1af]">{item.label}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
                <div className="border-b border-black/5 px-5 py-4">
                  <h2 className="text-[18px] font-semibold text-[#20242c]">最近通话客户</h2>
                </div>
                {recordingCustomers.length > 0 ? (
                  recordingCustomers.map((customer) => (
                    <OrderCustomerMiniRow
                      key={customer.id}
                      customer={customer}
                      onClick={() => onSelectCustomer(customer)}
                    />
                  ))
                ) : (
                  <div className="px-5 py-8 text-center text-[14px] text-[#98a1af]">
                    当前范围暂无通话记录
                  </div>
                )}
              </div>
            </>
          ) : null}

          {module.kind === "generic" ? (
            <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
              <MessageRow
                icon={BarChart3}
                tone="blue"
                title="今日数据"
                value="查看当前账号的当日经营摘要"
                onClick={openMessages}
              />
              <MessageRow
                icon={UsersRound}
                tone="slate"
                title="客户工作台"
                value={`${data.summary.customerCount} 位客户在当前范围`}
                onClick={() => openCustomers()}
              />
              <MessageRow
                icon={PhoneCall}
                tone="green"
                title="本机外呼"
                value="拨号、录音和通话补记"
                onClick={openDialpad}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function BottomNav({
  activeTab,
  onTabChange,
}: Readonly<{
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}>) {
  const primaryTabs = tabs.slice(0, 3);
  const searchTab = tabs.find((tab) => tab.key === "search");

  return (
    <nav className="lbn-phone-bottom-nav">
      <div className="lbn-phone-tab-pill">
        {primaryTabs.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "lbn-phone-dock-button lbn-phone-press relative flex h-[64px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full text-[13px] font-semibold",
                active ? "is-active text-[#0a84ff]" : "text-black",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-7 w-7" aria-hidden />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      {searchTab ? (
        <button
          type="button"
          onClick={() => onTabChange(searchTab.key)}
          className={cn(
            "lbn-phone-search-tab lbn-phone-press",
            activeTab === searchTab.key ? "is-active text-[#0a84ff]" : "text-black",
          )}
          aria-current={activeTab === searchTab.key ? "page" : undefined}
          aria-label={searchTab.label}
        >
          <IoSearchIcon className="h-9 w-9" aria-hidden />
        </button>
      ) : null}
    </nav>
  );
}

function getInitialTab(value: string | null): MobileTab {
  return tabs.some((tab) => tab.key === value) ? (value as MobileTab) : "messages";
}

export function MobileAppShell({
  data,
  currentUser,
  navigationGroups,
  canCreateCallRecord,
  canAccessCallRecordings,
}: Readonly<{
  data: CustomerCenterData;
  currentUser: MobileCurrentUser;
  dashboardData: CustomerOperatingDashboardData | null;
  navigationGroups: NavigationGroup[];
  canCreateCallRecord: boolean;
  canAccessCallRecordings: boolean;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<MobileTab>(() =>
    getInitialTab(searchParams.get("tab")),
  );
  const [searchText, setSearchText] = useState(data.filters.search);
  const [dialNumber, setDialNumber] = useState("");
  const [callMode, setCallMode] = useState<MobileCallMode>(() => readStoredCallMode());
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const [orderCustomer, setOrderCustomer] = useState<CustomerListItem | null>(null);
  const [activeModule, setActiveModule] = useState<MobileModuleView | null>(null);
  const [outboundNotice, setOutboundNotice] = useState<MobileOutboundNotice | null>(null);
  const [mobileCustomersState, setMobileCustomersState] =
    useState<MobileCustomersApiState>({
      items: null,
      pagination: null,
      loading: true,
      loadingMore: false,
      error: null,
      lastSyncedAt: null,
    });
  const mobileCustomerRequestRef = useRef(0);
  const [recentDialCustomer, setRecentDialCustomer] = useState<RecentDialCustomer | null>(
    () => getRecentDialFromRecords(data.queueItems),
  );
  const [nativeRecorderReadiness, setNativeRecorderReadiness] =
    useState<NativeRecorderReadiness>(() =>
      summarizeNativeRecorderReadiness({ nativeAvailable: false }),
    );
  const [nativeRecorderChecking, setNativeRecorderChecking] = useState(true);
  const [nativeRecorderInitializing, setNativeRecorderInitializing] = useState(false);
  const mobileLevelFilters = useMemo(
    () => normalizeExecutionClasses(data.filters.executionClasses),
    [data.filters.executionClasses],
  );
  const mobileCustomersApiEnabled =
    !data.filters.assignedFrom &&
    !data.filters.assignedTo &&
    data.filters.productKeys.length === 0 &&
    !data.filters.productKeyword &&
    data.filters.tagIds.length === 0;

  const refreshNativeRecorderReadiness = useCallback(async () => {
    setNativeRecorderChecking(true);

    try {
      setNativeRecorderReadiness(await readNativeRecorderReadiness());
    } finally {
      setNativeRecorderChecking(false);
    }
  }, []);

  const initializeNativeRecorderPermissions = useCallback(async () => {
    setNativeRecorderInitializing(true);
    setNativeRecorderChecking(true);

    try {
      setNativeRecorderReadiness(await requestNativeRecorderPermissions());
    } finally {
      setNativeRecorderChecking(false);
      setNativeRecorderInitializing(false);
    }
  }, []);

  useEffect(() => {
    void refreshNativeRecorderReadiness();
  }, [refreshNativeRecorderReadiness]);

  const loadMobileCustomers = useCallback(
    async (input: { page?: number; append?: boolean } = {}) => {
      if (!mobileCustomersApiEnabled) {
        setMobileCustomersState({
          items: null,
          pagination: null,
          loading: false,
          loadingMore: false,
          error: null,
          lastSyncedAt: null,
        });
        return;
      }

      const requestId = mobileCustomerRequestRef.current + 1;
      mobileCustomerRequestRef.current = requestId;
      const page = input.page ?? 1;
      const append = Boolean(input.append);

      setMobileCustomersState((current) => ({
        ...current,
        loading: !append,
        loadingMore: append,
        error: null,
      }));

      try {
        const payload = await fetchMobileCustomers({
          page,
          limit: data.pagination.pageSize,
          levels: mobileLevelFilters,
          queue: data.filters.queue,
          search: data.filters.search,
        });

        if (mobileCustomerRequestRef.current !== requestId) {
          return;
        }

        setMobileCustomersState((current) => ({
          items: append
            ? mergeMobileApiCustomerItems(current.items ?? [], payload.customers)
            : payload.customers,
          pagination: payload.pagination,
          loading: false,
          loadingMore: false,
          error: null,
          lastSyncedAt: new Date(),
        }));
      } catch (error) {
        if (mobileCustomerRequestRef.current !== requestId) {
          return;
        }

        setMobileCustomersState((current) => ({
          ...current,
          loading: false,
          loadingMore: false,
          error: error instanceof Error ? error.message : "移动端客户列表同步失败。",
        }));
      }
    },
    [
      data.filters.queue,
      data.filters.search,
      data.pagination.pageSize,
      mobileCustomersApiEnabled,
      mobileLevelFilters,
    ],
  );

  useEffect(() => {
    void loadMobileCustomers({ page: 1 });
  }, [loadMobileCustomers]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedRecent = readRecentDialCustomer();
      const recordRecent = getRecentDialFromRecords(data.queueItems);
      const storedTime = toDate(storedRecent?.calledAt)?.getTime() ?? 0;
      const recordTime = toDate(recordRecent?.calledAt)?.getTime() ?? 0;

      setRecentDialCustomer(storedTime >= recordTime ? storedRecent : recordRecent);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [data.queueItems]);

  function switchTab(tab: MobileTab) {
    setActiveModule(null);
    setActiveTab(tab);
    updateBrowserTabParam(tab);
  }

  function replaceMobileQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "customers");

    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    params.set("page", "1");
    startTransition(() => {
      router.replace(`/mobile?${params.toString()}`, { scroll: false });
    });
  }

  function openCustomers(queue?: string) {
    setActiveModule(null);
    setActiveTab("customers");
    if (queue) {
      replaceMobileQuery({ queue });
      return;
    }
    updateBrowserTabParam("customers");
  }

  function openDialpad() {
    setActiveModule(null);
    switchTab("dialpad");
  }

  function openMessages() {
    setActiveModule(null);
    switchTab("messages");
  }

  function changeCallMode(nextMode: MobileCallMode) {
    setCallMode(nextMode);
    writeStoredCallMode(nextMode);
  }

  function refreshMobileCustomers() {
    void loadMobileCustomers({ page: 1 });
  }

  function loadMoreMobileCustomers() {
    if (
      !mobileCustomersApiEnabled ||
      mobileCustomersState.loading ||
      mobileCustomersState.loadingMore ||
      !mobileCustomersState.pagination?.hasMore
    ) {
      return;
    }

    void loadMobileCustomers({
      page: mobileCustomersState.pagination.page + 1,
      append: true,
    });
  }

  function openModule(module: MobileModuleView) {
    setActiveModule(module);
  }

  function openOrderEntry(customer: CustomerListItem) {
    setSelectedCustomer(null);
    setOrderCustomer(customer);
  }

  function handleCustomerAvatarUpdated(customerId: string, avatarUrl: string | null) {
    setSelectedCustomer((current) =>
      current?.id === customerId ? { ...current, avatarUrl } : current,
    );
    setOrderCustomer((current) =>
      current?.id === customerId ? { ...current, avatarUrl } : current,
    );
    setMobileCustomersState((current) => {
      if (!current.items) {
        return current;
      }

      return {
        ...current,
        items: current.items.map((item) =>
          item.id === customerId ? { ...item, avatarUrl } : item,
        ),
      };
    });
  }

  function handleCustomerRemarkUpdated(customerId: string, remark: string | null) {
    setSelectedCustomer((current) =>
      current?.id === customerId ? { ...current, remark } : current,
    );
    setOrderCustomer((current) =>
      current?.id === customerId ? { ...current, remark } : current,
    );
  }

  async function resolveCustomerPhoneForCall(customer: CustomerListItem) {
    if (!isMaskedPhone(customer.phone)) {
      return customer;
    }

    const payload = await fetchMobileCustomerDetail(customer.id);

    return {
      ...customer,
      name: payload.customer.name,
      phone: payload.customer.phone,
    } satisfies CustomerListItem;
  }

  function startCustomerCall(
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode = callMode,
  ) {
    void (async () => {
      let callableCustomer: CustomerListItem;

      try {
        callableCustomer = await resolveCustomerPhoneForCall(customer);
      } catch (error) {
        setOutboundNotice({
          tone: "failed",
          title: "客户号码读取失败",
          description: error instanceof Error ? error.message : "无法读取完整手机号。",
        });
        return;
      }

      const recent = createRecentDialCustomer(
        callableCustomer,
        mode,
      );
      setRecentDialCustomer(recent);
      writeRecentDialCustomer(recent);

      if (mode === "crm-outbound") {
        void startCrmOutboundCall(callableCustomer, triggerSource);
        return;
      }

      startMobileCallFollowUpDial({
        customerId: callableCustomer.id,
        customerName: callableCustomer.name,
        phone: callableCustomer.phone,
        triggerSource,
      });
    })();
  }

  async function startCrmOutboundCall(
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
  ) {
    const clientEventAt = new Date().toISOString();
    const correlationId = generateClientCallCorrelationId("crm-outbound");

    setOutboundNotice({
      tone: "pending",
      title: "外呼发起中",
      description: `${customer.name} · 正在提交到 CTI 线路`,
    });

    try {
      const response = await fetch("/api/outbound-calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          correlationId,
          clientEventAt,
          triggerSource,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        call?: {
          sessionId?: string;
          callRecordId?: string;
          status?: string;
        };
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "外呼发起失败。");
      }

      const sessionId = payload?.call?.sessionId;
      setOutboundNotice({
        tone: "pending",
        title: "外呼已提交",
        description: "等待坐席接听和客户接通，录音由服务器归档。",
      });

      if (sessionId) {
        pollCrmOutboundSession(sessionId, customer.name);
      }
    } catch (error) {
      setOutboundNotice({
        tone: "failed",
        title: "外呼失败",
        description: error instanceof Error ? error.message : "外呼发起失败。",
      });
    }
  }

  function pollCrmOutboundSession(sessionId: string, customerName: string) {
    let attempts = 0;

    async function poll() {
      attempts += 1;

      try {
        const response = await fetch(`/api/outbound-calls/${sessionId}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as {
          session?: {
            status?: string;
            failureMessage?: string | null;
            durationSeconds?: number | null;
            recordingImportedAt?: string | null;
          };
        } | null;
        const session = payload?.session;

        if (!response.ok || !session?.status) {
          throw new Error("外呼状态读取失败。");
        }

        if (session.status === "ENDED") {
          setOutboundNotice({
            tone: "success",
            title: "外呼已结束",
            description: session.durationSeconds
              ? `${customerName} · 通话 ${formatCallDuration(session.durationSeconds)}${
                  session.recordingImportedAt ? "，录音已归档" : ""
                }`
              : `${customerName} · 通话已结束`,
          });
          router.refresh();
          return;
        }

        if (session.status === "FAILED" || session.status === "CANCELED") {
          setOutboundNotice({
            tone: "failed",
            title: "外呼未接通",
            description: session.failureMessage ?? "线路返回失败或客户未接通。",
          });
          router.refresh();
          return;
        }

        if (session.status === "ANSWERED") {
          setOutboundNotice({
            tone: "pending",
            title: "客户已接通",
            description: `${customerName} · 正在通话，录音由服务器保存。`,
          });
        } else if (session.status === "RINGING") {
          setOutboundNotice({
            tone: "pending",
            title: "客户振铃中",
            description: `${customerName} · 等待客户接听。`,
          });
        }
      } catch {
        if (attempts > 3) {
          setOutboundNotice({
            tone: "failed",
            title: "外呼状态暂不可用",
            description: "请稍后在通话记录或录音质检中查看结果。",
          });
          return;
        }
      }

      if (attempts < 80) {
        window.setTimeout(poll, 1800);
      }
    }

    window.setTimeout(poll, 1000);
  }

  return (
    <main className="lbn-mobile-app mx-auto max-w-[520px] bg-[#f5f7fa] text-[#20242c] shadow-[0_0_0_1px_rgba(16,24,40,0.04)]">
      <div className={cn("lbn-mobile-screen", activeTab === "dialpad" && "lbn-mobile-screen--dialpad")}>
        {activeTab === "messages" ? (
          <MessagesTab
            data={data}
            recentDialCustomer={recentDialCustomer}
            callMode={callMode}
            canCreateCallRecord={canCreateCallRecord}
            onSelectCustomer={setSelectedCustomer}
            onStartCall={startCustomerCall}
          />
        ) : null}
        {activeTab === "customers" ? (
          <CustomersTab
            data={data}
            mobileCustomersState={mobileCustomersState}
            mobileCustomersApiEnabled={mobileCustomersApiEnabled}
            searchText={searchText}
            callMode={callMode}
            canCreateCallRecord={canCreateCallRecord}
            onRefreshCustomers={refreshMobileCustomers}
            onLoadMoreCustomers={loadMoreMobileCustomers}
            onSelectCustomer={setSelectedCustomer}
            onStartCall={startCustomerCall}
          />
        ) : null}
        {activeTab === "dialpad" ? (
          <DialpadTab
            items={data.queueItems}
            dialNumber={dialNumber}
            setDialNumber={setDialNumber}
            callMode={callMode}
            onCallModeChange={changeCallMode}
            canCreateCallRecord={canCreateCallRecord}
            onSelectCustomer={setSelectedCustomer}
            onStartCall={startCustomerCall}
          />
        ) : null}
        {activeTab === "search" ? (
          <SearchTab
            data={data}
            searchText={searchText}
            setSearchText={setSearchText}
            callMode={callMode}
            canCreateCallRecord={canCreateCallRecord}
            onSelectCustomer={setSelectedCustomer}
            onStartCall={startCustomerCall}
          />
        ) : null}
        {activeTab === "apps" ? (
          <AppsTab
            data={data}
            canAccessCallRecordings={canAccessCallRecordings}
            openCustomers={openCustomers}
            openDialpad={openDialpad}
            openMessages={openMessages}
            onOpenModule={openModule}
            onOpenOrder={openOrderEntry}
          />
        ) : null}
        {activeTab === "me" ? (
          <MeTab
            user={currentUser}
            data={data}
            nativeRecorderReadiness={nativeRecorderReadiness}
            nativeRecorderChecking={nativeRecorderChecking}
            nativeRecorderInitializing={nativeRecorderInitializing}
            navigationGroups={navigationGroups}
            openMessages={openMessages}
            openCustomers={openCustomers}
            openDialpad={openDialpad}
            onRefreshNativeRecorder={() => void refreshNativeRecorderReadiness()}
            onRequestNativeRecorderPermissions={() =>
              void initializeNativeRecorderPermissions()
            }
            onOpenModule={openModule}
          />
        ) : null}
      </div>

      {isPending ? (
        <div className="fixed left-1/2 top-4 z-[80] -translate-x-1/2 rounded-full bg-[#20242c] px-3 py-1.5 text-[12px] font-medium text-white shadow-[0_12px_24px_rgba(16,24,40,0.18)]">
          更新中...
        </div>
      ) : null}

      {outboundNotice ? (
        <button
          type="button"
          onClick={() => setOutboundNotice(null)}
          className={cn(
            "fixed left-1/2 top-4 z-[82] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[18px] border px-4 py-3 text-left shadow-[0_18px_38px_rgba(16,24,40,0.18)]",
            outboundNotice.tone === "failed"
              ? "border-red-200 bg-white text-red-700"
              : outboundNotice.tone === "success"
                ? "border-emerald-200 bg-white text-emerald-700"
                : "border-[#cfe2ff] bg-white text-[#1677ff]",
          )}
        >
          <span className="block text-[14px] font-semibold">{outboundNotice.title}</span>
          <span className="mt-1 block text-[12px] leading-5 text-[#667085]">
            {outboundNotice.description}
          </span>
        </button>
      ) : null}

      {canCreateCallRecord ? (
        <MobileCallFollowUpSheet
          scope={{
            kind: "list",
            customerIds: data.queueItems.map((item) => item.id),
          }}
          resultOptions={data.callResultOptions}
        />
      ) : null}

      <CustomerDetailDrawer
        customer={selectedCustomer}
        callMode={callMode}
        onCallModeChange={changeCallMode}
        callResultOptions={data.callResultOptions}
        canCreateCallRecord={canCreateCallRecord}
        onStartCall={startCustomerCall}
        onOpenOrder={openOrderEntry}
        onAvatarUpdated={handleCustomerAvatarUpdated}
        onRemarkUpdated={handleCustomerRemarkUpdated}
        onClose={() => setSelectedCustomer(null)}
      />

      <MobileOrderComposer
        customer={orderCustomer}
        onClose={() => setOrderCustomer(null)}
        onCompleted={(message, tradeNo) => {
          setOrderCustomer(null);
          setOutboundNotice({
            tone: "success",
            title: "移动端订单已处理",
            description: `${tradeNo} · ${message}`,
          });
          router.refresh();
          void loadMobileCustomers({ page: 1 });
        }}
        onStartCall={startCustomerCall}
      />

      <MobileModulePanel
        module={activeModule}
        data={data}
        onClose={() => setActiveModule(null)}
        openCustomers={openCustomers}
        openDialpad={openDialpad}
        openMessages={openMessages}
        onSelectCustomer={(customer) => {
          setActiveModule(null);
          setSelectedCustomer(customer);
        }}
      />

      <BottomNav activeTab={activeTab} onTabChange={switchTab} />
    </main>
  );
}
