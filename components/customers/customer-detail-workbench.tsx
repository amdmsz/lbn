import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerCallRecordsSection } from "@/components/customers/customer-call-records-section";
import { CustomerDetailProfileTab } from "@/components/customers/customer-detail-profile-tab";
import { CustomerDetailTabs } from "@/components/customers/customer-detail-tabs";
import { CustomerLogsTab } from "@/components/customers/customer-detail-logs-tab";
import { CustomerOrdersList } from "@/components/customers/customer-detail-orders-list";
import {
  CustomerForceDeletePanel,
  type ForceHardDeleteCustomerAction,
} from "@/components/customers/customer-force-delete-panel";
import {
  CustomerDetailSidebar,
  CustomerOwnerTransferPanel,
} from "@/components/customers/customer-detail-sidebar";
import {
  PortraitActionLink,
  type PortraitSignal,
  PortraitSignalRail,
  QuietSectionMeta,
  type SummaryCard,
  type SummaryTone,
} from "@/components/customers/customer-dossier-primitives";
import { CustomerLiveRecordsSection } from "@/components/customers/customer-live-records-section";
import type {
  CustomerOwnerTransferOption,
  TransferCustomerOwnerAction,
} from "@/components/customers/customer-owner-transfer-panel";
import { CustomerPhoneSpotlight } from "@/components/customers/customer-phone-spotlight";
import { CustomerRecycleEntry } from "@/components/customers/customer-recycle-entry";
import { MobileCallFollowUpSheet } from "@/components/customers/mobile-call-followup-sheet";
import {
  CustomerTabSection,
  formatOwnerLabel,
} from "@/components/customers/customer-record-list";
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge";
import { CustomerGradeBadge } from "@/components/customers/customers-table-bits";
import { CustomerWechatRecordsSection } from "@/components/customers/customer-wechat-records-section";
import { ActionBanner } from "@/components/shared/action-banner";
import CompactBadgeGroup, {
  type BadgeTone,
  type CompactBadgeItem,
} from "@/components/shared/compact-badge-group";
import { PageContextLink } from "@/components/shared/page-context-link";
import { type StatusBadgeVariant } from "@/components/shared/status-badge";
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
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { getLeadSourceLabel } from "@/lib/leads/metadata";
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
  logs: CustomerLogsData;
};

type RiskState = {
  title: string;
  description: string;
  tone: SummaryTone;
  tab: CustomerDetailTab;
};

const SUMMARY_TONE_TO_STATUS_VARIANT: Record<SummaryTone, StatusBadgeVariant> = {
  default: "neutral",
  info: "info",
  warning: "warning",
  danger: "danger",
  success: "success",
};

const SUMMARY_TONE_TO_BADGE_TONE: Record<SummaryTone, BadgeTone> = {
  default: "neutral",
  info: "info",
  warning: "warning",
  danger: "danger",
  success: "success",
};

const STATUS_VARIANT_TO_BADGE_TONE: Record<StatusBadgeVariant, BadgeTone> = {
  neutral: "neutral",
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
};

const CUSTOMER_STATUS_TONE: Record<
  CustomerDetailShellData["status"],
  BadgeTone
> = {
  ACTIVE: "success",
  DORMANT: "warning",
  LOST: "neutral",
  BLACKLISTED: "danger",
};

function formatLeadSourceSummary(
  source: CustomerDetailShellData["importSummary"]["firstSource"],
) {
  return source ? getLeadSourceLabel(source) : "暂无";
}

function getCustomerTotalOrderCount(shell: CustomerDetailShellData) {
  return shell.tradeOrderSummary.approvedCount || shell._count.salesOrders;
}

