import type { ReactNode } from "react";
import Link from "next/link";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerCallRecordsSection } from "@/components/customers/customer-call-records-section";
import { CustomerDetailTabs } from "@/components/customers/customer-detail-tabs";
import { ImportedCustomerDeletionPanel } from "@/components/customers/imported-customer-deletion-panel";
import { CustomerLiveRecordsSection } from "@/components/customers/customer-live-records-section";
import { CustomerPhoneSpotlight } from "@/components/customers/customer-phone-spotlight";
import { CustomerRecycleEntry } from "@/components/customers/customer-recycle-entry";
import { MobileCallFollowUpSheet } from "@/components/customers/mobile-call-followup-sheet";
import {
  CustomerEmptyState,
  CustomerTabSection,
  formatOwnerLabel,
} from "@/components/customers/customer-record-list";
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge";
import { CustomerTagsPanel } from "@/components/customers/customer-tags-panel";
import { CustomerWechatRecordsSection } from "@/components/customers/customer-wechat-records-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { PageContextLink } from "@/components/shared/page-context-link";
import { SmartLink } from "@/components/shared/smart-link";
import { StatusBadge } from "@/components/shared/status-badge";
import { TradeOrderForm } from "@/components/trade-orders/trade-order-form";
import {
  formatDateTime,
  formatRegion,
  getCustomerDetailTabGroupMeta,
  getCustomerDetailTabMeta,
  getCustomerExecutionDisplayDescription,
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
  getCustomerStatusLabel,
  isCustomerExecutionDisplayTemporary,
  type CustomerDetailTab,
} from "@/lib/customers/metadata";
import {
  getCustomerDetailCallsData,
  getCustomerDetailGiftsData,
  getCustomerDetailLiveData,
  getCustomerDetailLogsData,
  getCustomerDetailOrdersData,
  getCustomerDetailProfileData,
  getCustomerDetailShell,
  getCustomerDetailWechatData,
} from "@/lib/customers/queries";
import {
  appendCustomerDetailNavigationContext,
  type CustomerDetailNavigationContext,
} from "@/lib/customers/public-pool-filter-url";
import {
  getCustomerOwnershipModeLabel,
  publicPoolReasonLabels,
} from "@/lib/customers/public-pool-metadata";
import { getCustomerTradeOrderComposerData } from "@/lib/trade-orders/queries";
import {
  formatCurrency,
  getCodCollectionStatusLabel,
  getGiftQualificationSourceLabel,
  getGiftReviewStatusLabel,
  getLogisticsFollowUpTaskStatusLabel,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderReviewStatusLabel,
  getShippingFulfillmentStatusLabel,
  getShippingReportStatusLabel,
  getShippingStatusLabel,
} from "@/lib/fulfillment/metadata";
import { getLeadSourceLabel, getLeadStatusLabel } from "@/lib/leads/metadata";
import type {
  RecycleFinalizePreview,
  RecycleMoveGuard,
} from "@/lib/recycle-bin/types";
import { cn } from "@/lib/utils";

type CustomerDetailShellData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailShell>>
>;
type CustomerProfileData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailProfileData>>
>;
type CustomerCallsData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailCallsData>>
>;
type CustomerWechatData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailWechatData>>
>;
type CustomerLiveData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailLiveData>>
>;
type CustomerOrdersData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailOrdersData>>
>;
type TradeOrderComposerData = NonNullable<
  Awaited<ReturnType<typeof getCustomerTradeOrderComposerData>>
>;
type CustomerGiftsData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailGiftsData>>
>;
type CustomerLogsData = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailLogsData>>
>;
type CustomerCallResultOptions = NonNullable<
  Awaited<ReturnType<typeof getCustomerDetailCallsData>>
>["callResultOptions"];

type ImportedCustomerDeletionAction = (input: {
  customerId: string;
  reason: string;
}) => Promise<{
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
}>;

type ImportedCustomerDeletionReviewAction = (input: {
  requestId: string;
  decision: "approve" | "reject";
  reason?: string;
}) => Promise<{
  status: "success" | "error";
  message: string;
  redirectTo: string | null;
}>;

type UpdateCustomerProfileAction = (formData: FormData) => Promise<void>;

type MoveCustomerToRecycleBinAction = (formData: FormData) => Promise<{
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
  guard?: RecycleMoveGuard;
  finalizePreview?: RecycleFinalizePreview | null;
}>;

type CustomerDetailTabDataMap = {
  profile: CustomerProfileData;
  calls: CustomerCallsData;
  wechat: CustomerWechatData;
  live: CustomerLiveData;
  orders: CustomerOrdersData;
  gifts: CustomerGiftsData;
  logs: CustomerLogsData;
};

type SummaryTone = "default" | "info" | "warning" | "danger" | "success";

type SummaryCard = {
  label?: string;
  eyebrow?: string;
  value: string;
  description?: string;
  note: string;
  href: string;
  tone?: SummaryTone;
};

type PortraitSignal = {
  label: string;
  value: string;
  description?: string;
};

type DetailField = {
  label: string;
  value: ReactNode;
  span?: "full";
};

type RiskState = {
  title: string;
  description: string;
  tone: SummaryTone;
  tab: CustomerDetailTab;
};

const summaryToneClassName: Record<SummaryTone, string> = {
  default: "border-[var(--color-border-soft)]",
  info: "border-[rgba(111,141,255,0.16)]",
  warning: "border-[rgba(240,195,106,0.18)]",
  danger: "border-[rgba(255,148,175,0.18)]",
  success: "border-[rgba(87,212,176,0.18)]",
};

const customerProfileStatusOptions = [
  { value: "ACTIVE", label: getCustomerStatusLabel("ACTIVE") },
  { value: "DORMANT", label: getCustomerStatusLabel("DORMANT") },
  { value: "LOST", label: getCustomerStatusLabel("LOST") },
  { value: "BLACKLISTED", label: getCustomerStatusLabel("BLACKLISTED") },
] as const;

function formatLeadSourceSummary(
  source: CustomerDetailShellData["importSummary"]["firstSource"],
) {
  return source ? getLeadSourceLabel(source) : "暂无";
}

function getCustomerTotalOrderCount(shell: CustomerDetailShellData) {
  return shell.tradeOrderSummary.approvedCount || shell._count.salesOrders;
}

function getEngagementStageLabel(shell: CustomerDetailShellData) {
  if (shell._count.liveInvitations > 0) {
    return "已进入直播邀约";
  }

  if (shell._count.wechatRecords > 0) {
    return "已进入微信经营";
  }

  if (shell._count.callRecords > 0) {
    return "已进入电话跟进";
  }

  return "待建立首触达";
}

function getActiveTabCount(tab: CustomerDetailTab, shell: CustomerDetailShellData) {
  switch (tab) {
    case "calls":
      return shell._count.callRecords;
    case "wechat":
      return shell._count.wechatRecords;
    case "live":
      return shell._count.liveInvitations;
    case "orders":
      return shell._count.salesOrders;
    case "gifts":
      return shell._count.giftRecords;
    case "logs":
      return shell.operationLogCount;
    default:
      return null;
  }
}

function formatDateTimeSummary(
  value: Date | null | undefined,
  emptyLabel = "暂无",
) {
  return value ? formatDateTime(value) : emptyLabel;
}

