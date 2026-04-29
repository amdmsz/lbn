"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
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
  Filter,
  Grid3X3,
  LayoutGrid,
  MessageCircle,
  Mic,
  Package,
  PackageCheck,
  Phone,
  PhoneCall,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import type { RoleCode } from "@prisma/client";
import { MobileCallFollowUpSheet } from "@/components/customers/mobile-call-followup-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  canUseNativeCallRecorder,
  readNativeConnectionProfile,
  reloadNativeApp,
  saveNativeConnectionProfile,
  testNativeConnection,
  type NativeConnectionProfile,
} from "@/lib/calls/native-mobile-call";
import {
  startMobileCallFollowUpDial,
  type MobileCallTriggerSource,
} from "@/lib/calls/mobile-call-followup";
import {
  formatRegion,
  formatRelativeDateTime,
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
  getCustomerWorkStatusLabel,
  getCustomerWorkStatusVariant,
} from "@/lib/customers/metadata";
import type {
  CustomerCenterData,
  CustomerListItem,
  CustomerOperatingDashboardData,
  CustomerOperatingDashboardEmployeeRow,
} from "@/lib/customers/queries";
import {
  fetchMobileCustomerDetail,
  type MobileCustomerDetail,
} from "@/lib/mobile/client-api";
import type {
  NavigationGroup,
  NavigationIconName,
  NavigationItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

type MobileTab = "messages" | "customers" | "dialpad" | "apps" | "me";
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
  resultLabel: string | null;
};

type MobileOutboundNotice = {
  tone: "pending" | "success" | "failed";
  title: string;
  description: string;
};

const tabs: Array<{
  key: MobileTab;
  label: string;
  icon: MobileIcon;
}> = [
  { key: "messages", label: "消息", icon: MessageCircle },
  { key: "customers", label: "客户", icon: UserRound },
  { key: "dialpad", label: "拨号盘", icon: Grid3X3 },
  { key: "apps", label: "订单", icon: LayoutGrid },
  { key: "me", label: "我的", icon: UserRound },
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

const mobileCallModeOptions: Array<{
  value: MobileCallMode;
  label: string;
  description: string;
}> = [
  {
    value: "crm-outbound",
    label: "CRM 外呼",
    description: "走 CTI 线路，录音由服务器归档。",
  },
  {
    value: "local-phone",
    label: "本机通话",
    description: "调用手机拨号，App 负责录音上传。",
  },
];

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

function formatNullableRelativeDate(value: DateLike) {
  const date = toDate(value);
  return date ? formatRelativeDateTime(date) : "暂无跟进";
}

function normalizeDialValue(value: string) {
  return value.replace(/[^\d+]/g, "");
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
}) {
  return record.resultCode || record.result || "通话记录";
}

function getCustomerPrimaryProduct(item: CustomerListItem) {
  return (
    item.latestInterestedProduct?.trim() ||
    item.leads.find((lead) => lead.interestedProduct?.trim())?.interestedProduct?.trim() ||
    item.latestPurchasedProduct?.trim() ||
    ""
  );
}

function getCustomerImportSignal(item: CustomerListItem) {
  const latestLead = item.leads[0] ?? null;
  const importedAt = toDate(item.latestImportAt ?? latestLead?.createdAt);
  const importDate = importedAt ? formatRelativeDateTime(importedAt) : "导入时间未知";
  const source = latestLead?.source === "INFO_FLOW" ? "信息流" : "导入客户";

  return `${source} · ${importDate}`;
}

