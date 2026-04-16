import type { ReactNode } from "react";
import Link from "next/link";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerCallRecordsSection } from "@/components/customers/customer-call-records-section";
import { CustomerDetailTabs } from "@/components/customers/customer-detail-tabs";
import { ImportedCustomerDeletionPanel } from "@/components/customers/imported-customer-deletion-panel";
import { CustomerLiveRecordsSection } from "@/components/customers/customer-live-records-section";
import { CustomerRecycleEntry } from "@/components/customers/customer-recycle-entry";
import {
  CustomerMobileDialButton,
  MobileCallFollowUpSheet,
} from "@/components/customers/mobile-call-followup-sheet";
import {
  CustomerEmptyState,
  CustomerRecordCard,
  CustomerTabSection,
  formatOwnerLabel,
} from "@/components/customers/customer-record-list";
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge";
import { CustomerTagsPanel } from "@/components/customers/customer-tags-panel";
import { CustomerWechatRecordsSection } from "@/components/customers/customer-wechat-records-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { MetricCard } from "@/components/shared/metric-card";
import { PageContextLink } from "@/components/shared/page-context-link";
import { SmartLink } from "@/components/shared/smart-link";
import { StatusBadge } from "@/components/shared/status-badge";
import { TradeOrderForm } from "@/components/trade-orders/trade-order-form";
import {
  formatDateTime,
  formatRegion,
  getCustomerDetailTabGroupMeta,
  getCustomerDetailTabMeta,
  getCustomerLevelLabel,
  getCustomerStatusLabel,
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
import type { RecycleMoveGuard } from "@/lib/recycle-bin/types";
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

type MoveCustomerToRecycleBinAction = (formData: FormData) => Promise<{
  status: "success" | "error";
  message: string;
  recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
  guard?: RecycleMoveGuard;
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
  default: "border-black/7",
  info: "border-[rgba(54,95,135,0.14)]",
  warning: "border-[rgba(155,106,29,0.16)]",
  danger: "border-[rgba(141,59,51,0.16)]",
  success: "border-[rgba(47,107,71,0.16)]",
};

function formatLeadSourceSummary(
  source: CustomerDetailShellData["importSummary"]["firstSource"],
) {
  return source ? getLeadSourceLabel(source) : "暂无";
}

function getCustomerTotalOrderCount(shell: CustomerDetailShellData) {
  return shell.tradeOrderSummary.approvedCount || shell._count.salesOrders;
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
            "space-y-1.5 border-b border-black/6 pb-3",
            item.span === "full" &&
              (isThreeColumn ? "md:col-span-2 xl:col-span-3" : "md:col-span-2"),
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
            {item.label}
          </p>
          <div className="text-sm leading-6 text-black/78">{item.value}</div>
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
    ? `最近导入 ${formatDateTime(shell.importSummary.latestImportAt)}`
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

function OverviewSummaryCard({
  card,
}: Readonly<{
  card: SummaryCard;
}>) {
  return (
    <MetricCard
      label={card.label ?? card.eyebrow ?? "摘要"}
      value={card.value}
      note={card.description ? `${card.description} / ${card.note}` : card.note}
      href={card.href}
      scrollTargetId="customer-main"
      density="strip"
      className={summaryToneClassName[card.tone ?? "default"]}
    />
  );
}

function SidebarPanel({
  eyebrow,
  title,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  children: ReactNode;
}>) {
  return (
    <section className="rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.84)] px-4 py-4 shadow-[0_8px_18px_rgba(18,24,31,0.04)]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-[0.96rem] font-semibold text-black/84">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SidebarRow({
  label,
  value,
}: Readonly<{
  label: string;
  value: ReactNode;
}>) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <p className="text-[12px] text-black/44">{label}</p>
      <div className="w-full text-left text-[13px] font-medium leading-5 text-black/78 sm:max-w-[65%] sm:text-right">
        {value}
      </div>
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
    <div className="rounded-[1rem] border border-black/7 bg-[rgba(249,250,251,0.74)] px-4 py-3.5 transition-colors hover:border-black/10 hover:bg-white/84">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-black/82">{title}</p>
          {description ? (
            <p className="text-[13px] leading-6 text-black/56">{description}</p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] leading-5 text-black/48">
            {meta.map((item, index) => (
              <span key={`${index}-${item}`} className="inline-flex max-w-full items-center gap-2">
                {index > 0 ? <span className="text-black/20">/</span> : null}
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

function renderProfileTab({
  shell,
  data,
  canManageTags,
  navigationContext,
  requestImportedCustomerDeletionAction,
  reviewImportedCustomerDeletionAction,
  deleteImportedCustomerDirectAction,
}: Readonly<{
  shell: CustomerDetailShellData;
  data: CustomerProfileData;
  canManageTags: boolean;
  navigationContext?: CustomerDetailNavigationContext;
  requestImportedCustomerDeletionAction: ImportedCustomerDeletionAction;
  reviewImportedCustomerDeletionAction: ImportedCustomerDeletionReviewAction;
  deleteImportedCustomerDirectAction: ImportedCustomerDeletionAction;
}>) {
  const archiveHref = buildCustomerTabHref(shell.id, "profile", navigationContext);

  return (
    <div className="space-y-5">
      <CustomerTabSection
        eyebrow="客户档案"
        title="基础信息"
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
          <DetailFieldGrid
            columns="three"
            items={[
              { label: "姓名", value: shell.name },
              { label: "手机号", value: shell.phone },
              { label: "微信号", value: shell.wechatId?.trim() || "未填写" },
              { label: "客户等级", value: getCustomerLevelLabel(shell.level) },
              {
                label: "地区",
                value: formatRegion(shell.province, shell.city, shell.district),
              },
              { label: "创建时间", value: formatDateTime(shell.createdAt) },
              { label: "最近更新时间", value: formatDateTime(shell.updatedAt) },
              { label: "地址", value: shell.address?.trim() || "未填写", span: "full" },
              { label: "备注", value: shell.remark?.trim() || "暂无备注", span: "full" },
            ]}
          />
        </div>
      </CustomerTabSection>

      {data.customerImportSummary?.data ? (
        <CustomerTabSection eyebrow="续接承接" title="续接摘要">
          <DetailFieldGrid
            columns="three"
            items={[
              {
                label: "导入批次",
                value: (
                  <Link
                    href={`/lead-imports/${data.customerImportSummary.data.batchId}?mode=customer_continuation`}
                    className="crm-text-link"
                  >
                    {data.customerImportSummary.data.batchFileName}
                  </Link>
                ),
              },
              {
                label: "导入时间",
                value: formatDateTime(data.customerImportSummary.createdAt),
              },
              {
                label: "本次结果",
                value:
                  data.customerImportSummary.data.action === "CREATED_CUSTOMER"
                    ? "新建客户"
                    : "命中已有客户",
              },
              {
                label: "负责人结果",
                value:
                  data.customerImportSummary.data.ownerOutcome === "ASSIGNED"
                    ? "已匹配负责人"
                    : data.customerImportSummary.data.ownerOutcome === "KEPT_EXISTING"
                      ? "保留原负责人"
                      : data.customerImportSummary.data.ownerOutcome === "PUBLIC_POOL"
                        ? "进入公海"
                        : "负责人未识别",
              },
              {
                label: "迁移前累计消费",
                value: data.customerImportSummary.data.summary.historicalTotalSpent || "暂无",
              },
              {
                label: "购买次数",
                value:
                  data.customerImportSummary.data.summary.purchaseCount !== null
                    ? String(data.customerImportSummary.data.summary.purchaseCount)
                    : "暂无",
              },
              {
                label: "最近购买商品",
                value:
                  data.customerImportSummary.data.summary.latestPurchasedProduct || "暂无",
              },
              {
                label: "最近意向",
                value: data.customerImportSummary.data.summary.latestIntent || "暂无",
              },
              {
                label: "最近跟进时间",
                value: data.customerImportSummary.data.summary.latestFollowUpAt || "暂无",
              },
              {
                label: "最近跟进结果",
                value:
                  data.customerImportSummary.data.summary.latestFollowUpResult || "暂无",
              },
              {
                label: "已挂接标签",
                value:
                  data.customerImportSummary.data.tags.assigned.join(" / ") || "暂无",
                span: "full",
              },
              {
                label: "未识别标签",
                value:
                  data.customerImportSummary.data.tags.unresolved.join(" / ") || "无",
              },
              {
                label: "迁移备注摘要",
                value: data.customerImportSummary.data.summary.note || "暂无",
                span: "full",
              },
            ]}
          />
          <p className="mt-4 text-sm leading-6 text-black/52">
            这里展示的是迁移承接参考摘要，不会并入新系统真实累计成交。
          </p>
        </CustomerTabSection>
      ) : null}

      <CustomerTabSection
        eyebrow="经营脉络"
        title="来源、归并与导入历史"
      >
        <DetailFieldGrid
          columns="three"
          items={[
            { label: "负责人", value: formatOwnerLabel(shell.owner) },
            {
              label: "首个来源",
              value: formatLeadSourceSummary(shell.importSummary.firstSource),
            },
            {
              label: "最近来源",
              value: formatLeadSourceSummary(shell.importSummary.latestSource),
            },
            {
              label: "最近导入",
              value: shell.importSummary.latestImportAt
                ? formatDateTime(shell.importSummary.latestImportAt)
                : "暂无导入记录",
            },
            {
              label: "关联线索",
              value: String(shell.importSummary.linkedLeadCount),
            },
            {
              label: "导入 / 归并事件",
              value: String(shell.importSummary.importEventCount),
            },
          ]}
        />

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="crm-detail-label text-black/38">线索回流</p>
                <StatusBadge label={`${data.leads.length} 条`} variant="neutral" />
              </div>
              <p className="text-[13px] leading-6 text-black/56">
                用于核对承接来源、原始线索状态和回流记录。
              </p>
            </div>

            {data.leads.length > 0 ? (
              <div className="space-y-3">
                {data.leads.map((lead) => (
                  <CompactArchiveCard
                    key={lead.id}
                    title={lead.name?.trim() || lead.phone}
                    meta={[
                      `手机号 ${lead.phone}`,
                      `来源 ${getLeadSourceLabel(lead.source)}`,
                      `状态 ${getLeadStatusLabel(lead.status)}`,
                      `创建于 ${formatDateTime(lead.createdAt)}`,
                    ]}
                    href={`/leads/${lead.id}`}
                    hrefLabel="查看线索"
                  />
                ))}
              </div>
            ) : (
              <CustomerEmptyState
                className="rounded-[1rem] border border-dashed border-black/7 bg-[rgba(247,248,250,0.66)] px-4 py-4 shadow-none"
                title="暂无关联线索"
                description="暂无线索记录。"
              />
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="crm-detail-label text-black/38">导入历史</p>
                <StatusBadge label={`${data.mergeLogs.length} 条`} variant="neutral" />
              </div>
              <p className="text-[13px] leading-6 text-black/56">
                保留导入批次、归并动作和标签同步记录，方便做来源审计。
              </p>
            </div>

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
                          ? `线索手机号：${leadPhone}`
                          : `线索手机号：${leadPhone}（历史快照）`
                      }
                      href={liveLead ? `/leads/${liveLead.id}` : undefined}
                      hrefLabel={liveLead ? "查看线索" : undefined}
                    />
                  );
                })}
              </div>
            ) : (
              <CustomerEmptyState
                className="rounded-[1rem] border border-dashed border-black/7 bg-[rgba(247,248,250,0.66)] px-4 py-4 shadow-none"
                title="暂无导入归并记录"
                description="暂无导入历史。"
              />
            )}
          </div>
        </div>
      </CustomerTabSection>

      <CustomerTabSection eyebrow="删除审批" title="导入客户删除">
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
          <CustomerRecordCard
            key={record.id}
            title={`${
              record.tradeOrder?.tradeNo
                ? `${record.tradeOrder.tradeNo} / ${record.subOrderNo || record.orderNo}`
                : record.orderNo
            } / ${formatCurrency(record.finalAmount)}`}
            meta={[
              `负责人：${formatOwnerLabel(record.owner)}`,
              `供应商：${record.supplier.name}`,
              record.tradeOrder?.tradeNo
                ? `成交主单：${record.tradeOrder.tradeNo}`
                : `订单编号：${record.orderNo}`,
              record.subOrderNo
                ? `子单编号：${record.subOrderNo}`
                : "子单编号：当前仍为单订单结构",
              `审核状态：${getSalesOrderReviewStatusLabel(record.reviewStatus)}`,
              `收款方案：${getSalesOrderPaymentSchemeLabel(record.paymentScheme)}`,
              `报单状态：${
                record.shippingTask
                  ? getShippingReportStatusLabel(record.shippingTask.reportStatus)
                  : "未进入发货池"
              }`,
              `发货状态：${
                record.shippingTask
                  ? getShippingFulfillmentStatusLabel(record.shippingTask.shippingStatus)
                  : "待审核"
              }`,
              `物流单号：${record.shippingTask?.trackingNumber || "未回填"}`,
              latestLogisticsTask
                ? `物流跟进：${latestLogisticsTask.owner.name} / ${getLogisticsFollowUpTaskStatusLabel(latestLogisticsTask.status)}`
                : "物流跟进：暂无任务",
              latestCodRecord
                ? `COD：${getCodCollectionStatusLabel(latestCodRecord.status)} / ${formatCurrency(latestCodRecord.collectedAmount)}`
                : "COD：不适用或未开始",
              `创建时间：${formatDateTime(record.createdAt)}`,
            ]}
            description={`收件信息：${record.receiverNameSnapshot} / ${record.receiverPhoneSnapshot} / ${record.receiverAddressSnapshot}`}
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
          title={tradeOrderComposer ? "继续编辑成交主单" : "从客户上下文发起成交"}
          actions={
            <Link
              href={buildCustomerTradeOrderHref(
                customerId,
                tradeOrderComposer?.draft?.id,
                navigationContext,
              )}
              className="crm-button crm-button-primary min-h-0 px-3.5 py-2 text-sm"
            >
              {tradeOrderComposer ? "继续编辑" : "创建成交主单"}
            </Link>
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
            <div className="rounded-[0.95rem] border border-black/6 bg-[rgba(247,248,250,0.72)] px-4 py-4 text-sm leading-6 text-black/56">
              需要时再进入编辑。
            </div>
          )}
        </CustomerTabSection>
      ) : null}

      <CustomerTabSection
        eyebrow="成交记录"
        title="订单与履约记录"
        actions={<StatusBadge label={`${data.length} 条记录`} variant="neutral" />}
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
      title="礼品资格与履约"
      actions={<StatusBadge label={`${data.length} 条记录`} variant="neutral" />}
    >
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((record) => {
            const freightPlan = record.paymentPlans?.[0] ?? null;

            return (
              <CustomerRecordCard
                key={record.id}
                title={record.giftName}
                meta={[
                  `销售：${formatOwnerLabel(record.sales)}`,
                  `资格来源：${getGiftQualificationSourceLabel(record.qualificationSource)}`,
                  `审核状态：${getGiftReviewStatusLabel(record.reviewStatus)}`,
                  `发货状态：${getShippingStatusLabel(record.shippingStatus)}`,
                  `运费：${formatCurrency(record.freightAmount)}`,
                  freightPlan
                    ? `运费计划：${freightPlan.status} / 待收 ${formatCurrency(freightPlan.remainingAmount)}`
                    : "运费计划：未生成",
                  `物流单号：${record.shippingTask?.trackingNumber || "未回填"}`,
                  `直播场次：${record.liveSession?.title || "未关联"}`,
                  `创建时间：${formatDateTime(record.createdAt)}`,
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
      title="操作日志"
      actions={<StatusBadge label={`${data.length} 条记录`} variant="neutral" />}
    >
      {data.length > 0 ? (
        <div className="space-y-3">
          {data.map((record) => (
            <CustomerRecordCard
              key={record.id}
              title={`${record.module} / ${record.action}`}
              meta={[
                `操作人：${formatOwnerLabel(record.actor)}`,
                `时间：${formatDateTime(record.createdAt)}`,
              ]}
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
  canCreateSalesOrders,
  tradeOrderComposer,
  navigationContext,
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
  canCreateSalesOrders: boolean;
  tradeOrderComposer: TradeOrderComposerData | null;
  navigationContext?: CustomerDetailNavigationContext;
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
  canCreateSalesOrders,
  tradeOrderComposer,
  navigationContext,
  customerRecycleGuard,
  moveCustomerToRecycleBinAction,
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
  canCreateSalesOrders: boolean;
  tradeOrderComposer: TradeOrderComposerData | null;
  saveTradeOrderDraftAction?: (formData: FormData) => Promise<void>;
  submitTradeOrderForReviewAction?: (formData: FormData) => Promise<void>;
  customerRecycleGuard: RecycleMoveGuard | null;
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
  const totalPurchaseAmount = formatCurrency(shell.tradeOrderSummary.lifetimeAmount);
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
      eyebrow: "归属与保护期",
      value: ownershipLabel,
      description: `负责人 ${formatOwnerLabel(shell.owner)}`,
      note: `最近有效跟进 ${formatDateTimeSummary(shell.lastEffectiveFollowUpAt)} / 保护期 ${formatDateTimeSummary(shell.claimLockedUntil, "未锁定")}`,
      href: buildCustomerTabHref(shell.id, "profile", navigationContext),
      tone: shell.ownershipMode === "PUBLIC" ? "warning" : "info",
    },
    {
      eyebrow: "跟进推进",
      value:
        shell._count.callRecords > 0
          ? `${shell._count.callRecords} 次通话`
          : "待首个通话",
      description: `微信 ${shell._count.wechatRecords} / 直播 ${shell._count.liveInvitations}`,
      note: `最近关键触达 ${formatDateTimeSummary(shell.latestFollowUpAt)}`,
      href: buildCustomerTabHref(shell.id, followUpEntryTab, navigationContext),
    },
    {
      eyebrow: "成交结果",
      value:
        getCustomerTotalOrderCount(shell) > 0
          ? `已有 ${getCustomerTotalOrderCount(shell)} 笔成交`
          : "尚未形成成交",
      description: `礼品 ${shell._count.giftRecords} 条 / 日志 ${shell.operationLogCount} 条`,
      note: canCreateSalesOrders
        ? "成交入口继续放在客户详情主链里。"
        : "当前角色以查看成交结果为主。",
      href: buildCustomerTabHref(shell.id, "orders", navigationContext),
      tone: getCustomerTotalOrderCount(shell) > 0 ? "success" : "default",
    },
    {
      eyebrow: "风险与异常",
      value: riskState.title,
      description: riskState.description,
      note: `关联线索 ${shell.importSummary.linkedLeadCount} 条 / 物流提醒 ${shell.logisticsFollowUpCount} 条`,
      href: buildCustomerTabHref(shell.id, riskState.tab, navigationContext),
      tone: riskState.tone,
    },
  ];

  return (
    <WorkbenchLayout
      className="!gap-0"
      layoutClassName="xl:grid-cols-[minmax(240px,280px)_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]"
      header={
        <section className="overflow-hidden rounded-[1.2rem] border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(249,247,243,0.88))] px-4 py-3.5 shadow-[0_12px_26px_rgba(18,24,31,0.045)] md:px-5 md:py-4 xl:px-6 xl:py-5">
          <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
            <div className="min-w-0 max-w-4xl space-y-3">
              <PageContextLink
                href={navigationContext.returnTo ?? "/customers"}
                label={getCustomerDetailBackLabel(navigationContext)}
                trail={[isPublicPoolContext ? "公海池" : "客户中心", "客户经营总览"]}
              />

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-end gap-3">
                  <h1 className="text-[1.48rem] font-semibold tracking-[-0.035em] text-black/88 md:text-[1.72rem]">
                    {shell.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="pb-1 text-[15px] font-medium text-black/54 md:text-[16px]">
                      {shell.phone}
                    </p>
                    {canCreateCalls ? (
                      <CustomerMobileDialButton
                        customerId={shell.id}
                        customerName={shell.name}
                        phone={shell.phone}
                        triggerSource="detail"
                        className="inline-flex h-8 items-center rounded-full border border-[rgba(154,97,51,0.16)] bg-[rgba(154,97,51,0.08)] px-3 text-[12px] font-medium text-[rgba(84,55,31,0.96)] md:hidden"
                      />
                    ) : null}
                  </div>
                </div>
                <p className="max-w-3xl text-[13px] leading-6 text-black/56">
                  {getCustomerIdentitySummary(shell)}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <CustomerStatusBadge status={shell.status} />
                <StatusBadge
                  label={`归属 ${ownershipLabel}`}
                  variant={shell.ownershipMode === "PUBLIC" ? "warning" : "info"}
                />
                <StatusBadge
                  label={shell.owner ? `负责人 ${shell.owner.name}` : "未分配负责人"}
                  variant={shell.owner ? "info" : "neutral"}
                />
                <StatusBadge
                  label={riskState.title}
                  variant={riskState.tone === "default" ? "neutral" : riskState.tone}
                />
                {isPublicPoolContext ? (
                  <StatusBadge label="来自公海池" variant="warning" />
                ) : null}
              </div>
            </div>

            <div className="w-full 2xl:max-w-[18rem] 2xl:min-w-[16.25rem]">
              <div className="mb-2.5 rounded-[0.95rem] border border-black/8 bg-[rgba(255,255,255,0.86)] px-4 py-3 shadow-[0_6px_16px_rgba(18,24,31,0.03)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
                  累计购买金额
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <p className="text-[1.2rem] font-semibold tracking-[-0.04em] text-black/86 md:text-[1.34rem]">
                    {totalPurchaseAmount}
                  </p>
                  <StatusBadge
                    label={`${shell.tradeOrderSummary.approvedCount} 笔成交`}
                    variant={
                      shell.tradeOrderSummary.approvedCount > 0 ? "success" : "neutral"
                    }
                  />
                </div>
                <p className="mt-2 text-[12px] leading-5 text-black/48">
                  最近成交 {formatAgeSummary(shell.tradeOrderSummary.latestTradeAt)} /{" "}
                  {formatDateTimeSummary(shell.tradeOrderSummary.latestTradeAt)}
                </p>
              </div>
              <div className="rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.8)] px-4 py-3.5 shadow-[0_8px_18px_rgba(18,24,31,0.04)]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/38">
                  当前经营动作
                </p>
                <h2 className="mt-2 text-[1rem] font-semibold text-black/84">
                  {canCreateSalesOrders ? "继续承接成交" : "继续推进客户"}
                </h2>
                <p className="mt-2 text-[13px] leading-6 text-black/56">
                  {primaryAction.description}
                </p>
                <div className="mt-3.5 flex flex-wrap items-center gap-3">
                  <Link
                    href={primaryAction.href}
                    className="crm-button crm-button-primary min-h-0 px-3.5 py-2 text-sm"
                  >
                    {primaryAction.label}
                  </Link>
                  <SmartLink
                    href={primaryAction.secondaryHref}
                    scrollTargetId="customer-main"
                    className="text-sm text-black/52 transition hover:text-black/82"
                  >
                    {primaryAction.secondaryLabel}
                  </SmartLink>
                </div>

                {customerRecycleGuard && moveCustomerToRecycleBinAction ? (
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
                    moveToRecycleBinAction={moveCustomerToRecycleBinAction}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
      }
      summary={
        <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
          {summaryCards.map((card) => (
            <OverviewSummaryCard key={card.label ?? card.eyebrow ?? card.href} card={card} />
          ))}
        </div>
      }
      sidebarPosition="left"
      sidebar={
        <div className="space-y-4">
          <SidebarPanel eyebrow="经营侧摘要" title="当前经营状态">
            <div className="divide-y divide-black/6">
              <SidebarRow label="当前状态" value={ownershipLabel} />
              <SidebarRow label="负责人" value={formatOwnerLabel(shell.owner)} />
              <SidebarRow
                label="最近有效跟进"
                value={formatDateTimeSummary(shell.lastEffectiveFollowUpAt)}
              />
              <SidebarRow
                label="保护期"
                value={formatDateTimeSummary(shell.claimLockedUntil, "未锁定")}
              />
              <SidebarRow
                label="公海 / 团队"
                value={shell.publicPoolTeam?.name ?? shell.owner?.team?.name ?? "暂无团队"}
              />
            </div>
          </SidebarPanel>

          <SidebarPanel eyebrow="风险与来源" title="当前提示">
            <p className="text-sm leading-6 text-black/62">{riskState.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge
                label={`首个来源 ${formatLeadSourceSummary(shell.importSummary.firstSource)}`}
                variant="neutral"
              />
              <StatusBadge
                label={`最近来源 ${formatLeadSourceSummary(shell.importSummary.latestSource)}`}
                variant="neutral"
              />
              {shell.publicPoolReason ? (
                <StatusBadge label={publicPoolReasonLabel} variant="warning" />
              ) : null}
            </div>
          </SidebarPanel>
        </div>
      }
    >
      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      <section
        id="customer-main"
        className="rounded-[1.05rem] border border-black/7 bg-[rgba(255,255,255,0.86)] px-4 py-3.5 shadow-[0_8px_18px_rgba(18,24,31,0.04)] md:px-5 md:py-4"
      >
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1.5">
            <p className="crm-detail-label text-black/38">经营视角</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[1rem] font-semibold text-black/84">
                {activeGroupMeta.label}
              </h2>
              {activeGroupMeta.tabs.length > 1 ? (
                <StatusBadge label={activeTabMeta.label} variant="neutral" />
              ) : null}
              {activeTabCount !== null ? (
                <StatusBadge label={`${activeTabCount} 条记录`} variant="neutral" />
              ) : null}
            </div>
            <p className="max-w-3xl text-[13px] leading-6 text-black/56">
              {activeGroupMeta.description}
            </p>
          </div>

          <div className="text-[12px] leading-5 text-black/46">
            <p>
              最近导入：
              {shell.importSummary.latestImportAt
                ? formatDateTime(shell.importSummary.latestImportAt)
                : "暂无导入记录"}
            </p>
            <p>最近更新：{formatDateTime(shell.updatedAt)}</p>
          </div>
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
              gifts: shell._count.giftRecords,
              logs: shell.operationLogCount,
            }}
          />
        </div>
      </section>

      {renderTabContent({
        activeTab,
        shell,
        tabData,
        canCreateCalls,
        canCreateWechat,
        canManageLiveInvitations,
        canManageTags,
        canCreateSalesOrders,
        tradeOrderComposer,
        navigationContext,
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