function getDaysSince(value: Date | null | undefined) {
  if (!value) {
    return null;
  }

  const diff = Date.now() - value.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function formatAgeSummary(
  value: Date | null | undefined,
  emptyLabel = "暂无",
) {
  const days = getDaysSince(value);

  if (days === null) {
    return emptyLabel;
  }

  if (days <= 0) {
    return "今天";
  }

  if (days === 1) {
    return "1 天前";
  }

  return `${days} 天前`;
}

function DetailFieldGrid({
  items,
  columns = "two",
}: Readonly<{
  items: DetailField[];
  columns?: "two" | "three";
}>) {
  const isThreeColumn = columns === "three";

  return (
    <div
      className={cn(
        "grid gap-x-6 gap-y-4",
        isThreeColumn ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2",
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "space-y-1.5 border-b border-[var(--color-border-soft)] pb-3",
            item.span === "full" &&
              (isThreeColumn ? "md:col-span-2 xl:col-span-3" : "md:col-span-2"),
          )}
        >
          <p className="crm-detail-label">
            {item.label}
          </p>
          <div className="text-sm leading-6 text-[var(--foreground)]">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function buildCustomerTabHref(
  customerId: string,
  tab: CustomerDetailTab,
  navigationContext?: CustomerDetailNavigationContext,
) {
  const baseHref =
    tab === "profile" ? `/customers/${customerId}` : `/customers/${customerId}?tab=${tab}`;

  return appendCustomerDetailNavigationContext(baseHref, navigationContext);
}

function buildCustomerTradeOrderHref(
  customerId: string,
  tradeOrderId?: string,
  navigationContext?: CustomerDetailNavigationContext,
) {
  const params = new URLSearchParams();
  params.set("tab", "orders");
  params.set("createTradeOrder", "1");

  if (tradeOrderId) {
    params.set("tradeOrderId", tradeOrderId);
  }

  return appendCustomerDetailNavigationContext(
    `/customers/${customerId}?${params.toString()}`,
    navigationContext,
  );
}

function appendHrefSearchParam(href: string, key: string, value: string) {
  const url = new URL(href, "https://crm.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}

function getCustomerDetailBackLabel(
  navigationContext: CustomerDetailNavigationContext,
) {
  return navigationContext.from === "public-pool"
    ? "返回公海池"
    : "返回客户中心";
}

function getCustomerIdentitySummary(shell: CustomerDetailShellData) {
  const region = formatRegion(shell.province, shell.city, shell.district);
  const latestTime = shell.importSummary.latestImportAt
    ? `最近接入 ${formatDateTime(shell.importSummary.latestImportAt)}`
    : `创建于 ${formatDateTime(shell.createdAt)}`;

  return [
    region !== "未填写" ? region : null,
    shell.wechatId?.trim() ? `微信 ${shell.wechatId.trim()}` : null,
    latestTime,
  ]
    .filter(Boolean)
    .join(" / ");
}

function getCustomerMonogram(name: string) {
  const compact = name.replace(/\s+/g, "").trim();
  return compact.slice(0, 2).toUpperCase() || "C";
}

function getOverviewRiskState(
  shell: CustomerDetailShellData,
  publicPoolReasonLabel: string,
): RiskState {
  const daysSinceEffective = getDaysSince(shell.lastEffectiveFollowUpAt);

  if (shell.ownershipMode === "PUBLIC") {
    return {
      title: "公海待承接",
      description: `客户当前处于公海上下文，入池原因：${publicPoolReasonLabel}。`,
      tone: "warning",
      tab: "profile",
    };
  }

  if (!shell.lastEffectiveFollowUpAt) {
    return {
      title: "待首个有效跟进",
      description: "还没有形成有效跟进记录，建议优先完成首个关键触达。",
      tone: "warning",
      tab: "calls",
    };
  }

  if (daysSinceEffective !== null && daysSinceEffective >= 14) {
    return {
      title: "长期未推进",
      description: `最近有效跟进停留在 ${formatDateTime(shell.lastEffectiveFollowUpAt)}。`,
      tone: "danger",
      tab: "calls",
    };
  }

  if (shell.logisticsFollowUpCount > 0) {
    return {
      title: "存在履约提醒",
      description: `当前有 ${shell.logisticsFollowUpCount} 条物流跟进提醒待关注。`,
      tone: "info",
      tab: "orders",
    };
  }

  if (shell.importSummary.linkedLeadCount > 1) {
    return {
      title: "存在来源归并",
      description: `当前已关联 ${shell.importSummary.linkedLeadCount} 条线索，建议核对来源链路。`,
      tone: "info",
      tab: "profile",
    };
  }

  return {
    title: "当前经营稳定",
    description: "暂无明显异常，可继续围绕跟进与成交结果推进。",
    tone: "success",
    tab: "profile",
  };
}

function getFollowUpEntryTab(
  canCreateCalls: boolean,
  canCreateWechat: boolean,
  canManageLiveInvitations: boolean,
) {
  if (canCreateCalls) {
    return "calls" as const;
  }

  if (canCreateWechat) {
    return "wechat" as const;
  }

  if (canManageLiveInvitations) {
    return "live" as const;
  }

  return "orders" as const;
}

function OverviewSummaryCard({
  card,
}: Readonly<{
  card: SummaryCard;
}>) {
  return (
    <SmartLink
      href={card.href}
      scrollTargetId="customer-main"
      className={cn(
        "group rounded-[1.08rem] border bg-[var(--color-shell-surface)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-[1px] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]",
        summaryToneClassName[card.tone ?? "default"],
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
        {card.eyebrow ?? card.label ?? "摘要"}
      </p>
      <p className="mt-2 text-[1.08rem] font-semibold tracking-[-0.04em] text-[var(--foreground)]">
        {card.value}
      </p>
      {card.description ? (
        <p className="mt-1 text-[12px] leading-5 text-[var(--foreground)]/78">
          {card.description}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
        {card.note}
      </p>
    </SmartLink>
  );
}

function PortraitFact({
  label,
  value,
  description,
}: Readonly<{
  label: string;
  value: ReactNode;
  description?: string;
}>) {
  return (
    <div className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3.5 py-3">
      <p className="crm-detail-label">{label}</p>
      <div className="mt-1.5 text-[13px] font-medium leading-5 text-[var(--foreground)]">
        {value}
      </div>
      {description ? (
        <p className="mt-1 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function PortraitActionLink({
  href,
  label,
  emphasis = "default",
}: Readonly<{
  href: string;
  label: string;
  emphasis?: "default" | "primary";
}>) {
  return (
    <SmartLink
      href={href}
      scrollTargetId="customer-main"
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-[border-color,background-color,color,transform,box-shadow] duration-150 hover:-translate-y-[1px]",
        emphasis === "primary"
          ? "border-[rgba(122,154,255,0.18)] bg-[var(--color-panel)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)] hover:border-[rgba(122,154,255,0.24)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]"
          : "border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[var(--color-sidebar-muted)] hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] hover:shadow-[var(--color-shell-shadow-sm)]",
      )}
    >
      {label}
    </SmartLink>
  );
}

function PortraitSignalRail({
  items,
}: Readonly<{
  items: PortraitSignal[];
}>) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3"
        >
          <p className="crm-detail-label">{item.label}</p>
          <p className="mt-1.5 text-[13px] font-medium leading-5 text-[var(--foreground)]">
            {item.value}
          </p>
          {item.description ? (
            <p className="mt-1 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
              {item.description}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CompactArchiveCard({
  title,
  meta,
  description,
  href,
  hrefLabel,
}: Readonly<{
  title: string;
  meta: string[];
  description?: string;
  href?: string;
  hrefLabel?: string;
}>) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow] hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          {description ? (
            <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">{description}</p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {meta.map((item, index) => (
              <span key={`${index}-${item}`} className="inline-flex max-w-full items-center gap-2">
                {index > 0 ? <span className="text-[var(--color-border)]">/</span> : null}
                <span className="break-words">{item}</span>
              </span>
            ))}
          </div>
        </div>
        {href && hrefLabel ? (
          <Link href={href} scroll={false} className="crm-text-link shrink-0 pt-0.5">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function QuietSectionMeta({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <span className="text-[12px] font-medium leading-5 text-[var(--color-sidebar-muted)]">
      {children}
    </span>
  );
}

function OrderArchiveCard({
  title,
  amount,
  summary,
  meta,
  href,
  hrefLabel,
}: Readonly<{
  title: string;
  amount: string;
  summary: string;
  meta: string[];
  href: string;
  hrefLabel: string;
}>) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow] duration-150 hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">{summary}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {meta.map((item, index) => (
              <span key={`${index}-${item}`} className="max-w-full break-words">
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
          <p className="text-[1.06rem] font-semibold tracking-[-0.04em] text-[var(--foreground)]">
            {amount}
          </p>
          <Link href={href} scroll={false} className="crm-text-link">
            {hrefLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}

function AuditTimelineEntry({
  title,
  actorLabel,
  timeLabel,
  description,
}: Readonly<{
  title: string;
  actorLabel: string;
  timeLabel: string;
  description?: string;
}>) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)]">
      <div className="flex gap-3">
        <div className="flex flex-col items-center pt-1">
          <span className="h-2 w-2 rounded-full bg-[rgba(122,154,255,0.5)]" />
          <span className="mt-1 h-full w-px bg-[var(--color-border-soft)]" />
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-start lg:justify-between">
            <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
            <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">{timeLabel}</p>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {actorLabel}
          </p>
          {description ? (
            <p className="mt-2 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function renderProfileTab({
  shell,
  data,
  canManageTags,
  canEditProfile,
  isEditingProfile,
  updateCustomerProfileAction,
  navigationContext,
  requestImportedCustomerDeletionAction,
  reviewImportedCustomerDeletionAction,
  deleteImportedCustomerDirectAction,
}: Readonly<{
  shell: CustomerDetailShellData;
  data: CustomerProfileData;
  canManageTags: boolean;
  canEditProfile: boolean;
  isEditingProfile: boolean;
  updateCustomerProfileAction?: UpdateCustomerProfileAction;
  navigationContext?: CustomerDetailNavigationContext;
  requestImportedCustomerDeletionAction: ImportedCustomerDeletionAction;
  reviewImportedCustomerDeletionAction: ImportedCustomerDeletionReviewAction;
  deleteImportedCustomerDirectAction: ImportedCustomerDeletionAction;
}>) {
  const archiveHref = buildCustomerTabHref(shell.id, "profile", navigationContext);
  const editProfileHref = appendHrefSearchParam(archiveHref, "editProfile", "1");
  const executionDisplayInput = {
    executionClass: shell.executionClass,
    newImported: shell.newImported,
    pendingFirstCall: shell.pendingFirstCall,
  };
  const executionClassLabel = getCustomerExecutionDisplayLongLabel(executionDisplayInput);
  const executionClassDescription = getCustomerExecutionDisplayDescription(executionDisplayInput);
  const executionClassVariant = getCustomerExecutionDisplayVariant(executionDisplayInput);
  const profileSectionActions = canEditProfile ? (
    isEditingProfile ? (
      <Link href={archiveHref} scroll={false} className="crm-text-link">
        取消编辑
      </Link>
    ) : (
      <Link href={editProfileHref} scroll={false} className="crm-text-link">
        编辑资料
      </Link>
    )
  ) : null;
  const regionSummary = formatRegion(shell.province, shell.city, shell.district);
  const teamLabel = shell.publicPoolTeam?.name ?? shell.owner?.team?.name ?? "暂无团队";
  const profileSignals: PortraitSignal[] = [
    {
      label: "正式分类",
      value: executionClassLabel,
      description: executionClassDescription,
    },
    {
      label: "地区",
      value: regionSummary,
      description: `归属团队 ${teamLabel}`,
    },
    {
      label: "接入时间",
      value: formatDateTimeSummary(shell.createdAt),
      description: `最近更新 ${formatDateTime(shell.updatedAt)}`,
    },
    {
      label: "经营归属",
      value: formatOwnerLabel(shell.owner),
      description: `保护期 ${formatDateTimeSummary(shell.claimLockedUntil, "未锁定")}`,
    },
  ];
  const continuationData = data.customerImportSummary?.data ?? null;
  const continuationCreatedAt = data.customerImportSummary?.createdAt ?? null;
  const continuationOwnerOutcomeLabel = continuationData
    ? continuationData.ownerOutcome === "ASSIGNED"
      ? "已匹配负责人"
      : continuationData.ownerOutcome === "KEPT_EXISTING"
        ? "保留原负责人"
        : continuationData.ownerOutcome === "PUBLIC_POOL"
          ? "进入公海"
          : "负责人未识别"
    : null;
  const continuationActionLabel = continuationData
    ? continuationData.action === "CREATED_CUSTOMER"
      ? "新建客户"
      : "命中已有客户"
    : null;
  const continuationSignals: PortraitSignal[] = continuationData
    ? [
        {
          label: "导入批次",
          value: continuationData.batchFileName,
          description: `导入时间 ${formatDateTimeSummary(continuationCreatedAt)}`,
        },
        {
          label: "本次结果",
          value: continuationActionLabel ?? "暂无",
          description: continuationOwnerOutcomeLabel ?? "暂无负责人结果",
        },
        {
          label: "迁移前累计消费",
          value: continuationData.summary.historicalTotalSpent || "暂无",
          description:
            continuationData.summary.purchaseCount !== null
              ? `${continuationData.summary.purchaseCount} 次购买`
              : "暂无购买次数",
        },
        {
          label: "最近购买 / 意向",
          value: continuationData.summary.latestPurchasedProduct || "暂无",
          description: `最近意向 ${continuationData.summary.latestIntent || "暂无"}`,
        },
      ]
    : [];
  const sourceSignals: PortraitSignal[] = [
    {
      label: "首个来源",
      value: formatLeadSourceSummary(shell.importSummary.firstSource),
      description: `最近来源 ${formatLeadSourceSummary(shell.importSummary.latestSource)}`,
    },
    {
      label: "最近接入",
      value: shell.importSummary.latestImportAt
        ? formatDateTime(shell.importSummary.latestImportAt)
        : "暂无接入记录",
      description: `负责人 ${formatOwnerLabel(shell.owner)}`,
    },
    {
      label: "关联线索",
      value: String(shell.importSummary.linkedLeadCount),
      description: `导入 / 归并事件 ${shell.importSummary.importEventCount} 条`,
    },
    {
      label: "当前经营状态",
      value: executionClassLabel,
      description: executionClassDescription,
    },
  ];

  return (
    <div className="space-y-5">
      <CustomerTabSection
        eyebrow="客户档案"
        title="身份档案"
        description="静态资料、标签与当前经营分类集中保留在这里。"
        actions={profileSectionActions}
      >
        <CustomerTagsPanel
          customerId={shell.id}
          redirectTo={archiveHref}
          tags={data.customerTags}
          availableTags={data.availableTags}
          canManage={canManageTags}
          variant="compact"
          className="border-none bg-transparent px-0 py-0"
        />

        <div className="mt-5">
          {isEditingProfile && updateCustomerProfileAction ? (
            <form action={updateCustomerProfileAction} className="space-y-4">
              <input type="hidden" name="customerId" value={shell.id} />
              <input type="hidden" name="redirectTo" value={archiveHref} />

              <div className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-3 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                当前档案页仅编辑基础资料。正式分类已切到 `ABCDE` 经营分类，由通话 / 加微 / 邀约 / 成交信号自动映射；手机号、负责人、归属模式、公海字段与保护期仍保持只读。
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    姓名
                  </span>
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={shell.name}
                    className="crm-input"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    手机号
                  </span>
                  <div className="crm-input flex items-center border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-sm text-[var(--color-sidebar-muted)]">
                    {shell.phone}
                  </div>
                </div>

                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    微信号
                  </span>
                  <input
                    name="wechatId"
                    maxLength={100}
                    defaultValue={shell.wechatId ?? ""}
                    className="crm-input"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    客户状态
                  </span>
                  <select
                    name="status"
                    defaultValue={shell.status}
                    className="crm-select"
                  >
                    {customerProfileStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    正式分类
                  </span>
                  <div className="crm-subtle-panel flex min-h-[2.6rem] items-center justify-between gap-3 border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2.5">
                    <StatusBadge
                      label={executionClassLabel}
                      variant={executionClassVariant}
                    />
                    <span className="text-right text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                      {executionClassDescription}
                    </span>
                  </div>
                </div>

                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    省份
                  </span>
                  <input
                    name="province"
                    maxLength={50}
                    defaultValue={shell.province ?? ""}
                    className="crm-input"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    城市
                  </span>
                  <input
                    name="city"
                    maxLength={50}
                    defaultValue={shell.city ?? ""}
                    className="crm-input"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    区县
                  </span>
                  <input
                    name="district"
                    maxLength={50}
                    defaultValue={shell.district ?? ""}
                    className="crm-input"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    最近更新
                  </span>
                  <div className="crm-input flex items-center border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-sm text-[var(--color-sidebar-muted)]">
                    {formatDateTime(shell.updatedAt)}
                  </div>
                </div>

                <label className="space-y-2 md:col-span-2 xl:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    地址
                  </span>
                  <input
                    name="address"
                    maxLength={500}
                    defaultValue={shell.address ?? ""}
                    className="crm-input"
                  />
                </label>

                <label className="space-y-2 md:col-span-2 xl:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                    备注
                  </span>
                  <textarea
                    name="remark"
                    rows={4}
                    maxLength={1000}
                    defaultValue={shell.remark ?? ""}
                    className="crm-textarea min-h-[7rem]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  className="crm-button crm-button-primary min-h-0 px-3.5 py-2 text-sm"
                >
                  保存资料
                </button>
                <Link
                  href={archiveHref}
                  scroll={false}
                  className="crm-button crm-button-secondary min-h-0 px-3.5 py-2 text-sm"
                >
                  取消
                </Link>
                <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                  保存成功后可在 logs tab 查看本次修改摘要。
                </p>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <PortraitSignalRail items={profileSignals} />
              <DetailFieldGrid
                items={[
                  { label: "手机号", value: shell.phone },
                  { label: "微信号", value: shell.wechatId?.trim() || "未填写" },
                  { label: "地址", value: shell.address?.trim() || "未填写", span: "full" },
                  { label: "备注", value: shell.remark?.trim() || "暂无备注", span: "full" },
                ]}
              />
            </div>
          )}
        </div>
      </CustomerTabSection>

      {continuationData ? (
        <CustomerTabSection
          eyebrow="续接脉络"
          title="续接参考摘要"
          description="保留迁移承接画像，只做经营参考，不覆盖当前系统真实成交。"
          actions={
            <Link
              href={`/lead-imports/${continuationData.batchId}?mode=customer_continuation`}
              className="crm-text-link"
            >
              查看导入批次
            </Link>
          }
        >
          <div className="space-y-4">
            <PortraitSignalRail items={continuationSignals} />
            <DetailFieldGrid
              items={[
                {
                  label: "最近跟进时间",
                  value: continuationData.summary.latestFollowUpAt || "暂无",
                },
                {
                  label: "最近跟进结果",
                  value: continuationData.summary.latestFollowUpResult || "暂无",
                },
                {
                  label: "已挂接标签",
                  value: continuationData.tags.assigned.join(" / ") || "暂无",
                  span: "full",
                },
                {
                  label: "未识别标签",
                  value: continuationData.tags.unresolved.join(" / ") || "无",
                },
                {
                  label: "迁移备注摘要",
                  value: continuationData.summary.note || "暂无",
                  span: "full",
                },
              ]}
            />
          </div>
          <p className="mt-4 text-sm leading-6 text-[var(--color-sidebar-muted)]">
            这里展示的是迁移承接参考摘要，不会并入新系统真实累计成交。
          </p>
        </CustomerTabSection>
      ) : null}

      <CustomerTabSection
        eyebrow="经营脉络"
        title="来源与导入脉络"
        description="从线索接入、导入归并到当前客户承接，形成一条完整画像链路。"
      >
        <PortraitSignalRail items={sourceSignals} />

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-4 shadow-[var(--color-shell-shadow-sm)]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="crm-detail-label">线索回流</p>
                <QuietSectionMeta>{data.leads.length} 条线索</QuietSectionMeta>
              </div>
              <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                核对最初承接来源、原始线索状态和回流轨迹。
              </p>
            </div>

            <div className="mt-3">
              {data.leads.length > 0 ? (
                <div className="space-y-3">
                  {data.leads.map((lead) => (
                    <CompactArchiveCard
                      key={lead.id}
                      title={lead.name?.trim() || lead.phone}
                      meta={[
                        `来源 ${getLeadSourceLabel(lead.source)}`,
                        `状态 ${getLeadStatusLabel(lead.status)}`,
                        `创建于 ${formatDateTime(lead.createdAt)}`,
                      ]}
                      description={`手机号 ${lead.phone}`}
                      href={`/leads/${lead.id}`}
                      hrefLabel="查看线索"
                    />
                  ))}
                </div>
              ) : (
                <CustomerEmptyState
                  className="rounded-[1rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-4 shadow-none"
                  title="暂无关联线索"
                  description="暂无线索记录。"
                />
              )}
            </div>
          </div>

          <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-4 shadow-[var(--color-shell-shadow-sm)]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="crm-detail-label">导入历史</p>
                <QuietSectionMeta>{data.mergeLogs.length} 条记录</QuietSectionMeta>
              </div>
              <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                保留导入批次、归并动作和标签同步记录，用于来源审计。
              </p>
            </div>

            <div className="mt-3">
              {data.mergeLogs.length > 0 ? (
                <div className="space-y-3">
                  {data.mergeLogs.map((record) => {
                    const liveLead =
                      record.lead && !record.lead.rolledBackAt ? record.lead : null;
                    const leadName =
                      liveLead?.name?.trim() ||
                      record.leadNameSnapshot?.trim() ||
                      liveLead?.phone ||
                      record.leadPhoneSnapshot ||
                      record.leadIdSnapshot ||
                      "未识别线索";
                    const leadPhone =
                      liveLead?.phone ||
                      record.leadPhoneSnapshot ||
                      record.leadIdSnapshot ||
                      "-";

                    return (
                      <CompactArchiveCard
                        key={record.id}
                        title={`${leadName} / ${record.batch.fileName}`}
                        meta={[
                          `来源 ${getLeadSourceLabel(record.source)}`,
                          `动作 ${record.action}`,
                          `标签同步 ${record.tagSynced ? "已同步" : "未同步"}`,
                          `时间 ${formatDateTime(record.createdAt)}`,
                        ]}
                        description={
                          liveLead
                            ? `线索手机号 ${leadPhone}`
                            : `线索手机号 ${leadPhone}（历史快照）`
                        }
                        href={liveLead ? `/leads/${liveLead.id}` : undefined}
                        hrefLabel={liveLead ? "查看线索" : undefined}
                      />
                    );
                  })}
                </div>
              ) : (
                <CustomerEmptyState
                  className="rounded-[1rem] border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-4 shadow-none"
                  title="暂无导入归并记录"
                  description="暂无导入历史。"
                />
              )}
            </div>
          </div>
        </div>
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="删除审批"
        title="导入客户删除"
        description="保留删除申请、审批与直接删除的审计链。"
      >
        <ImportedCustomerDeletionPanel
          guard={data.importedCustomerDeletion}
          requestAction={requestImportedCustomerDeletionAction}
          reviewAction={reviewImportedCustomerDeletionAction}
          directDeleteAction={deleteImportedCustomerDirectAction}
        />
      </CustomerTabSection>
    </div>
  );
}

function renderOrdersList(data: CustomerOrdersData) {
  return data.length > 0 ? (
    <div className="space-y-3">
      {data.map((record) => {
        const latestCodRecord = record.shippingTask?.codCollectionRecords?.[0] ?? null;
        const latestLogisticsTask =
          record.shippingTask?.logisticsFollowUpTasks?.[0] ?? null;

        return (
          <OrderArchiveCard
            key={record.id}
            title={
              record.tradeOrder?.tradeNo
                ? `${record.tradeOrder.tradeNo} / ${record.subOrderNo || record.orderNo}`
                : record.orderNo
            }
            amount={formatCurrency(record.finalAmount)}
            summary={`收件信息 ${record.receiverNameSnapshot} / ${record.receiverPhoneSnapshot} / ${record.receiverAddressSnapshot}`}
            meta={[
              `负责人 ${formatOwnerLabel(record.owner)}`,
              `供应商 ${record.supplier.name}`,
              record.tradeOrder?.tradeNo
                ? `成交主单 ${record.tradeOrder.tradeNo}`
                : `订单编号 ${record.orderNo}`,
              record.subOrderNo
                ? `子单 ${record.subOrderNo}`
                : "单订单结构",
              `审核 ${getSalesOrderReviewStatusLabel(record.reviewStatus)}`,
              `收款 ${getSalesOrderPaymentSchemeLabel(record.paymentScheme)}`,
              `报单 ${
                record.shippingTask
                  ? getShippingReportStatusLabel(record.shippingTask.reportStatus)
                  : "未进入发货池"
              }`,
              `发货 ${
                record.shippingTask
                  ? getShippingFulfillmentStatusLabel(record.shippingTask.shippingStatus)
                  : "待审核"
              }`,
              `物流单号 ${record.shippingTask?.trackingNumber || "未回填"}`,
              latestLogisticsTask
                ? `物流跟进 ${latestLogisticsTask.owner.name} / ${getLogisticsFollowUpTaskStatusLabel(latestLogisticsTask.status)}`
                : "物流跟进 暂无任务",
              latestCodRecord
                ? `COD ${getCodCollectionStatusLabel(latestCodRecord.status)} / ${formatCurrency(latestCodRecord.collectedAmount)}`
                : "COD 不适用或未开始",
              `创建于 ${formatDateTime(record.createdAt)}`,
            ]}
            href={`/orders/${record.tradeOrder?.id ?? record.id}`}
            hrefLabel={record.tradeOrder ? "查看成交主单" : "查看订单"}
          />
        );
      })}
    </div>
  ) : (
    <CustomerEmptyState
      title="暂无订单记录"
      description="暂无成交记录。"
    />
  );
}

function renderOrdersTab({
  data,
  customerId,
  canCreateSalesOrders,
  tradeOrderComposer,
  navigationContext,
  saveTradeOrderDraftAction,
  submitTradeOrderForReviewAction,
}: Readonly<{
  data: CustomerOrdersData;
  customerId: string;
  canCreateSalesOrders: boolean;
  tradeOrderComposer: TradeOrderComposerData | null;
  navigationContext?: CustomerDetailNavigationContext;
  saveTradeOrderDraftAction?: (formData: FormData) => Promise<void>;
  submitTradeOrderForReviewAction?: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-5">
      {canCreateSalesOrders ? (
        <CustomerTabSection
          eyebrow="成交主单"
          title={tradeOrderComposer ? "当前成交草稿" : "成交入口"}
          description={
            tradeOrderComposer
              ? "已经存在草稿，继续在客户上下文里完成成交主单。"
              : "需要推进成交时，再从客户详情进入主单编辑。"
          }
          actions={
            <PortraitActionLink
              href={buildCustomerTradeOrderHref(
                customerId,
                tradeOrderComposer?.draft?.id,
                navigationContext,
              )}
              label={tradeOrderComposer ? "继续编辑草稿" : "创建成交主单"}
              emphasis="primary"
            />
          }
        >
          {tradeOrderComposer &&
          saveTradeOrderDraftAction &&
          submitTradeOrderForReviewAction ? (
            <TradeOrderForm
              customer={tradeOrderComposer.customer}
              paymentSchemeOptions={tradeOrderComposer.paymentSchemeOptions}
              skuOptions={tradeOrderComposer.skuOptions}
              bundleOptions={tradeOrderComposer.bundleOptions}
              draft={tradeOrderComposer.draft}
              saveDraftAction={saveTradeOrderDraftAction}
              submitForReviewAction={submitTradeOrderForReviewAction}
            />
          ) : (
            <div className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-4 text-sm leading-6 text-[var(--color-sidebar-muted)]">
              当前没有进行中的成交草稿。成交入口继续挂在客户画像里，需要推进时再进入。
            </div>
          )}
        </CustomerTabSection>
      ) : null}

      <CustomerTabSection
        eyebrow="成交记录"
        title="成交与履约轨迹"
        description="按成交时间回看订单、履约与 COD 的演进。"
        actions={<QuietSectionMeta>{data.length} 条记录</QuietSectionMeta>}
      >
        {renderOrdersList(data)}
      </CustomerTabSection>
    </div>
  );
}

function renderGiftsTab(data: CustomerGiftsData) {
  return (
    <CustomerTabSection
      eyebrow="礼品履约"
      title="礼品资格与履约轨迹"
      description="回看礼品达标、审核、运费与发货状态。"
      actions={<QuietSectionMeta>{data.length} 条记录</QuietSectionMeta>}
    >
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((record) => {
            const freightPlan = record.paymentPlans?.[0] ?? null;

            return (
              <CompactArchiveCard
                key={record.id}
                title={record.giftName}
                meta={[
                  `销售 ${formatOwnerLabel(record.sales)}`,
                  `资格来源 ${getGiftQualificationSourceLabel(record.qualificationSource)}`,
                  `审核状态 ${getGiftReviewStatusLabel(record.reviewStatus)}`,
                  `发货状态 ${getShippingStatusLabel(record.shippingStatus)}`,
                  `运费 ${formatCurrency(record.freightAmount)}`,
                  freightPlan
                    ? `运费计划 ${freightPlan.status} / 待收 ${formatCurrency(freightPlan.remainingAmount)}`
                    : "运费计划 未生成",
                  `物流单号 ${record.shippingTask?.trackingNumber || "未回填"}`,
                  `直播场次 ${record.liveSession?.title || "未关联"}`,
                  `创建于 ${formatDateTime(record.createdAt)}`,
                ]}
                description={record.remark?.trim() || "暂无备注"}
              />
            );
          })}
        </div>
      ) : (
        <CustomerEmptyState
          title="暂无礼品记录"
          description="暂无礼品记录。"
        />
      )}
    </CustomerTabSection>
  );
}

function renderLogsTab(data: CustomerLogsData) {
  return (
    <CustomerTabSection
      eyebrow="审计记录"
      title="经营审计时间线"
      description="保留客户从接入到成交的关键业务动作。"
      actions={<QuietSectionMeta>最近 {data.length} 条</QuietSectionMeta>}
    >
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((record) => (
            <AuditTimelineEntry
              key={record.id}
              title={`${record.module} / ${record.action}`}
              actorLabel={`操作人 ${formatOwnerLabel(record.actor)}`}
              timeLabel={formatDateTime(record.createdAt)}
              description={record.description?.trim() || "暂无说明"}
            />
          ))}
        </div>
      ) : (
        <CustomerEmptyState
          title="暂无操作日志"
          description="暂无日志记录。"
        />
      )}
    </CustomerTabSection>
  );
}

function renderTabContent({
  activeTab,
  shell,
  tabData,
  canCreateCalls,
  canCreateWechat,
  canManageLiveInvitations,
  canManageTags,
  canEditProfile,
  isEditingProfile,
  canCreateSalesOrders,
  tradeOrderComposer,
  navigationContext,
  updateCustomerProfileAction,
  saveTradeOrderDraftAction,
  submitTradeOrderForReviewAction,
  requestImportedCustomerDeletionAction,
  reviewImportedCustomerDeletionAction,
  deleteImportedCustomerDirectAction,
}: Readonly<{
  activeTab: CustomerDetailTab;
  shell: CustomerDetailShellData;
  tabData: CustomerDetailTabDataMap[CustomerDetailTab];
  canCreateCalls: boolean;
  canCreateWechat: boolean;
  canManageLiveInvitations: boolean;
  canManageTags: boolean;
  canEditProfile: boolean;
  isEditingProfile: boolean;
  canCreateSalesOrders: boolean;
  tradeOrderComposer: TradeOrderComposerData | null;
  navigationContext?: CustomerDetailNavigationContext;
  updateCustomerProfileAction?: UpdateCustomerProfileAction;
  saveTradeOrderDraftAction?: (formData: FormData) => Promise<void>;
  submitTradeOrderForReviewAction?: (formData: FormData) => Promise<void>;
  requestImportedCustomerDeletionAction: ImportedCustomerDeletionAction;
  reviewImportedCustomerDeletionAction: ImportedCustomerDeletionReviewAction;
  deleteImportedCustomerDirectAction: ImportedCustomerDeletionAction;
}>) {
  switch (activeTab) {
    case "profile":
      return renderProfileTab({
        shell,
        data: tabData as CustomerProfileData,
        canManageTags,
        canEditProfile,
        isEditingProfile,
        updateCustomerProfileAction,
        navigationContext,
        requestImportedCustomerDeletionAction,
        reviewImportedCustomerDeletionAction,
        deleteImportedCustomerDirectAction,
      });
    case "calls":
      return (
        <CustomerCallRecordsSection
          customerId={shell.id}
          records={(tabData as CustomerCallsData).records}
          resultOptions={(tabData as CustomerCallsData).callResultOptions}
          canCreate={canCreateCalls}
        />
      );
    case "wechat":
      return (
        <CustomerWechatRecordsSection
          customerId={shell.id}
          records={tabData as CustomerWechatData}
          canCreate={canCreateWechat}
        />
      );
    case "live": {
      const liveData = tabData as CustomerLiveData;

      return (
        <CustomerLiveRecordsSection
          customerId={shell.id}
          records={liveData.records}
          liveSessions={liveData.liveSessions}
          canManage={canManageLiveInvitations}
        />
      );
    }
    case "orders":
      return renderOrdersTab({
        data: tabData as CustomerOrdersData,
        customerId: shell.id,
        canCreateSalesOrders,
        tradeOrderComposer,
        navigationContext,
        saveTradeOrderDraftAction,
        submitTradeOrderForReviewAction,
      });
    case "gifts":
      return renderGiftsTab(tabData as CustomerGiftsData);
    case "logs":
      return renderLogsTab(tabData as CustomerLogsData);
    default:
      return null;
  }
}

export function CustomerDetailWorkbench({
  shell,
  activeTab,
  tabData,
  callResultOptions,
  notice,
  canCreateCalls,
  canCreateWechat,
  canManageLiveInvitations,
  canManageTags,
  canEditProfile,
  isEditingProfile,
  canCreateSalesOrders,
  tradeOrderComposer,
  navigationContext,
  customerRecycleGuard,
  customerFinalizePreview,
  moveCustomerToRecycleBinAction,
  updateCustomerProfileAction,
  saveTradeOrderDraftAction,
  submitTradeOrderForReviewAction,
  requestImportedCustomerDeletionAction,
  reviewImportedCustomerDeletionAction,
  deleteImportedCustomerDirectAction,
}: Readonly<{
  shell: CustomerDetailShellData;
  navigationContext: CustomerDetailNavigationContext;
  activeTab: CustomerDetailTab;
  tabData: CustomerDetailTabDataMap[CustomerDetailTab];
  callResultOptions: CustomerCallResultOptions;
  notice: { tone: "success" | "danger"; message: string } | null;
  canCreateCalls: boolean;
  canCreateWechat: boolean;
  canManageLiveInvitations: boolean;
  canManageTags: boolean;
  canEditProfile: boolean;
  isEditingProfile: boolean;
  canCreateSalesOrders: boolean;
  tradeOrderComposer: TradeOrderComposerData | null;
  updateCustomerProfileAction?: UpdateCustomerProfileAction;
  saveTradeOrderDraftAction?: (formData: FormData) => Promise<void>;
  submitTradeOrderForReviewAction?: (formData: FormData) => Promise<void>;
  customerRecycleGuard: RecycleMoveGuard | null;
  customerFinalizePreview: RecycleFinalizePreview | null;
  moveCustomerToRecycleBinAction?: MoveCustomerToRecycleBinAction;
  requestImportedCustomerDeletionAction: ImportedCustomerDeletionAction;
  reviewImportedCustomerDeletionAction: ImportedCustomerDeletionReviewAction;
  deleteImportedCustomerDirectAction: ImportedCustomerDeletionAction;
}>) {
  const activeTabMeta = getCustomerDetailTabMeta(activeTab);
  const activeGroupMeta = getCustomerDetailTabGroupMeta(activeTab);
  const activeTabCount = getActiveTabCount(activeTab, shell);
  const isPublicPoolContext = navigationContext.from === "public-pool";
  const publicPoolReasonLabel = shell.publicPoolReason
    ? publicPoolReasonLabels[shell.publicPoolReason]
    : "暂无入池原因";
  const ownershipLabel = getCustomerOwnershipModeLabel(shell.ownershipMode);
  const riskState = getOverviewRiskState(shell, publicPoolReasonLabel);
  const followUpEntryTab = getFollowUpEntryTab(
    canCreateCalls,
    canCreateWechat,
    canManageLiveInvitations,
  );
  const totalOrderCount = getCustomerTotalOrderCount(shell);
  const totalPurchaseAmount = formatCurrency(shell.tradeOrderSummary.lifetimeAmount);
  const executionDisplayInput = {
    executionClass: shell.executionClass,
    newImported: shell.newImported,
    pendingFirstCall: shell.pendingFirstCall,
  };
  const executionClassLabel = getCustomerExecutionDisplayLongLabel(executionDisplayInput);
  const executionClassDescription = getCustomerExecutionDisplayDescription(executionDisplayInput);
  const executionClassVariant = getCustomerExecutionDisplayVariant(executionDisplayInput);
  const hasTemporaryExecutionDisplay = isCustomerExecutionDisplayTemporary(executionDisplayInput);
  const firstSourceSummary = formatLeadSourceSummary(shell.importSummary.firstSource);
  const latestSourceSummary = formatLeadSourceSummary(shell.importSummary.latestSource);
  const engagementStageLabel = getEngagementStageLabel(shell);
  const portraitNarrative = hasTemporaryExecutionDisplay
    ? `客户由 ${firstSourceSummary} 接入，当前显示为“${executionClassLabel}”临时展示态，${executionClassDescription}。建议先完成首呼，再进入 A-E 正式经营分类。`
    : `客户由 ${firstSourceSummary} 接入，当前正式分类为“${executionClassLabel}”。${totalOrderCount > 0 ? `累计成交 ${totalPurchaseAmount}，共 ${totalOrderCount} 笔。` : "尚未形成成交。"}${riskState.description}`;
  const latestTradeSummary = shell.tradeOrderSummary.latestTradeAt
    ? formatDateTime(shell.tradeOrderSummary.latestTradeAt)
    : "暂无成交";
  const latestImportSummary = shell.importSummary.latestImportAt
    ? formatDateTime(shell.importSummary.latestImportAt)
    : "暂无接入";
  const currentTabSummary =
    activeTabCount !== null ? `${activeTabMeta.label} · ${activeTabCount} 条记录` : activeTabMeta.label;
  const portraitSignals: PortraitSignal[] = [
    {
      label: "线索接入",
      value: latestImportSummary,
      description: `首个来源 ${firstSourceSummary}`,
    },
    {
      label: "最近有效跟进",
      value: formatDateTimeSummary(shell.lastEffectiveFollowUpAt, "尚未形成"),
      description: shell.latestFollowUpAt
        ? `最近触达 ${formatDateTime(shell.latestFollowUpAt)}`
        : "还没有形成触达记录",
    },
    {
      label: "最近成交",
      value: latestTradeSummary,
      description:
        totalOrderCount > 0 ? `${totalOrderCount} 笔成交` : "还没有形成成交记录",
    },
    {
      label: "保护期",
      value: formatDateTimeSummary(shell.claimLockedUntil, "未锁定"),
      description: `归属 ${ownershipLabel}`,
    },
  ];
  const primaryAction = canCreateSalesOrders
    ? {
        label: tradeOrderComposer ? "继续编辑成交主单" : "创建成交主单",
        href: buildCustomerTradeOrderHref(
          shell.id,
          tradeOrderComposer?.draft?.id,
          navigationContext,
        ),
        description: tradeOrderComposer
          ? "回到当前草稿继续编辑。"
          : "从客户详情发起成交主单。",
        secondaryLabel: "查看跟进记录",
        secondaryHref: buildCustomerTabHref(shell.id, followUpEntryTab, navigationContext),
      }
    : {
        label: "进入跟进记录",
        href: buildCustomerTabHref(shell.id, followUpEntryTab, navigationContext),
        description: "先继续跟进。",
        secondaryLabel: "查看成交结果",
        secondaryHref: buildCustomerTabHref(shell.id, "orders", navigationContext),
      };
  const summaryCards: SummaryCard[] = [
    {
      eyebrow: "购买轨迹",
      value: totalOrderCount > 0 ? totalPurchaseAmount : "尚未成交",
      description:
        totalOrderCount > 0
          ? `${totalOrderCount} 笔成交 / 最近成交 ${formatAgeSummary(shell.tradeOrderSummary.latestTradeAt)}`
          : "还没有形成成交记录",
      href: buildCustomerTabHref(shell.id, "orders", navigationContext),
      note: `成交主单 ${shell.tradeOrderSummary.approvedCount} 笔 / 礼品 ${shell._count.giftRecords} 条`,
      tone: totalOrderCount > 0 ? "success" : "default",
    },
    {
      eyebrow: "来源脉络",
      value: firstSourceSummary,
      description: `最近来源 ${latestSourceSummary} / 关联线索 ${shell.importSummary.linkedLeadCount} 条`,
      note: `线索接入 ${latestImportSummary} / 归并事件 ${shell.importSummary.importEventCount} 条`,
      href: buildCustomerTabHref(shell.id, "profile", navigationContext),
      tone: "info",
    },
    {
      eyebrow: "经营状态",
      value: executionClassLabel,
      description: hasTemporaryExecutionDisplay
        ? `临时展示态，${executionClassDescription}`
        : executionClassDescription,
      note: `归属 ${ownershipLabel} / 最近有效跟进 ${formatDateTimeSummary(shell.lastEffectiveFollowUpAt, "尚未形成")}`,
      href: buildCustomerTabHref(shell.id, followUpEntryTab, navigationContext),
      tone: hasTemporaryExecutionDisplay ? "warning" : "info",
    },
    {
      eyebrow: "经营深度",
      value: engagementStageLabel,
      description: `通话 ${shell._count.callRecords} / 微信 ${shell._count.wechatRecords} / 直播 ${shell._count.liveInvitations}`,
      note: `风险 ${riskState.title} / 最近触达 ${formatDateTimeSummary(shell.latestFollowUpAt, "暂无")}`,
      href: buildCustomerTabHref(shell.id, riskState.tab, navigationContext),
      tone: riskState.tone,
    },
  ];

  return (
    <WorkbenchLayout
      className="!gap-0"
      header={
        <section className="relative overflow-hidden rounded-[1.35rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-4 shadow-[var(--color-shell-shadow-lg)] md:px-5 md:py-5 xl:px-6">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(255,255,255,0.48),rgba(255,255,255,0))]" />
          <div className="relative grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.9fr)]">
            <div className="min-w-0 space-y-4">
              <PageContextLink
                href={navigationContext.returnTo ?? "/customers"}
                label={getCustomerDetailBackLabel(navigationContext)}
                trail={[isPublicPoolContext ? "公海池" : "客户中心", "客户经营总览"]}
              />

              <div className="space-y-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)]">
                  Customer Portrait
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-[1.72rem] font-semibold tracking-[-0.05em] text-[var(--foreground)] md:text-[2rem]">
                    {shell.name}
                  </h1>
                  <CustomerStatusBadge status={shell.status} />
                  {isPublicPoolContext ? (
                    <StatusBadge label="来自公海池" variant="warning" />
                  ) : null}
                </div>
                <p className="max-w-3xl text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                  {getCustomerIdentitySummary(shell)}
                </p>
              </div>

              <CustomerPhoneSpotlight
                customerId={shell.id}
                customerName={shell.name}
                phone={shell.phone}
                triggerSource="detail"
                variant="dialog"
                className="max-w-[24rem]"
              />

              <div className="flex flex-wrap gap-2">
                <StatusBadge label={executionClassLabel} variant={executionClassVariant} />
                <StatusBadge
                  label={`归属 ${ownershipLabel}`}
                  variant={shell.ownershipMode === "PUBLIC" ? "warning" : "info"}
                />
              </div>

              <p className="max-w-3xl text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                {portraitNarrative}
              </p>

              <PortraitSignalRail items={portraitSignals} />

              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                {summaryCards.map((card) => (
                  <OverviewSummaryCard
                    key={card.label ?? card.eyebrow ?? card.href}
                    card={card}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <section className="overflow-hidden rounded-[1.18rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-4 shadow-[var(--color-shell-shadow-sm)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <p className="crm-detail-label">经营画像</p>
                    <h2 className="text-[1.04rem] font-semibold text-[var(--foreground)]">
                      购买轨迹与经营状态
                    </h2>
                    <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                      把成交、来源与经营深度放到同一个安静的画像面板里。
                    </p>
                  </div>
                  <div className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[1.05rem] font-semibold tracking-[0.18em] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]">
                    {getCustomerMonogram(shell.name)}
                  </div>
                </div>

                <div className="mt-4 rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-3.5">
                  <p className="crm-detail-label">购买轨迹</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-[1.42rem] font-semibold tracking-[-0.05em] text-[var(--foreground)]">
                      {totalOrderCount > 0 ? totalPurchaseAmount : "尚未成交"}
                    </p>
                    <p className="text-[12px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
                      {totalOrderCount} 笔成交
                    </p>
                  </div>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                    {totalOrderCount > 0
                      ? `最近成交 ${formatAgeSummary(shell.tradeOrderSummary.latestTradeAt)} / ${latestTradeSummary}`
                      : "成交轨迹会在形成首笔成交后显示在这里"}
                  </p>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <PortraitFact
                    label="来源脉络"
                    value={firstSourceSummary}
                    description={`最近来源 ${latestSourceSummary} / 关联线索 ${shell.importSummary.linkedLeadCount} 条`}
                  />
                  <PortraitFact
                    label="经营状态"
                    value={executionClassLabel}
                    description={
                      hasTemporaryExecutionDisplay
                        ? `临时展示态，${executionClassDescription}`
                        : `正式分类已进入 ${executionClassDescription}`
                    }
                  />
                  <PortraitFact
                    label="经营深度"
                    value={engagementStageLabel}
                    description={`通话 ${shell._count.callRecords} / 微信 ${shell._count.wechatRecords} / 直播 ${shell._count.liveInvitations}`}
                  />
                  <PortraitFact
                    label="风险与异常"
                    value={riskState.title}
                    description={riskState.description}
                  />
                </div>

                <div className="mt-4 rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="crm-detail-label">经营归属</p>
                      <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--foreground)]">
                        {formatOwnerLabel(shell.owner)}
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
                        {shell.publicPoolTeam?.name ?? shell.owner?.team?.name ?? "暂无团队"} / 保护期 {formatDateTimeSummary(shell.claimLockedUntil, "未锁定")}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="crm-detail-label">最近有效跟进</p>
                      <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--foreground)]">
                        {formatDateTimeSummary(shell.lastEffectiveFollowUpAt, "尚未形成")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-[var(--color-border-soft)] pt-4">
                  <div className="flex flex-wrap gap-2">
                    <PortraitActionLink
                      href={primaryAction.href}
                      label={primaryAction.label}
                      emphasis="primary"
                    />
                    <PortraitActionLink
                      href={primaryAction.secondaryHref}
                      label={primaryAction.secondaryLabel}
                    />
                    <PortraitActionLink
                      href={buildCustomerTabHref(shell.id, "profile", navigationContext)}
                      label="查看客户档案"
                    />
                  </div>
                </div>

                {customerRecycleGuard && moveCustomerToRecycleBinAction ? (
                  <div className="mt-4 border-t border-[var(--color-border-soft)] pt-4">
                    <CustomerRecycleEntry
                      key={`${shell.id}-${customerRecycleGuard.canMoveToRecycleBin ? "move" : "blocked"}-${customerRecycleGuard.blockers.length}`}
                      customerId={shell.id}
                      customerName={shell.name}
                      phone={shell.phone}
                      statusLabel={getCustomerStatusLabel(shell.status)}
                      ownershipLabel={ownershipLabel}
                      ownerLabel={formatOwnerLabel(shell.owner)}
                      lastEffectiveFollowUpAt={shell.lastEffectiveFollowUpAt}
                      approvedTradeOrderCount={shell.tradeOrderSummary.approvedCount}
                      linkedLeadCount={shell.importSummary.linkedLeadCount}
                      initialGuard={customerRecycleGuard}
                      initialFinalizePreview={customerFinalizePreview}
                      moveToRecycleBinAction={moveCustomerToRecycleBinAction}
                    />
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </section>
      }
    >
      <section
        id="customer-main"
        className="rounded-[1.08rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-4 py-3 shadow-[var(--color-shell-shadow-sm)] md:px-5 md:py-3.5"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
              <span>画像导航</span>
              <span className="text-[var(--color-border)]">/</span>
              <span>{activeGroupMeta.label}</span>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              {currentTabSummary}
            </p>
          </div>

          <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            最近更新 {formatDateTime(shell.updatedAt)}
          </p>
        </div>

        <div className="mt-3.5">
          <CustomerDetailTabs
            customerId={shell.id}
            activeTab={activeTab}
            buildHref={(tab) => buildCustomerTabHref(shell.id, tab, navigationContext)}
            scrollTargetId="customer-main"
            counts={{
              calls: shell._count.callRecords,
              wechat: shell._count.wechatRecords,
              live: shell._count.liveInvitations,
              orders: shell._count.salesOrders,
              gifts: shell._count.giftRecords,
              logs: shell.operationLogCount,
            }}
          />
        </div>
      </section>

      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      {renderTabContent({
        activeTab,
        shell,
        tabData,
        canCreateCalls,
        canCreateWechat,
        canManageLiveInvitations,
        canManageTags,
        canEditProfile,
        isEditingProfile,
        canCreateSalesOrders,
        tradeOrderComposer,
        navigationContext,
        updateCustomerProfileAction,
        saveTradeOrderDraftAction,
        submitTradeOrderForReviewAction,
        requestImportedCustomerDeletionAction,
        reviewImportedCustomerDeletionAction,
        deleteImportedCustomerDirectAction,
      })}

      {canCreateCalls ? (
        <MobileCallFollowUpSheet
          scope={{
            kind: "detail",
            customerId: shell.id,
          }}
          resultOptions={callResultOptions}
        />
      ) : null}
    </WorkbenchLayout>
  );
}