function getDashboardTotals(rows: CustomerOperatingDashboardEmployeeRow[]) {
  return rows.reduce(
    (result, row) => ({
      assigned: result.assigned + row.todayAssignedCount,
      calls: result.calls + row.todayCallCount,
      connected: result.connected + row.connectedAssignedCount,
      wechat: result.wechat + row.todayWechatAddedCount,
      invitation: result.invitation + row.todayInvitationCount,
      deal: result.deal + row.todayDealCount,
      revenue: result.revenue + row.todayRevenueAmount,
    }),
    {
      assigned: 0,
      calls: 0,
      connected: 0,
      wechat: 0,
      invitation: 0,
      deal: 0,
      revenue: 0,
    },
  );
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
          resultLabel: record.resultLabel,
        };
      }
    }
  }

  return latest;
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

    return {
      customerId: parsed.customerId,
      customerName: parsed.customerName,
      phone: parsed.phone,
      calledAt: parsed.calledAt,
      resultLabel: typeof parsed.resultLabel === "string" ? parsed.resultLabel : null,
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
  resultLabel: string | null = "刚刚拨打",
) {
  return {
    customerId: item.id,
    customerName: item.name,
    phone: item.phone,
    calledAt: new Date().toISOString(),
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
        "flex items-center justify-between px-5",
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
      className="flex w-full items-center gap-3 border-b border-black/5 px-5 py-3.5 text-left last:border-b-0"
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
  dashboardData,
  onOpenCustomers,
  onOpenDialpad,
}: Readonly<{
  data: CustomerCenterData;
  dashboardData: CustomerOperatingDashboardData | null;
  onOpenCustomers: (queue?: string) => void;
  onOpenDialpad: () => void;
}>) {
  const dashboardRows = dashboardData?.employees ?? [];
  const totals =
    dashboardRows.length > 0
      ? getDashboardTotals(dashboardRows)
      : {
          assigned: data.summary.todayAssignedCount,
          calls: 0,
          connected: 0,
          wechat: data.summary.pendingWechatCount,
          invitation: data.summary.pendingInvitationCount,
          deal: data.summary.pendingDealCount,
          revenue: 0,
        };
  const connectRate =
    totals.assigned > 0 ? `${Math.round((totals.connected / totals.assigned) * 100)}%` : "0%";
  const dashboardStats = [
    { label: "今日分配", value: String(totals.assigned), note: dashboardData?.scopeLabel ?? "当前范围" },
    { label: "今日通话", value: String(totals.calls), note: `接通率 ${connectRate}` },
    { label: "今日加微", value: String(totals.wechat), note: "新增微信" },
    { label: "今日邀约", value: String(totals.invitation), note: "直播/活动" },
    { label: "今日成交", value: String(totals.deal), note: "通过订单" },
    { label: "销售额", value: formatCurrencyAmount(totals.revenue), note: dashboardData?.periodLabel ?? "今日" },
  ];
  const rankedRows = [...dashboardRows]
    .sort((left, right) => {
      if (right.todayRevenueAmount !== left.todayRevenueAmount) {
        return right.todayRevenueAmount - left.todayRevenueAmount;
      }

      if (right.todayDealCount !== left.todayDealCount) {
        return right.todayDealCount - left.todayDealCount;
      }

      return right.todayCallCount - left.todayCallCount;
    })
    .slice(0, 5);

  return (
    <section>
      <MobileHeader
        title="今日"
        action={
          <button
            type="button"
            onClick={() => onOpenDialpad()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#7a8290] shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
            aria-label="打开拨号盘"
          >
            <PhoneCall className="h-5 w-5" aria-hidden />
          </button>
        }
      />

      <div className="px-5">
        <div className="rounded-[20px] border border-black/5 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[16px] font-semibold text-[#1677ff]">
                <BarChart3 className="h-5 w-5" aria-hidden />
                <span>经营 Dashboard</span>
              </div>
              <div className="mt-1 text-[13px] text-[#8b93a1]">
                {dashboardData?.asOfDateLabel ?? "今日"} · {dashboardData?.scopeLabel ?? "当前客户"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenCustomers("new_imported")}
              className="shrink-0 rounded-full bg-[#f2f8ff] px-3 py-1.5 text-[12px] font-semibold text-[#1677ff]"
            >
              新导入
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {dashboardStats.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onOpenCustomers()}
                className="min-w-0 rounded-[15px] bg-[#f7f8fb] px-3 py-3 text-left"
              >
                <div className="truncate text-[21px] font-semibold leading-none text-[#20242c]">
                  {item.value}
                </div>
                <div className="mt-2 truncate text-[13px] font-medium text-[#475467]">
                  {item.label}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-[#98a1af]">{item.note}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {[
            { label: "客户池", value: data.summary.customerCount, queue: undefined },
            { label: "新导入", value: data.summary.todayNewImportedCount, queue: "new_imported" },
            { label: "待加微", value: data.summary.pendingWechatCount, queue: "pending_wechat" },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onOpenCustomers(item.queue)}
              className="rounded-[15px] bg-white px-3 py-3 text-left shadow-[0_8px_20px_rgba(16,24,40,0.03)]"
            >
              <div className="text-[19px] font-semibold text-[#20242c]">{item.value}</div>
              <div className="mt-1 truncate text-[12px] text-[#98a1af]">{item.label}</div>
            </button>
          ))}
        </div>

        <div className="mt-5 overflow-hidden rounded-[22px] bg-white shadow-[0_14px_32px_rgba(16,24,40,0.045)]">
          <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
            <h2 className="text-[18px] font-semibold text-[#20242c]">员工今日表现</h2>
            <span className="text-[12px] text-[#98a1af]">{dashboardData?.periodLabel ?? "今日"}</span>
          </div>
          {rankedRows.length > 0 ? (
            rankedRows.map((row) => (
              <button
                key={row.userId}
                type="button"
                onClick={() => onOpenCustomers()}
                className="flex w-full items-center gap-3 border-b border-black/5 px-5 py-4 text-left last:border-b-0"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[#eaf3ff] text-[15px] font-semibold text-[#1677ff]">
                  {row.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[16px] font-semibold text-[#20242c]">
                      {row.name || row.username}
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-[#20242c]">
                      {row.todayRevenue}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[12px] text-[#98a1af]">
                    分配 {row.todayAssignedCount} · 通话 {row.todayCallCount} · 成交 {row.todayDealCount}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-[#c5cad3]" aria-hidden />
              </button>
            ))
          ) : (
            <div className="px-5 py-8 text-center text-[14px] text-[#98a1af]">
              今日暂无员工经营数据
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SearchShell({
  value,
  placeholder,
  onChange,
  onSubmit,
}: Readonly<{
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}>) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className="flex h-11 items-center gap-3 rounded-[18px] bg-white px-4 text-[#a6adb8] shadow-[0_8px_22px_rgba(16,24,40,0.04)]"
    >
      <Search className="h-5 w-5 shrink-0" aria-hidden />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-[#20242c] outline-none placeholder:text-[#b8c0cc]"
      />
    </form>
  );
}

function CallModeSwitch({
  value,
  onChange,
}: Readonly<{
  value: MobileCallMode;
  onChange: (value: MobileCallMode) => void;
}>) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-white p-1.5 shadow-[0_8px_22px_rgba(16,24,40,0.04)]">
      {mobileCallModeOptions.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-14 rounded-[14px] px-3 py-2 text-left transition",
              active ? "bg-[#1677ff] text-white" : "bg-[#f7f8fb] text-[#667085]",
            )}
          >
            <span className="block text-[14px] font-semibold">{option.label}</span>
            <span
              className={cn(
                "mt-0.5 block text-[11px] leading-4",
                active ? "text-white/82" : "text-[#98a1af]",
              )}
            >
              {option.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function isCustomerExecutionClassValue(value: string): value is CustomerExecutionClassValue {
  return customerExecutionClassOptions.some((item) => item.value === value);
}

function normalizeExecutionClasses(values: readonly string[]) {
  return values.filter(isCustomerExecutionClassValue);
}

function CustomerFilterRail({
  data,
  onQueueChange,
  onOpenFilters,
}: Readonly<{
  data: CustomerCenterData;
  onQueueChange: (queue: string) => void;
  onOpenFilters: () => void;
}>) {
  const classCount = data.filters.executionClasses.length;
  const hasDateFilter = Boolean(data.filters.assignedFrom || data.filters.assignedTo);

  return (
    <div className="mt-3 grid grid-cols-4 gap-2">
      <button
        type="button"
        onClick={() => onQueueChange("all")}
        className={cn(
          "h-10 min-w-0 rounded-[14px] px-2 text-[14px] font-semibold leading-none whitespace-nowrap",
          data.filters.queue === "all"
            ? "bg-[#eaf3ff] text-[#1677ff]"
            : "bg-white text-[#475467] shadow-[0_8px_20px_rgba(16,24,40,0.035)]",
        )}
      >
        全部
      </button>
      <button
        type="button"
        onClick={() => onQueueChange("new_imported")}
        className={cn(
          "h-10 min-w-0 rounded-[14px] px-2 text-[14px] font-semibold leading-none whitespace-nowrap",
          data.filters.queue === "new_imported"
            ? "bg-[#eaf3ff] text-[#1677ff]"
            : "bg-white text-[#667085] shadow-[0_8px_20px_rgba(16,24,40,0.035)]",
        )}
      >
        新导入
      </button>
      <button
        type="button"
        onClick={onOpenFilters}
        className={cn(
          "inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-[14px] px-2 text-[14px] font-semibold leading-none whitespace-nowrap",
          classCount > 0
            ? "bg-[#eaf3ff] text-[#1677ff]"
            : "bg-white text-[#667085] shadow-[0_8px_20px_rgba(16,24,40,0.035)]",
        )}
      >
        <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">分类{classCount > 0 ? ` ${classCount}` : ""}</span>
      </button>
      <button
        type="button"
        onClick={onOpenFilters}
        className={cn(
          "inline-flex h-10 min-w-0 items-center justify-center gap-1 rounded-[14px] px-2 text-[14px] font-semibold leading-none whitespace-nowrap",
          hasDateFilter
            ? "bg-[#eaf3ff] text-[#1677ff]"
            : "bg-white text-[#667085] shadow-[0_8px_20px_rgba(16,24,40,0.035)]",
        )}
      >
        <Filter className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">时间</span>
      </button>
    </div>
  );
}

function CustomerFilterDrawer({
  data,
  onClose,
  onApply,
}: Readonly<{
  data: CustomerCenterData;
  onClose: () => void;
  onApply: (next: {
    queue: string | null;
    executionClasses: string | null;
    assignedFrom: string | null;
    assignedTo: string | null;
  }) => void;
}>) {
  const [newImportedOnly, setNewImportedOnly] = useState(data.filters.queue === "new_imported");
  const [selectedClasses, setSelectedClasses] = useState<CustomerExecutionClassValue[]>(
    normalizeExecutionClasses(data.filters.executionClasses),
  );
  const [assignedFrom, setAssignedFrom] = useState(data.filters.assignedFrom);
  const [assignedTo, setAssignedTo] = useState(data.filters.assignedTo);

  function toggleClass(value: CustomerExecutionClassValue) {
    setSelectedClasses((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  function applyFilters() {
    onApply({
      queue: newImportedOnly ? "new_imported" : "all",
      executionClasses: selectedClasses.length > 0 ? selectedClasses.join(",") : null,
      assignedFrom: assignedFrom || null,
      assignedTo: assignedTo || null,
    });
    onClose();
  }

  function resetFilters() {
    setNewImportedOnly(false);
    setSelectedClasses([]);
    setAssignedFrom("");
    setAssignedTo("");
    onApply({
      queue: "all",
      executionClasses: null,
      assignedFrom: null,
      assignedTo: null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70]">
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭客户筛选"
        className="absolute inset-0 bg-black/25 backdrop-blur-[6px]"
      />
      <aside className="absolute inset-y-0 right-0 flex w-[88vw] max-w-[420px] flex-col bg-[#f7f8fb] shadow-[-18px_0_48px_rgba(16,24,40,0.18)]">
        <div className="flex items-center justify-between border-b border-black/5 px-5 pb-4 pt-6">
          <div>
            <h2 className="text-[22px] font-semibold text-[#20242c]">筛选</h2>
            <p className="mt-1 text-[12px] text-[#98a1af]">新导入 / 分类 / 时间</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#667085]"
            aria-label="关闭"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="lbn-mobile-scrollbar-none flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-[20px] bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-[16px] font-semibold text-[#20242c]">新导入</h3>
                <p className="mt-1 text-[12px] text-[#98a1af]">只看最近导入/分配客户</p>
              </div>
              <button
                type="button"
                onClick={() => setNewImportedOnly((value) => !value)}
                className={cn(
                  "h-8 w-14 rounded-full p-1 transition-colors",
                  newImportedOnly ? "bg-[#1677ff]" : "bg-[#d0d5dd]",
                )}
                aria-pressed={newImportedOnly}
              >
                <span
                  className={cn(
                    "block h-6 w-6 rounded-full bg-white transition-transform",
                    newImportedOnly ? "translate-x-6" : "translate-x-0",
                  )}
                />
              </button>
            </div>
          </section>

          <section className="mt-4 rounded-[20px] bg-white px-4 py-4">
            <h3 className="text-[16px] font-semibold text-[#20242c]">客户分类</h3>
            <div className="mt-3 grid gap-2">
              {customerExecutionClassOptions.map((item) => {
                const active = selectedClasses.includes(item.value);

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggleClass(item.value)}
                    className={cn(
                      "flex h-11 items-center justify-between rounded-[14px] border px-3 text-left text-[14px] font-semibold",
                      active
                        ? "border-[#1677ff] bg-[#f2f8ff] text-[#1677ff]"
                        : "border-black/5 bg-[#fbfcfe] text-[#475467]",
                    )}
                  >
                    <span>{item.label}</span>
                    {active ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-4 rounded-[20px] bg-white px-4 py-4">
            <h3 className="text-[16px] font-semibold text-[#20242c]">时间筛选</h3>
            <div className="mt-3 grid gap-3">
              <label className="grid gap-1.5 text-[12px] font-medium text-[#667085]">
                开始时间
                <input
                  type="date"
                  value={assignedFrom}
                  onChange={(event) => setAssignedFrom(event.target.value)}
                  className="h-11 rounded-[14px] border border-black/5 bg-[#fbfcfe] px-3 text-[15px] text-[#20242c] outline-none"
                />
              </label>
              <label className="grid gap-1.5 text-[12px] font-medium text-[#667085]">
                结束时间
                <input
                  type="date"
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  className="h-11 rounded-[14px] border border-black/5 bg-[#fbfcfe] px-3 text-[15px] text-[#20242c] outline-none"
                />
              </label>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-black/5 bg-white px-5 py-4">
          <button
            type="button"
            onClick={resetFilters}
            className="h-12 rounded-[16px] bg-[#f2f4f7] text-[15px] font-semibold text-[#475467]"
          >
            重置
          </button>
          <button
            type="button"
            onClick={applyFilters}
            className="h-12 rounded-[16px] bg-[#1677ff] text-[15px] font-semibold text-white shadow-[0_12px_24px_rgba(22,119,255,0.22)]"
          >
            应用
          </button>
        </div>
      </aside>
    </div>
  );
}

function CustomerRow({
  item,
  canCreateCallRecord,
  onSelect,
  onStartCall,
}: Readonly<{
  item: CustomerListItem;
  canCreateCallRecord: boolean;
  onSelect: () => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  const latestCall = item.callRecords[0] ?? null;
  const executionVariant = getCustomerExecutionDisplayVariant({
    executionClass: item.executionClass,
    newImported: item.newImported,
    pendingFirstCall: item.pendingFirstCall,
  });
  const workStatus = item.workingStatuses[0] ?? null;
  const region = formatRegion(item.province, item.city, item.district);
  const primaryProduct = getCustomerPrimaryProduct(item);
  const importSignal = getCustomerImportSignal(item);

  function startCall(mode: MobileCallMode) {
    if (!canCreateCallRecord) {
      return;
    }

    onStartCall(item, "card", mode);
  }

  return (
    <div className="rounded-[18px] border border-black/5 bg-white px-4 py-3 shadow-[0_8px_20px_rgba(16,24,40,0.04)]">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[16px] font-semibold leading-5 text-[#20242c]">
              {item.name}
            </h3>
            <StatusBadge
              label={getCustomerExecutionDisplayLongLabel({
                executionClass: item.executionClass,
                newImported: item.newImported,
                pendingFirstCall: item.pendingFirstCall,
              })}
              variant={executionVariant}
            />
          </div>
          <div className="mt-1 truncate text-[13px] text-[#667085]">
            {item.phone} · {region}
          </div>
          <div className="mt-1.5 grid gap-0.5 text-[12px] leading-5 text-[#667085]">
            {primaryProduct ? (
              <div className="truncate">
                <span className="font-medium text-[#344054]">意向</span> · {primaryProduct}
              </div>
            ) : null}
            <div className="truncate text-[#98a1af]">{importSignal}</div>
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            {workStatus ? (
              <StatusBadge
                label={getCustomerWorkStatusLabel(workStatus)}
                variant={getCustomerWorkStatusVariant(workStatus)}
              />
            ) : null}
            {item.customerTags.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="inline-flex max-w-[96px] items-center truncate rounded-full bg-[#f2f4f7] px-2 py-1 text-[11px] font-medium text-[#667085]"
              >
                {tag.tag.name}
              </span>
            ))}
          </div>
          <div className="mt-1.5 truncate text-[12px] text-[#98a1af]">
            {latestCall
              ? `${latestCall.resultLabel} · ${formatNullableRelativeDate(latestCall.callTime)}`
              : formatNullableRelativeDate(item.latestFollowUpAt)}
          </div>
        </button>

        <div className="grid shrink-0 gap-2">
          <button
            type="button"
            onClick={() => startCall("crm-outbound")}
            aria-label={`CRM 外呼 ${item.name}`}
            disabled={!canCreateCallRecord}
            className={cn(
              "inline-flex h-9 min-w-14 items-center justify-center rounded-full px-3 text-[12px] font-semibold text-white shadow-[0_10px_22px_rgba(22,119,255,0.2)]",
              canCreateCallRecord ? "bg-[#1677ff]" : "bg-[#d0d5dd]",
            )}
          >
            外呼
          </button>
          <button
            type="button"
            onClick={() => startCall("local-phone")}
            aria-label={`本机通话 ${item.name}`}
            disabled={!canCreateCallRecord}
            className={cn(
              "inline-flex h-9 min-w-14 items-center justify-center rounded-full px-3 text-[12px] font-semibold",
              canCreateCallRecord
                ? "bg-[#eaf3ff] text-[#1677ff]"
                : "bg-[#f2f4f7] text-[#98a1af]",
            )}
          >
            本机
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomersTab({
  data,
  searchText,
  setSearchText,
  canCreateCallRecord,
  onSearchSubmit,
  onQueueChange,
  onApplyFilters,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  data: CustomerCenterData;
  searchText: string;
  setSearchText: (value: string) => void;
  canCreateCallRecord: boolean;
  onSearchSubmit: () => void;
  onQueueChange: (queue: string) => void;
  onApplyFilters: (next: {
    queue: string | null;
    executionClasses: string | null;
    assignedFrom: string | null;
    assignedTo: string | null;
  }) => void;
  onSelectCustomer: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const localQuery = normalizeSearchValue(searchText);
  const filteredItems = useMemo(() => {
    if (!localQuery) {
      return data.queueItems;
    }

    return data.queueItems.filter((item) => {
      return (
        normalizeSearchValue(item.name).includes(localQuery) ||
        normalizeDialValue(item.phone).includes(normalizeDialValue(searchText)) ||
        normalizeSearchValue(item.owner?.name ?? "").includes(localQuery)
      );
    });
  }, [data.queueItems, localQuery, searchText]);

  return (
    <section>
      <MobileHeader
        title="客户"
        action={
          <button
            type="button"
            onClick={() => setFilterDrawerOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#20242c] shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
            aria-label="打开客户筛选"
          >
            <Filter className="h-5 w-5" aria-hidden />
          </button>
        }
      />

      <div className="px-5">
        <SearchShell
          value={searchText}
          onChange={setSearchText}
          onSubmit={onSearchSubmit}
          placeholder="搜索公司名称/姓名/电话/负责人"
        />

        <CustomerFilterRail
          data={data}
          onQueueChange={onQueueChange}
          onOpenFilters={() => setFilterDrawerOpen(true)}
        />

        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-[18px] font-semibold text-[#20242c]">客户列表</h2>
          <span className="text-[12px] text-[#98a1af]">
            {data.pagination.totalCount} 位
          </span>
        </div>

        <div className="mt-2.5 grid gap-2.5">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <CustomerRow
                key={item.id}
                item={item}
                canCreateCallRecord={canCreateCallRecord}
                onSelect={() => onSelectCustomer(item)}
                onStartCall={onStartCall}
              />
            ))
          ) : (
            <div className="rounded-[22px] bg-white px-5 py-10 text-center text-[15px] text-[#98a1af]">
              当前范围暂无客户
            </div>
          )}
        </div>
      </div>

      {filterDrawerOpen ? (
        <CustomerFilterDrawer
          data={data}
          onClose={() => setFilterDrawerOpen(false)}
          onApply={onApplyFilters}
        />
      ) : null}
    </section>
  );
}

function DialpadTab({
  items,
  dialNumber,
  setDialNumber,
  callMode,
  setCallMode,
  canCreateCallRecord,
  recentDialCustomer,
  onSelectCustomer,
  onStartCall,
}: Readonly<{
  items: CustomerListItem[];
  dialNumber: string;
  setDialNumber: (value: string) => void;
  callMode: MobileCallMode;
  setCallMode: (value: MobileCallMode) => void;
  canCreateCallRecord: boolean;
  recentDialCustomer: RecentDialCustomer | null;
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
  const displayNumber = dialNumber || "输入号码";
  const recentCustomerItem = recentDialCustomer
    ? items.find((item) => item.id === recentDialCustomer.customerId) ?? null
    : null;

  function appendDialValue(value: string) {
    setDialNumber(`${dialNumber}${value}`);
  }

  function startDial(mode: MobileCallMode = callMode) {
    const normalizedNumber = normalizeDialValue(dialNumber);

    if (!normalizedNumber) {
      return;
    }

    if (matchedCustomer && canCreateCallRecord) {
      onStartCall(matchedCustomer, "card", mode);
      return;
    }

    window.location.href = `tel:${normalizedNumber}`;
  }

  return (
    <section>
      <MobileHeader title="拨号盘" compact />

      <div className="px-5">
        <SearchShell
          value={dialNumber}
          onChange={setDialNumber}
          placeholder="搜索客户或输入号码"
        />

        <div className="mt-3">
          <CallModeSwitch value={callMode} onChange={setCallMode} />
        </div>

        {recentDialCustomer ? (
          <div className="mt-4 rounded-[20px] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(16,24,40,0.035)]">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  if (recentCustomerItem) {
                    onSelectCustomer(recentCustomerItem);
                    return;
                  }

                  setDialNumber(recentDialCustomer.phone);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div className="text-[12px] font-medium text-[#98a1af]">上次拨打</div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <span className="truncate text-[16px] font-semibold text-[#20242c]">
                    {recentDialCustomer.customerName}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#98a1af]">
                    {formatNullableRelativeDate(recentDialCustomer.calledAt)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[13px] text-[#667085]">
                  {recentDialCustomer.phone}
                  {recentDialCustomer.resultLabel ? ` · ${recentDialCustomer.resultLabel}` : ""}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDialNumber(recentDialCustomer.phone)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f2f8ff] text-[#1677ff]"
                aria-label="填入上次拨打号码"
              >
                <Phone className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-6 min-h-[104px] rounded-[20px] bg-white px-5 py-4 text-center shadow-[0_10px_24px_rgba(16,24,40,0.04)]">
          <div
            className={cn(
              "truncate text-[28px] font-light leading-9 tracking-normal",
              dialNumber ? "text-[#20242c]" : "text-[#c2c7d0]",
            )}
          >
            {displayNumber}
          </div>
          {matchedCustomer ? (
            <button
              type="button"
              onClick={() => onSelectCustomer(matchedCustomer)}
              className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-[#f2f8ff] px-3 py-1.5 text-[13px] font-medium text-[#1677ff]"
            >
              <UserRound className="h-4 w-4" aria-hidden />
              <span className="truncate">{matchedCustomer.name}</span>
            </button>
          ) : suggestions.length > 0 ? (
            <div className="lbn-mobile-scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDialNumber(item.phone)}
                  className="shrink-0 rounded-full bg-[#f5f7fa] px-3 py-1.5 text-[13px] text-[#667085]"
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3">
          {keypadRows.map((row) => (
            <div key={row.map((item) => item.value).join("")} className="grid grid-cols-3 gap-3">
              {row.map((key) => (
                <button
                  key={key.value}
                  type="button"
                  onClick={() => appendDialValue(key.value)}
                  className="flex h-[66px] flex-col items-center justify-center rounded-[16px] bg-white text-[#1677ff] shadow-[0_8px_18px_rgba(16,24,40,0.03)]"
                >
                  <span className="text-[31px] font-light leading-none">{key.value}</span>
                  <span className="mt-1 h-4 text-[12px] font-medium text-[#8b93a1]">
                    {key.letters}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-3 items-center gap-3">
          <button
            type="button"
            onClick={() => startDial("crm-outbound")}
            disabled={!matchedCustomer || !canCreateCallRecord}
            className="inline-flex h-12 items-center justify-center rounded-[16px] bg-[#eaf3ff] px-3 text-[13px] font-semibold text-[#1677ff] disabled:bg-[#f2f4f7] disabled:text-[#98a1af]"
          >
            外呼
          </button>
          <button
            type="button"
            onClick={() => startDial(callMode)}
            disabled={!normalizeDialValue(dialNumber)}
            className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#1677ff] text-white shadow-[0_16px_28px_rgba(22,119,255,0.24)] disabled:bg-[#d0d5dd] disabled:shadow-none"
            aria-label="拨打电话"
          >
            <Phone className="h-8 w-8" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              if (normalizeDialValue(dialNumber)) {
                startDial("local-phone");
                return;
              }

              setDialNumber(dialNumber.slice(0, -1));
            }}
            className="inline-flex h-12 items-center justify-center rounded-[16px] bg-white px-3 text-[13px] font-semibold text-[#475467]"
            aria-label="本机通话"
          >
            本机
          </button>
          {dialNumber ? (
            <button
              type="button"
              onClick={() => setDialNumber(dialNumber.slice(0, -1))}
              className="col-start-3 ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full text-[#475467]"
              aria-label="删除一位号码"
            >
              <Delete className="h-6 w-6" aria-hidden />
            </button>
          ) : null}
        </div>
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
  onSelectCustomer,
}: Readonly<{
  data: CustomerCenterData;
  canAccessCallRecordings: boolean;
  openCustomers: (queue?: string) => void;
  openDialpad: () => void;
  openMessages: () => void;
  onOpenModule: (module: MobileModuleView) => void;
  onSelectCustomer: (customer: CustomerListItem) => void;
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

  return (
    <section>
      <MobileHeader title="订单" />
      <div className="grid gap-4 px-5">
        <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_16px_36px_rgba(16,24,40,0.055)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-[20px] font-semibold text-[#20242c]">订单入口</h2>
              <p className="mt-1 text-[13px] text-[#98a1af]">从客户到成交执行</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenModule(orderModule)}
              className="rounded-full bg-[#f2f8ff] px-3 py-1.5 text-[12px] font-semibold text-[#1677ff]"
            >
              查看
            </button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: "客户", value: data.summary.customerCount },
              { label: "已成交", value: data.queueItems.filter((item) => item.approvedTradeOrderCount > 0).length },
              { label: "金额", value: formatCurrencyAmount(visibleRevenue) },
            ].map((item) => (
              <div key={item.label} className="rounded-[16px] bg-[#f7f8fb] px-3 py-3">
                <div className="truncate text-[20px] font-semibold text-[#20242c]">
                  {item.value}
                </div>
                <div className="mt-1 truncate text-[12px] text-[#98a1af]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <AppSection title="订单流程">
          <AppTile
            icon={ClipboardList}
            label="客户建单"
            tone="blue"
            onClick={() => openCustomers()}
          />
          <AppTile
            icon={PackageCheck}
            label="交易单"
            tone="green"
            onClick={() => onOpenModule(orderModule)}
          />
          <AppTile
            icon={CreditCard}
            label="收款"
            tone="amber"
            onClick={() =>
              onOpenModule({
                kind: "orders",
                title: "收款记录",
                description: "查看收款提交、确认与驳回结果。",
              })
            }
          />
          <AppTile
            icon={WalletCards}
            label="催收"
            tone="red"
            onClick={() =>
              onOpenModule({
                kind: "orders",
                title: "催收任务",
                description: "跟进尾款、COD 和运费催收任务。",
              })
            }
          />
          <AppTile
            icon={Truck}
            label="履约"
            tone="violet"
            onClick={() =>
              onOpenModule({
                kind: "orders",
                title: "发货履约",
                description: "查看发货执行、批次和物流跟进。",
              })
            }
          />
          <AppTile
            icon={Package}
            label="商品"
            tone="slate"
            onClick={() =>
              onOpenModule({
                kind: "generic",
                title: "商品中心",
                description: "维护商品、SKU 和供应商相关主数据。",
                href: "/products",
                iconName: "products",
              })
            }
          />
          <AppTile icon={PhoneCall} label="电话" tone="green" onClick={openDialpad} />
          <AppTile
            icon={Mic}
            label="录音"
            tone="red"
            onClick={() =>
              onOpenModule({
                kind: "recordings",
                title: "通话录音",
                description: "按员工、客户、日期和 AI 信号筛选录音与质检结果。",
              })
            }
          />
        </AppSection>

        <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_12px_28px_rgba(16,24,40,0.045)]">
          <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
            <h2 className="text-[18px] font-semibold text-[#20242c]">可转订单客户</h2>
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
                onClick={() => onSelectCustomer(customer)}
              />
            ))
          ) : (
            <div className="px-5 py-8 text-center text-[14px] text-[#98a1af]">
              当前范围暂无意向或成交客户
            </div>
          )}
        </div>

        <AppSection title="销售协同">
          <AppTile icon={BarChart3} label="今日" tone="violet" onClick={openMessages} />
          <AppTile
            icon={UsersRound}
            label="客户"
            tone="blue"
            onClick={() => openCustomers()}
          />
          <AppTile icon={Search} label="检索" tone="slate" onClick={() => openCustomers()} />
          <AppTile
            icon={ShieldCheck}
            label="质检"
            tone="green"
            onClick={() =>
              canAccessCallRecordings
                ? onOpenModule({
                    kind: "recordings",
                    title: "录音质检",
                    description: "筛选录音、回看 AI 总结和质检信号。",
                  })
                : openCustomers()
            }
          />
        </AppSection>
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

function MeTab({
  user,
  data,
  nativeRecorderState,
  navigationGroups,
  openMessages,
  openCustomers,
  openDialpad,
  onOpenModule,
}: Readonly<{
  user: MobileCurrentUser;
  data: CustomerCenterData;
  nativeRecorderState: string;
  navigationGroups: NavigationGroup[];
  openMessages: () => void;
  openCustomers: (queue?: string) => void;
  openDialpad: () => void;
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
      value: nativeRecorderState,
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
  canCreateCallRecord,
  onStartCall,
  onOpenOrder,
  onClose,
}: Readonly<{
  customer: CustomerListItem | null;
  canCreateCallRecord: boolean;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
  onOpenOrder: (customer: CustomerListItem) => void;
  onClose: () => void;
}>) {
  const [detailState, setDetailState] = useState<{
    customerId: string;
    detail: MobileCustomerDetail | null;
    error: string | null;
  } | null>(null);
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
  }, [customerId]);

  if (!customer) {
    return null;
  }

  const activeDetailState =
    detailState?.customerId === customer.id ? detailState : null;
  const detail = activeDetailState?.detail ?? null;
  const detailError = activeDetailState?.error ?? null;
  const detailLoading = !activeDetailState;
  const latestCall = customer.callRecords[0] ?? null;
  const detailCalls = detail?.timeline.callRecords ?? [];
  const detailOrders = detail?.orders ?? [];
  const region = detail
    ? formatRegion(
        detail.profile.province,
        detail.profile.city,
        detail.profile.district,
      )
    : formatRegion(customer.province, customer.city, customer.district);
  const executionVariant = getCustomerExecutionDisplayVariant({
    executionClass: customer.executionClass,
    newImported: customer.newImported,
    pendingFirstCall: customer.pendingFirstCall,
  });
  const primaryProduct = getCustomerPrimaryProduct(customer);
  const importSignal = getCustomerImportSignal(customer);
  const displayPhone = detail?.phone ?? customer.phone;
  const displayRemark = detail?.profile.remark ?? customer.remark;

  function startCall(mode: MobileCallMode) {
    if (!canCreateCallRecord || !customer) {
      return;
    }

    onStartCall(customer, "detail", mode);
  }

  return (
    <div className="fixed inset-0 z-[62]">
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭客户详情"
        className="absolute inset-0 bg-black/28 backdrop-blur-[8px]"
      />
      <section className="absolute inset-x-0 bottom-0 max-h-[88svh] overflow-y-auto rounded-t-[28px] bg-[#f7f8fb] px-5 pb-8 pt-4 shadow-[0_-22px_60px_rgba(16,24,40,0.18)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d0d5dd]" />

        <div className="rounded-[24px] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(16,24,40,0.05)]">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#eaf3ff] text-[#1677ff]">
              <UserRound className="h-8 w-8" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[24px] font-semibold text-[#20242c]">
                  {customer.name}
                </h2>
                <StatusBadge
                  label={getCustomerExecutionDisplayLongLabel({
                    executionClass: customer.executionClass,
                    newImported: customer.newImported,
                    pendingFirstCall: customer.pendingFirstCall,
                  })}
                  variant={executionVariant}
                />
              </div>
              <p className="mt-1 truncate text-[15px] text-[#667085]">{displayPhone}</p>
              <p className="mt-1 truncate text-[13px] text-[#98a1af]">{region}</p>
              {detail?.wechatId ? (
                <p className="mt-1 truncate text-[13px] text-[#667085]">
                  微信 · {detail.wechatId}
                </p>
              ) : null}
              {primaryProduct ? (
                <p className="mt-2 line-clamp-1 text-[13px] text-[#667085]">
                  意向 · {primaryProduct}
                </p>
              ) : null}
              <p className="mt-1 truncate text-[12px] text-[#98a1af]">{importSignal}</p>
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

          {detailLoading ? (
            <div className="mt-4 rounded-[16px] bg-[#f7f8fb] px-4 py-3 text-[13px] text-[#667085]">
              正在同步移动端详情...
            </div>
          ) : null}

          {detailError ? (
            <div className="mt-4 rounded-[16px] bg-[#fff4f4] px-4 py-3 text-[13px] text-[#b42318]">
              {detailError}
            </div>
          ) : null}

          {detail?.tags.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.tags.slice(0, 6).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex max-w-[120px] truncate rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[12px] font-medium text-[#667085]"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-[16px] bg-[#f7f8fb] px-3 py-3">
              <div className="text-[20px] font-semibold text-[#20242c]">
                {detail ? detail.timeline.callRecords.length : customer._count.callRecords}
              </div>
              <div className="mt-1 text-[12px] text-[#98a1af]">通话</div>
            </div>
            <div className="rounded-[16px] bg-[#f7f8fb] px-3 py-3">
              <div className="text-[20px] font-semibold text-[#20242c]">
                {detail ? detailOrders.length : customer.approvedTradeOrderCount}
              </div>
              <div className="mt-1 text-[12px] text-[#98a1af]">成交</div>
            </div>
            <div className="rounded-[16px] bg-[#f7f8fb] px-3 py-3">
              <div className="truncate text-[20px] font-semibold text-[#20242c]">
                {formatMoney(
                  detail
                    ? String(
                        detailOrders.reduce(
                          (sum, order) => sum + Number(order.finalAmount || 0),
                          0,
                        ),
                      )
                    : customer.lifetimeTradeAmount,
                )}
              </div>
              <div className="mt-1 text-[12px] text-[#98a1af]">金额</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onOpenOrder(customer)}
              className="inline-flex h-12 items-center justify-center rounded-[16px] bg-[#1677ff] text-[15px] font-semibold text-white shadow-[0_14px_28px_rgba(22,119,255,0.22)]"
            >
              <ClipboardList className="mr-2 h-5 w-5" aria-hidden />
              下单
            </button>
            <button
              type="button"
              onClick={() => startCall("crm-outbound")}
              disabled={!canCreateCallRecord}
              className={cn(
                "inline-flex h-12 items-center justify-center rounded-[16px] text-[15px] font-semibold",
                canCreateCallRecord
                  ? "bg-[#eaf3ff] text-[#1677ff]"
                  : "bg-[#f2f4f7] text-[#98a1af]",
              )}
            >
              外呼
            </button>
            <button
              type="button"
              onClick={() => startCall("local-phone")}
              disabled={!canCreateCallRecord}
              className={cn(
                "inline-flex h-12 items-center justify-center rounded-[16px] text-[15px] font-semibold",
                canCreateCallRecord
                  ? "bg-[#f7f8fb] text-[#475467]"
                  : "bg-[#f2f4f7] text-[#98a1af]",
              )}
            >
              本机
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] bg-white px-5 py-5">
          <h3 className="text-[18px] font-semibold text-[#20242c]">最近通话</h3>
          <div className="mt-3 space-y-3">
            {detailCalls.length > 0
              ? detailCalls.slice(0, 3).map((record) => (
                  <div
                    key={record.id}
                    className="rounded-[16px] border border-black/5 bg-[#fbfcfe] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[15px] font-medium text-[#20242c]">
                        {formatMobileDetailCallLabel(record)}
                      </span>
                      <span className="shrink-0 text-[12px] text-[#98a1af]">
                        {formatNullableRelativeDate(record.callTime)}
                      </span>
                    </div>
                    {record.remark ? (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#667085]">
                        {record.remark}
                      </p>
                    ) : null}
                  </div>
                ))
              : customer.callRecords.slice(0, 3).map((record) => (
              <div
                key={record.id}
                className="rounded-[16px] border border-black/5 bg-[#fbfcfe] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-medium text-[#20242c]">
                    {record.resultLabel}
                  </span>
                  <span className="shrink-0 text-[12px] text-[#98a1af]">
                    {formatNullableRelativeDate(record.callTime)}
                  </span>
                </div>
                {record.remark ? (
                  <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#667085]">
                    {record.remark}
                  </p>
                ) : null}
              </div>
            ))}
            {!latestCall && detailCalls.length === 0 ? (
              <div className="rounded-[16px] bg-[#f7f8fb] px-4 py-6 text-center text-[14px] text-[#98a1af]">
                暂无通话记录
              </div>
            ) : null}
          </div>
        </div>

        {detail?.timeline.followUpTasks.length ? (
          <div className="mt-4 rounded-[22px] bg-white px-5 py-5">
            <h3 className="text-[18px] font-semibold text-[#20242c]">跟进待办</h3>
            <div className="mt-3 space-y-3">
              {detail.timeline.followUpTasks.slice(0, 3).map((task) => (
                <div
                  key={task.id}
                  className="rounded-[16px] border border-black/5 bg-[#fbfcfe] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[15px] font-medium text-[#20242c]">
                      {task.subject}
                    </span>
                    <span className="shrink-0 text-[12px] text-[#98a1af]">
                      {formatNullableRelativeDate(task.dueAt)}
                    </span>
                  </div>
                  {task.content ? (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#667085]">
                      {task.content}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {detailOrders.length > 0 ? (
          <div className="mt-4 rounded-[22px] bg-white px-5 py-5">
            <h3 className="text-[18px] font-semibold text-[#20242c]">历史订单</h3>
            <div className="mt-3 space-y-3">
              {detailOrders.slice(0, 3).map((order) => (
                <div
                  key={order.id}
                  className="rounded-[16px] border border-black/5 bg-[#fbfcfe] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-[15px] font-medium text-[#20242c]">
                      {order.tradeNo}
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-[#1677ff]">
                      ¥{formatMoney(order.finalAmount)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[12px] text-[#98a1af]">
                    <span>{order.tradeStatus}</span>
                    <span>{formatNullableRelativeDate(order.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {displayRemark ? (
          <div className="mt-4 rounded-[22px] bg-white px-5 py-5">
            <h3 className="text-[18px] font-semibold text-[#20242c]">客户备注</h3>
            <p className="mt-2 text-[14px] leading-6 text-[#667085]">{displayRemark}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CustomerOrderDrawer({
  customer,
  onClose,
  onOpenOrders,
  onStartCall,
}: Readonly<{
  customer: CustomerListItem | null;
  onClose: () => void;
  onOpenOrders: (customer: CustomerListItem) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
}>) {
  if (!customer) {
    return null;
  }

  const primaryProduct = getCustomerPrimaryProduct(customer) || "未填写意向商品";
  const latestCall = customer.callRecords[0] ?? null;

  return (
    <div className="fixed inset-0 z-[64]">
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭下单入口"
        className="absolute inset-0 bg-black/28 backdrop-blur-[8px]"
      />
      <section className="absolute inset-x-0 bottom-0 max-h-[82svh] overflow-y-auto rounded-t-[26px] bg-[#f7f8fb] px-5 pb-8 pt-4 shadow-[0_-22px_60px_rgba(16,24,40,0.18)]">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d0d5dd]" />

        <div className="rounded-[22px] bg-white px-5 py-5 shadow-[0_12px_28px_rgba(16,24,40,0.05)]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[#98a1af]">下单客户</div>
              <h2 className="mt-1 truncate text-[22px] font-semibold text-[#20242c]">
                {customer.name}
              </h2>
              <p className="mt-1 truncate text-[13px] text-[#667085]">{customer.phone}</p>
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

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[15px] bg-[#f7f8fb] px-3 py-3">
              <div className="truncate text-[18px] font-semibold text-[#20242c]">
                {customer.approvedTradeOrderCount}
              </div>
              <div className="mt-1 text-[12px] text-[#98a1af]">成交单</div>
            </div>
            <div className="rounded-[15px] bg-[#f7f8fb] px-3 py-3">
              <div className="truncate text-[18px] font-semibold text-[#20242c]">
                {formatMoney(customer.lifetimeTradeAmount)}
              </div>
              <div className="mt-1 text-[12px] text-[#98a1af]">成交额</div>
            </div>
            <div className="rounded-[15px] bg-[#f7f8fb] px-3 py-3">
              <div className="truncate text-[18px] font-semibold text-[#20242c]">
                {customer._count.callRecords}
              </div>
              <div className="mt-1 text-[12px] text-[#98a1af]">通话</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] bg-white px-5 py-5">
          <h3 className="text-[17px] font-semibold text-[#20242c]">订单信息</h3>
          <div className="mt-3 grid gap-3">
            <div className="rounded-[16px] bg-[#fbfcfe] px-4 py-3">
              <div className="text-[12px] text-[#98a1af]">意向商品</div>
              <div className="mt-1 line-clamp-2 text-[14px] font-medium leading-5 text-[#20242c]">
                {primaryProduct}
              </div>
            </div>
            <div className="rounded-[16px] bg-[#fbfcfe] px-4 py-3">
              <div className="text-[12px] text-[#98a1af]">最近通话</div>
              <div className="mt-1 truncate text-[14px] font-medium text-[#20242c]">
                {latestCall
                  ? `${latestCall.resultLabel} · ${formatNullableRelativeDate(latestCall.callTime)}`
                  : "暂无通话记录"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => onOpenOrders(customer)}
            className="inline-flex h-12 items-center justify-center rounded-[16px] bg-[#1677ff] text-[15px] font-semibold text-white shadow-[0_14px_28px_rgba(22,119,255,0.22)]"
          >
            <ClipboardList className="mr-2 h-5 w-5" aria-hidden />
            创建订单
          </button>
          <button
            type="button"
            onClick={() => onStartCall(customer, "detail", "crm-outbound")}
            className="inline-flex h-12 items-center justify-center rounded-[16px] bg-white text-[15px] font-semibold text-[#1677ff]"
          >
            外呼
          </button>
          <button
            type="button"
            onClick={() => onStartCall(customer, "detail", "local-phone")}
            className="inline-flex h-12 items-center justify-center rounded-[16px] bg-white text-[15px] font-semibold text-[#475467]"
          >
            本机
          </button>
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
    <div className="fixed inset-0 z-[66] bg-[#f7f8fb]">
      <section className="lbn-mobile-screen mx-auto min-h-[100svh] max-w-[520px] overflow-y-auto bg-[#f7f8fb] pb-8">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-black/5 bg-[#f7f8fb]/95 px-5 py-4 backdrop-blur-xl">
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

        <div className="grid gap-4 px-5 pt-5">
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
  return (
    <nav className="lbn-mobile-bottom-nav relative z-50 w-full shrink-0 border-t border-black/5 bg-white/95 px-3 pt-2 shadow-[0_-8px_24px_rgba(16,24,40,0.06)] backdrop-blur-xl">
      <div className="grid grid-cols-5">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[16px] text-[12px] font-medium",
                active ? "text-[#1677ff]" : "text-[#344054]",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className={cn("h-6 w-6", active ? "fill-[#1677ff]/10" : "")} aria-hidden />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="mx-auto mt-1 hidden h-1 w-28 rounded-full bg-[#101828]/45 supports-[padding:max(0px)]:block" />
    </nav>
  );
}

function getInitialTab(value: string | null): MobileTab {
  return tabs.some((tab) => tab.key === value) ? (value as MobileTab) : "messages";
}

export function MobileAppShell({
  data,
  currentUser,
  dashboardData,
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
  const [callMode, setCallMode] = useState<MobileCallMode>("crm-outbound");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const [orderCustomer, setOrderCustomer] = useState<CustomerListItem | null>(null);
  const [activeModule, setActiveModule] = useState<MobileModuleView | null>(null);
  const [outboundNotice, setOutboundNotice] = useState<MobileOutboundNotice | null>(null);
  const [recentDialCustomer, setRecentDialCustomer] = useState<RecentDialCustomer | null>(
    () => getRecentDialFromRecords(data.queueItems),
  );
  const [nativeRecorderState, setNativeRecorderState] = useState("浏览器模式");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNativeRecorderState(
        canUseNativeCallRecorder() ? "原生录音已就绪" : "浏览器拨号模式",
      );
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

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

  function submitSearch() {
    replaceMobileQuery({ search: searchText.trim() || null });
  }

  function changeQueue(queue: string) {
    replaceMobileQuery({ queue });
  }

  function applyCustomerFilters(next: {
    queue: string | null;
    executionClasses: string | null;
    assignedFrom: string | null;
    assignedTo: string | null;
  }) {
    replaceMobileQuery(next);
  }

  function openModule(module: MobileModuleView) {
    setActiveModule(module);
  }

  function openOrderEntry(customer: CustomerListItem) {
    setSelectedCustomer(null);
    setOrderCustomer(customer);
  }

  function openCustomerOrders(customer: CustomerListItem) {
    setOrderCustomer(null);
    setActiveModule({
      kind: "orders",
      title: `${customer.name} · 下单`,
      description: getCustomerPrimaryProduct(customer) || "客户订单入口",
    });
  }

  function startCustomerCall(
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode = callMode,
  ) {
    const recent = createRecentDialCustomer(
      customer,
      mode === "crm-outbound" ? "CRM 外呼" : "本机通话",
    );
    setRecentDialCustomer(recent);
    writeRecentDialCustomer(recent);

    if (mode === "crm-outbound") {
      void startCrmOutboundCall(customer);
      return;
    }

    startMobileCallFollowUpDial({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      triggerSource,
    });
  }

  async function startCrmOutboundCall(customer: CustomerListItem) {
    setOutboundNotice({
      tone: "pending",
      title: "CRM 外呼发起中",
      description: `${customer.name} · 正在提交到 CTI 线路`,
    });

    try {
      const response = await fetch("/api/outbound-calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: customer.id }),
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
        throw new Error(payload?.message ?? "CRM 外呼发起失败。");
      }

      const sessionId = payload?.call?.sessionId;
      setOutboundNotice({
        tone: "pending",
        title: "CRM 外呼已提交",
        description: "等待坐席接听和客户接通，录音由服务器归档。",
      });

      if (sessionId) {
        pollCrmOutboundSession(sessionId, customer.name);
      }
    } catch (error) {
      setOutboundNotice({
        tone: "failed",
        title: "CRM 外呼失败",
        description: error instanceof Error ? error.message : "CRM 外呼发起失败。",
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
            title: "CRM 外呼已结束",
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
            title: "CRM 外呼未接通",
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
    <main className="lbn-mobile-app mx-auto max-w-[520px] bg-[#f7f8fb] text-[#20242c] shadow-[0_0_0_1px_rgba(16,24,40,0.04)]">
      <div className="lbn-mobile-screen">
        {activeTab === "messages" ? (
          <MessagesTab
            data={data}
            dashboardData={dashboardData}
            onOpenCustomers={openCustomers}
            onOpenDialpad={openDialpad}
          />
        ) : null}
        {activeTab === "customers" ? (
          <CustomersTab
            data={data}
            searchText={searchText}
            setSearchText={setSearchText}
            canCreateCallRecord={canCreateCallRecord}
            onSearchSubmit={submitSearch}
            onQueueChange={changeQueue}
            onApplyFilters={applyCustomerFilters}
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
            setCallMode={setCallMode}
            canCreateCallRecord={canCreateCallRecord}
            recentDialCustomer={recentDialCustomer}
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
            onSelectCustomer={setSelectedCustomer}
          />
        ) : null}
        {activeTab === "me" ? (
          <MeTab
            user={currentUser}
            data={data}
            nativeRecorderState={nativeRecorderState}
            navigationGroups={navigationGroups}
            openMessages={openMessages}
            openCustomers={openCustomers}
            openDialpad={openDialpad}
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
        canCreateCallRecord={canCreateCallRecord}
        onStartCall={startCustomerCall}
        onOpenOrder={openOrderEntry}
        onClose={() => setSelectedCustomer(null)}
      />

      <CustomerOrderDrawer
        customer={orderCustomer}
        onClose={() => setOrderCustomer(null)}
        onOpenOrders={openCustomerOrders}
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