function getCustomerBusinessRecordCount(shell: CustomerDetailShellData) {
  return (
    shell._count.leads +
    shell._count.callRecords +
    shell._count.wechatRecords +
    shell._count.liveInvitations +
    shell._count.salesOrders +
    shell._count.giftRecords +
    shell._count.mergeLogs +
    shell._count.ownershipEvents +
    shell.tradeOrderSummary.approvedCount +
    shell.logisticsFollowUpCount
  );
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getNumberField(value: unknown, key: string) {
  return isPlainRecord(value) && typeof value[key] === "number"
    ? value[key]
    : 0;
}

function getHistoryArchiveCounts(snapshot: unknown) {
  const counts = isPlainRecord(snapshot) ? snapshot.counts : null;

  return {
    leads: getNumberField(counts, "leads"),
    callRecords: getNumberField(counts, "callRecords"),
    wechatRecords: getNumberField(counts, "wechatRecords"),
    followUpTasks: getNumberField(counts, "followUpTasks"),
    customerTags: getNumberField(counts, "customerTags"),
    ownershipEvents: getNumberField(counts, "ownershipEvents"),
  };
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

function getCustomerDetailBackLabel(
  navigationContext: CustomerDetailNavigationContext,
) {
  if (navigationContext.from === "public-pool") {
    return "返回公海池";
  }

  if (navigationContext.from === "mobile") {
    return "返回移动工作台";
  }

  return "返回客户中心";
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

function getOrderSummarySignals(data: CustomerOrdersData): PortraitSignal[] {
  const totalAmount = data.reduce(
    (sum, record) => sum + Number(record.finalAmount),
    0,
  );
  const approvedCount = data.filter(
    (record) => record.reviewStatus === "APPROVED",
  ).length;
  const inTransitCount = data.filter((record) =>
    ["READY_TO_SHIP", "SHIPPED", "DELIVERED"].includes(
      record.shippingTask?.shippingStatus ?? "",
    ),
  ).length;
  const codPendingCount = data.filter((record) =>
    record.shippingTask?.codCollectionRecords?.some(
      (item) => item.status === "PENDING_COLLECTION",
    ),
  ).length;
  const latestOrder = data[0] ?? null;

  return [
    {
      label: "累计成交",
      value: data.length > 0 ? formatCurrency(totalAmount) : "暂无成交",
      description: `${data.length} 条订单 / ${approvedCount} 条已审核`,
    },
    {
      label: "最近订单",
      value: latestOrder ? formatDateTime(latestOrder.createdAt) : "暂无",
      description: latestOrder?.tradeOrder?.tradeNo ?? latestOrder?.orderNo ?? "暂无订单",
    },
    {
      label: "履约推进",
      value: `${inTransitCount} 条进行中`,
      description: "含待发货、已发货、已签收未完结",
    },
    {
      label: "COD 跟进",
      value: `${codPendingCount} 条待回款`,
      description: "只统计当前列表内 COD 待收记录",
    },
  ];
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
  const orderSignals = getOrderSummarySignals(data);
  const composerForm =
    tradeOrderComposer && saveTradeOrderDraftAction && submitTradeOrderForReviewAction ? (
      <TradeOrderForm
        customer={tradeOrderComposer.customer}
        paymentSchemeOptions={tradeOrderComposer.paymentSchemeOptions}
        skuOptions={tradeOrderComposer.skuOptions}
        draft={tradeOrderComposer.draft}
        saveDraftAction={saveTradeOrderDraftAction}
        submitForReviewAction={submitTradeOrderForReviewAction}
      />
    ) : null;

  return (
    <div className="space-y-4">
      {composerForm ? (
        composerForm
      ) : canCreateSalesOrders ? (
        <CustomerTabSection
          eyebrow="成交主单"
          title="成交入口"
          description="需要推进成交时，再从客户详情进入主单编辑。"
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
          <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-sm leading-5 text-muted-foreground">
            当前没有进行中的成交草稿。成交入口继续挂在客户画像里，需要推进时再进入。
          </div>
        </CustomerTabSection>
      ) : null}

      <CustomerTabSection
        eyebrow="成交记录"
        title="成交与履约轨迹"
        description="按成交时间回看订单、履约与 COD 的演进。"
        actions={<QuietSectionMeta>{data.length} 条记录</QuietSectionMeta>}
      >
        <div className="space-y-4">
          <PortraitSignalRail items={orderSignals} />
          <CustomerOrdersList data={data} />
        </div>
      </CustomerTabSection>
    </div>
  );
}

function renderTabContent({
  activeTab,
  shell,
  tabData,
  canCreateCalls,
  outboundCallEnabled,
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
  outboundCallEnabled: boolean;
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
      return (
        <CustomerDetailProfileTab
          shell={shell}
          data={tabData as CustomerProfileData}
          canManageTags={canManageTags}
          canEditProfile={canEditProfile}
          isEditingProfile={isEditingProfile}
          updateCustomerProfileAction={updateCustomerProfileAction}
          navigationContext={navigationContext}
          requestImportedCustomerDeletionAction={requestImportedCustomerDeletionAction}
          reviewImportedCustomerDeletionAction={reviewImportedCustomerDeletionAction}
          deleteImportedCustomerDirectAction={deleteImportedCustomerDirectAction}
        />
      );
    case "calls":
      return (
        <CustomerCallRecordsSection
          customerId={shell.id}
          customerName={shell.name}
          phone={shell.phone}
          records={(tabData as CustomerCallsData).records}
          resultOptions={(tabData as CustomerCallsData).callResultOptions}
          canCreate={canCreateCalls}
          outboundCallEnabled={outboundCallEnabled}
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
    case "logs":
      return <CustomerLogsTab data={tabData as CustomerLogsData} />;
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
  outboundCallEnabled,
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
  canForceHardDeleteCustomer,
  forceHardDeleteCustomerAction,
  moveCustomerToRecycleBinAction,
  ownerTransferOptions,
  transferCustomerOwnerAction,
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
  outboundCallEnabled: boolean;
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
  canForceHardDeleteCustomer: boolean;
  forceHardDeleteCustomerAction?: ForceHardDeleteCustomerAction;
  moveCustomerToRecycleBinAction?: MoveCustomerToRecycleBinAction;
  ownerTransferOptions: CustomerOwnerTransferOption[];
  transferCustomerOwnerAction?: TransferCustomerOwnerAction;
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
  const currentOwnerLabel = formatOwnerLabel(shell.owner);
  const riskState = getOverviewRiskState(shell, publicPoolReasonLabel);
  const followUpEntryTab = getFollowUpEntryTab(
    canCreateCalls,
    canCreateWechat,
    canManageLiveInvitations,
  );
  const totalOrderCount = getCustomerTotalOrderCount(shell);
  const businessRecordCount = getCustomerBusinessRecordCount(shell);
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
    ? `客户由 ${firstSourceSummary} 接入，当前为「${executionClassLabel}」临时态。建议先完成首呼，再进入 A-E 正式分类。`
    : `客户由 ${firstSourceSummary} 接入，正式分类为「${executionClassLabel}」。${totalOrderCount > 0 ? `累计成交 ${totalPurchaseAmount}，${totalOrderCount} 笔。` : "尚未形成成交。"}`;
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
      note: `成交主单 ${shell.tradeOrderSummary.approvedCount} 笔`,
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
  const isTradeOrderComposerMode = activeTab === "orders" && Boolean(tradeOrderComposer);
  const archivedOwnershipEventCount = shell.ownershipHistoryArchives.reduce(
    (total, archive) =>
      total + Math.max(1, getHistoryArchiveCounts(archive.snapshot).ownershipEvents),
    0,
  );
  const totalOwnershipHistoryCount =
    shell._count.ownershipEvents + archivedOwnershipEventCount;

  const heroBadgeItems: CompactBadgeItem[] = [
    {
      label: getCustomerStatusLabel(shell.status),
      tone: CUSTOMER_STATUS_TONE[shell.status],
    },
    {
      label: executionClassLabel,
      tone: STATUS_VARIANT_TO_BADGE_TONE[executionClassVariant],
    },
    {
      label: riskState.title,
      tone: SUMMARY_TONE_TO_BADGE_TONE[riskState.tone],
    },
    {
      label: `归属 ${ownershipLabel}`,
      tone: shell.ownershipMode === "PUBLIC" ? "warning" : "info",
    },
  ];
  if (isPublicPoolContext) {
    heroBadgeItems.push({ label: "来自公海池", tone: "warning" });
  }

  return (
    <WorkbenchLayout
      className="!gap-0"
      contentClassName="!space-y-0"
      header={
        <section
          className={cn(
            "rounded-xl border border-border/60 bg-card px-4 shadow-sm md:px-5",
            isTradeOrderComposerMode ? "py-3" : "py-4 xl:px-6",
          )}
        >
          <PageContextLink
            href={
              isTradeOrderComposerMode
                ? buildCustomerTabHref(shell.id, "orders", navigationContext)
                : navigationContext.returnTo ?? "/customers"
            }
            label={
              isTradeOrderComposerMode
                ? "返回成交结果"
                : getCustomerDetailBackLabel(navigationContext)
            }
            trail={[
              isPublicPoolContext ? "公海池" : "客户中心",
              isTradeOrderComposerMode ? "成交主单编辑" : "客户经营总览",
            ]}
          />

          <div
            className={cn(
              "mt-4 flex flex-col gap-4",
              isTradeOrderComposerMode ? "xl:flex-row xl:items-center" : "xl:flex-row xl:items-end xl:justify-between",
            )}
          >
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 font-semibold text-foreground",
                    isTradeOrderComposerMode ? "h-10 w-10 text-sm" : "h-12 w-12 text-base",
                  )}
                >
                  {shell.name.replace(/\s+/g, "").trim().slice(0, 2).toUpperCase() || "C"}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1
                      className={cn(
                        "font-semibold text-foreground",
                        isTradeOrderComposerMode ? "text-xl" : "text-2xl",
                      )}
                    >
                      {shell.name}
                    </h1>
                    <CustomerStatusBadge status={shell.status} />
                    {/* Wave 7-B: 客户分级 chip 紧贴名字 + 状态, hero 第一视觉锚点. */}
                    <CustomerGradeBadge grade={shell.grade} size="md" variant="long" />
                  </div>

                  <div className="max-w-xl">
                    <CustomerPhoneSpotlight
                      customerId={shell.id}
                      customerName={shell.name}
                      phone={shell.phone}
                      triggerSource="detail"
                      variant="dialog"
                      phoneClassName={cn(
                        "tracking-normal",
                        isTradeOrderComposerMode ? "text-xl" : "text-2xl",
                      )}
                      outboundCallEnabled={outboundCallEnabled && canCreateCalls}
                      outboundCallPlacement="icon"
                    />
                  </div>

                  <p className="text-[12px] leading-5 text-muted-foreground">
                    {getCustomerIdentitySummary(shell) || "暂无画像摘要"}
                  </p>

                  <CompactBadgeGroup items={heroBadgeItems} maxVisible={6} />
                </div>
              </div>
            </div>

            {isTradeOrderComposerMode ? null : (
              <div className="max-w-xl rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      下一步判断
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-5 text-foreground">
                      {riskState.title}
                    </p>
                    <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                      {portraitNarrative}
                    </p>
                  </div>
                  <PortraitActionLink
                    href={buildCustomerTabHref(shell.id, riskState.tab, navigationContext)}
                    label="查看依据"
                  />
                </div>
              </div>
            )}
          </div>
        </section>
      }
    >
      <div
        className={cn(
          "grid grid-cols-1 gap-6",
          isTradeOrderComposerMode ? "lg:grid-cols-1" : "lg:grid-cols-12",
        )}
      >
        <main
          className={cn(
            "min-w-0 space-y-4",
            isTradeOrderComposerMode ? "lg:col-span-full" : "lg:col-span-8",
          )}
        >
          <section
            id="customer-main"
            className="sticky top-0 z-10 rounded-xl border border-border/60 bg-background/90 px-4 py-3 shadow-sm backdrop-blur-md md:px-5"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span>画像导航</span>
                  <span className="text-border">/</span>
                  <span>{activeGroupMeta.label}</span>
                </div>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {currentTabSummary}
                </p>
              </div>

              <p className="text-[12px] leading-5 text-muted-foreground">
                最近更新 {formatDateTime(shell.updatedAt)}
              </p>
            </div>

            <div className="mt-3">
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
            outboundCallEnabled,
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
        </main>

        {isTradeOrderComposerMode ? null : (
          <CustomerDetailSidebar
            profileHref={buildCustomerTabHref(shell.id, "profile", navigationContext)}
            primaryAction={primaryAction}
            ownership={{
              currentOwnerLabel,
              teamLabel:
                shell.publicPoolTeam?.name ?? shell.owner?.team?.name ?? "暂无团队",
              protectedUntilLabel: formatDateTimeSummary(
                shell.claimLockedUntil,
                "未锁定",
              ),
              ownershipLabel,
              ownershipBadgeVariant:
                SUMMARY_TONE_TO_STATUS_VARIANT[
                  shell.ownershipMode === "PUBLIC" ? "warning" : "info"
                ],
            }}
            trade={{
              totalAmountLabel:
                totalOrderCount > 0 ? totalPurchaseAmount : "尚未成交",
              totalOrderCount,
              latestSummary:
                totalOrderCount > 0
                  ? `最近成交 ${formatAgeSummary(shell.tradeOrderSummary.latestTradeAt)} / ${latestTradeSummary}`
                  : "成交轨迹会在形成首笔成交后显示在这里",
            }}
            signals={portraitSignals}
            ownershipHistory={{
              totalCount: totalOwnershipHistoryCount,
              events: shell.ownershipEvents.map((event) => ({
                id: event.id,
                reason: event.reason,
                createdAt: event.createdAt,
                fromOwner: event.fromOwner,
                toOwner: event.toOwner,
                fromOwnershipMode: event.fromOwnershipMode,
                toOwnershipMode: event.toOwnershipMode,
                actor: event.actor,
                team: event.team,
                note: event.note,
              })),
              archives: shell.ownershipHistoryArchives.map((archive) => ({
                id: archive.id,
                sourceCustomerName: archive.sourceCustomerName,
                sourceCustomerPhone: archive.sourceCustomerPhone,
                sourceOwnerLabel: archive.sourceOwnerLabel,
                reason: archive.reason,
                createdAt: archive.createdAt,
                createdBy: archive.createdBy,
                snapshotOwnershipEventsCount: getHistoryArchiveCounts(
                  archive.snapshot,
                ).ownershipEvents,
              })),
              transferSlot: transferCustomerOwnerAction ? (
                <CustomerOwnerTransferPanel
                  customerId={shell.id}
                  currentOwnerLabel={currentOwnerLabel}
                  options={ownerTransferOptions}
                  action={transferCustomerOwnerAction}
                  className="mt-3 border-t border-border/40 pt-3"
                />
              ) : null,
            }}
            summaryCards={summaryCards}
            recycleSlot={
              customerRecycleGuard && moveCustomerToRecycleBinAction ? (
                <section className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
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
                </section>
              ) : null
            }
            forceDeleteSlot={
              canForceHardDeleteCustomer && forceHardDeleteCustomerAction ? (
                <CustomerForceDeletePanel
                  customerId={shell.id}
                  customerName={shell.name}
                  phone={shell.phone}
                  ownerLabel={formatOwnerLabel(shell.owner)}
                  businessRecordCount={businessRecordCount}
                  action={forceHardDeleteCustomerAction}
                />
              ) : null
            }
          />
        )}
      </div>

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
