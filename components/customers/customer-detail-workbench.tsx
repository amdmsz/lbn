import type { ReactNode } from "react";
import Link from "next/link";
import { DetailLayout } from "@/components/layout-patterns/detail-layout";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { CustomerCallRecordsSection } from "@/components/customers/customer-call-records-section";
import { CustomerDetailTabs } from "@/components/customers/customer-detail-tabs";
import { CustomerLiveRecordsSection } from "@/components/customers/customer-live-records-section";
import {
  CustomerDetailItem,
  CustomerEmptyState,
  CustomerRecordCard,
  CustomerTabSection,
  formatOwnerLabel,
} from "@/components/customers/customer-record-list";
import { CustomerStatusBadge } from "@/components/customers/customer-status-badge";
import { CustomerTagsPanel } from "@/components/customers/customer-tags-panel";
import { CustomerWechatRecordsSection } from "@/components/customers/customer-wechat-records-section";
import { ActionBanner } from "@/components/shared/action-banner";
import { DetailSidebar } from "@/components/shared/detail-sidebar";
import { SectionCard } from "@/components/shared/section-card";
import { SmartLink } from "@/components/shared/smart-link";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyActionBar } from "@/components/shared/sticky-action-bar";
import { SummaryHeader } from "@/components/shared/summary-header";
import { TradeOrderForm } from "@/components/trade-orders/trade-order-form";
import {
  formatDateTime,
  formatRegion,
  getCustomerDetailTabMeta,
  getCustomerLevelLabel,
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

type CustomerDetailTabDataMap = {
  profile: CustomerProfileData;
  calls: CustomerCallsData;
  wechat: CustomerWechatData;
  live: CustomerLiveData;
  orders: CustomerOrdersData;
  gifts: CustomerGiftsData;
  logs: CustomerLogsData;
};

function formatLeadSourceSummary(source: CustomerDetailShellData["importSummary"]["firstSource"]) {
  return source ? getLeadSourceLabel(source) : "暂无";
}

function getCustomerTotalOrderCount(shell: CustomerDetailShellData) {
  return shell._count.salesOrders;
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

function formatDateTimeSummary(value: Date | null | undefined, emptyLabel = "暂无") {
  return value ? formatDateTime(value) : emptyLabel;
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

function getCustomerDetailBackLabel(navigationContext: CustomerDetailNavigationContext) {
  return navigationContext.from === "public-pool" ? "返回公海池" : "返回客户中心";
}

function buildFocusActions(
  role: "ADMIN" | "SUPERVISOR" | "SALES",
  shell: CustomerDetailShellData,
) {
  if (role === "SALES") {
    return [
      { tab: "calls" as const, label: "通话推进", count: shell._count.callRecords },
      { tab: "wechat" as const, label: "微信跟进", count: shell._count.wechatRecords },
      { tab: "live" as const, label: "直播邀约", count: shell._count.liveInvitations },
      { tab: "orders" as const, label: "成交结果", count: shell._count.salesOrders },
    ];
  }

  return [
    { tab: "profile" as const, label: "客户档案", count: shell.importSummary.linkedLeadCount },
    { tab: "calls" as const, label: "通话检查", count: shell._count.callRecords },
    { tab: "orders" as const, label: "成交结果", count: shell._count.salesOrders },
    { tab: "logs" as const, label: "操作日志", count: shell.operationLogCount },
  ];
}

function renderRecordCollectionTab({
  eyebrow,
  title,
  description,
  countLabel,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  countLabel: string;
  children: ReactNode;
}>) {
  return (
    <CustomerTabSection
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={<StatusBadge label={countLabel} variant="neutral" />}
    >
      {children}
    </CustomerTabSection>
  );
}

function renderProfileTab(
  shell: CustomerDetailShellData,
  data: CustomerProfileData,
  canManageTags: boolean,
  navigationContext?: CustomerDetailNavigationContext,
) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <div className="space-y-6">
          <CustomerTabSection
            eyebrow="客户资料"
            title="基础信息"
            description="基础身份信息、地区和客户分层集中在这里。"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <CustomerDetailItem label="姓名" value={shell.name} />
              <CustomerDetailItem label="手机号" value={shell.phone} />
              <CustomerDetailItem
                label="微信号"
                value={shell.wechatId?.trim() || "未填写"}
              />
              <CustomerDetailItem
                label="客户等级"
                value={getCustomerLevelLabel(shell.level)}
              />
              <CustomerDetailItem
                label="地区"
                value={formatRegion(shell.province, shell.city, shell.district)}
              />
              <CustomerDetailItem
                label="创建时间"
                value={formatDateTime(shell.createdAt)}
              />
              <CustomerDetailItem
                label="最近更新"
                value={formatDateTime(shell.updatedAt)}
              />
              <CustomerDetailItem
                label="地址"
                value={shell.address?.trim() || "未填写"}
              />
            </div>
            <div className="crm-subtle-panel mt-4 text-sm leading-7 text-black/64">
              备注：{shell.remark?.trim() || "暂无备注"}
            </div>
          </CustomerTabSection>

          <CustomerTabSection
            eyebrow="承接与来源"
            title="来源与归并"
            description="用于确认客户从哪里进入系统，以及当前由谁承接。"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <CustomerDetailItem label="负责人" value={formatOwnerLabel(shell.owner)} />
              <CustomerDetailItem
                label="首个来源"
                value={formatLeadSourceSummary(shell.importSummary.firstSource)}
              />
              <CustomerDetailItem
                label="最近来源"
                value={formatLeadSourceSummary(shell.importSummary.latestSource)}
              />
              <CustomerDetailItem
                label="最近导入"
                value={
                  shell.importSummary.latestImportAt
                    ? formatDateTime(shell.importSummary.latestImportAt)
                    : "暂无导入记录"
                }
              />
              <CustomerDetailItem
                label="关联线索"
                value={String(shell.importSummary.linkedLeadCount)}
              />
              <CustomerDetailItem
                label="导入 / 归并事件"
                value={String(shell.importSummary.importEventCount)}
              />
            </div>
          </CustomerTabSection>
        </div>

        <CustomerTagsPanel
          customerId={shell.id}
          redirectTo={buildCustomerTabHref(shell.id, "profile", navigationContext)}
          tags={data.customerTags}
          availableTags={data.availableTags}
          canManage={canManageTags}
        />
      </div>

      <CustomerTabSection
        eyebrow="关联线索"
        title="线索回流"
        description="用于核对承接来源、原始线索状态和归并记录。"
      >
        {data.leads.length > 0 ? (
          <div className="space-y-3">
            {data.leads.map((lead) => (
              <CustomerRecordCard
                key={lead.id}
                title={lead.name?.trim() || lead.phone}
                meta={[
                  `手机号：${lead.phone}`,
                  `来源：${getLeadSourceLabel(lead.source)}`,
                  `状态：${getLeadStatusLabel(lead.status)}`,
                  `创建时间：${formatDateTime(lead.createdAt)}`,
                ]}
                href={`/leads/${lead.id}`}
                hrefLabel="查看线索"
              />
            ))}
          </div>
        ) : (
          <CustomerEmptyState
            title="暂无关联线索"
            description="当前客户暂时没有回流的线索记录。"
          />
        )}
      </CustomerTabSection>

      <CustomerTabSection
        eyebrow="导入与归并"
        title="导入历史"
        description="保留导入批次、归并动作和标签同步记录，便于审计。"
      >
        {data.mergeLogs.length > 0 ? (
          <div className="space-y-3">
            {data.mergeLogs.map((record) => (
              <CustomerRecordCard
                key={record.id}
                title={`${record.lead.name?.trim() || record.lead.phone} → ${record.batch.fileName}`}
                meta={[
                  `来源：${getLeadSourceLabel(record.source)}`,
                  `动作：${record.action}`,
                  `标签同步：${record.tagSynced ? "已同步" : "未同步"}`,
                  `时间：${formatDateTime(record.createdAt)}`,
                ]}
                description={`线索手机号：${record.lead.phone}`}
                href={`/leads/${record.lead.id}`}
                hrefLabel="查看线索"
              />
            ))}
          </div>
        ) : (
          <CustomerEmptyState
            title="暂无导入归并记录"
            description="当前客户还没有导入归并历史。"
          />
        )}
      </CustomerTabSection>
    </div>
  );
}

function renderLegacyOrdersTab(
  data: CustomerOrdersData,
  customerId: string,
  canCreateSalesOrders: boolean,
  navigationContext?: CustomerDetailNavigationContext,
) {
  return renderRecordCollectionTab({
    eyebrow: "成交记录",
    title: "订单记录",
    description: "在客户维度回看成交、审核、履约与 COD 回流结果。",
    countLabel: `${data.length} 条记录`,
    children:
      data.length > 0 ? (
        <div className="space-y-6">
          {canCreateSalesOrders ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white/72 px-4 py-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-black/82">从当前客户继续发起订单</div>
                <div className="text-xs text-black/55">
                  建单入口仍然挂在客户上下文，不回到全局订单页重新找客户。
                </div>
              </div>
              <Link
                href={buildCustomerTradeOrderHref(customerId, undefined, navigationContext)}
                className="crm-button crm-button-primary"
              >
                创建成交主单
              </Link>
            </div>
          ) : null}

          <div className="space-y-3">
            {data.map((record) => {
              const latestCodRecord = record.shippingTask?.codCollectionRecords?.[0] ?? null;
              const latestLogisticsTask = record.shippingTask?.logisticsFollowUpTasks?.[0] ?? null;

              return (
                <CustomerRecordCard
                  key={record.id}
                  title={`${record.tradeOrder?.tradeNo ? `${record.tradeOrder.tradeNo} / ${record.subOrderNo || record.orderNo}` : record.orderNo} / ${formatCurrency(record.finalAmount)}`}
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
                    `报单状态：${record.shippingTask ? getShippingReportStatusLabel(record.shippingTask.reportStatus) : "未进入发货池"}`,
                    `发货状态：${record.shippingTask ? getShippingFulfillmentStatusLabel(record.shippingTask.shippingStatus) : "待审核"}`,
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
        </div>
      ) : (
        <CustomerEmptyState
          title="暂无订单记录"
          description="当前客户还没有成交主单记录。"
        />
      ),
  });
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
    <div className="space-y-6">
      {canCreateSalesOrders ? (
        <div className="space-y-4 rounded-2xl border border-black/8 bg-white/72 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium text-black/82">从当前客户继续发起订单</div>
              <div className="text-xs text-black/55">
                入口已切到成交主单表单，支持多 SKU 和多供货商直售，并在提交审核时自动拆子单。
              </div>
            </div>
            <Link
              href={buildCustomerTradeOrderHref(
                customerId,
                tradeOrderComposer?.draft?.id,
                navigationContext,
              )}
              className="crm-button crm-button-primary"
            >
              {tradeOrderComposer ? "继续编辑成交表单" : "创建成交主单"}
            </Link>
          </div>

          {tradeOrderComposer && saveTradeOrderDraftAction && submitTradeOrderForReviewAction ? (
            <TradeOrderForm
              customer={tradeOrderComposer.customer}
              paymentSchemeOptions={tradeOrderComposer.paymentSchemeOptions}
              skuOptions={tradeOrderComposer.skuOptions}
              bundleOptions={tradeOrderComposer.bundleOptions}
              draft={tradeOrderComposer.draft}
              saveDraftAction={saveTradeOrderDraftAction}
              submitForReviewAction={submitTradeOrderForReviewAction}
            />
          ) : null}
        </div>
      ) : null}

      {renderLegacyOrdersTab(data, customerId, false, navigationContext)}
    </div>
  );
}

function renderGiftsTab(data: CustomerGiftsData) {
  return renderRecordCollectionTab({
    eyebrow: "礼品记录",
    title: "礼品资格与履约",
    description: "礼品资格、审核和发货结果继续独立承接，不混入订单真相。",
    countLabel: `${data.length} 条记录`,
    children:
      data.length > 0 ? (
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
          description="当前客户还没有礼品资格或礼品履约记录。"
        />
      ),
  });
}

function renderLogsTab(data: CustomerLogsData) {
  return renderRecordCollectionTab({
    eyebrow: "审计记录",
    title: "操作日志",
    description: "保留客户相关重要动作的责任人和时间线，便于追溯。",
    countLabel: `${data.length} 条记录`,
    children:
      data.length > 0 ? (
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
          description="当前客户还没有可展示的操作日志。"
        />
      ),
  });
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
}>) {
  switch (activeTab) {
    case "profile":
      return renderProfileTab(
        shell,
        tabData as CustomerProfileData,
        canManageTags,
        navigationContext,
      );
    case "calls":
      return (
        <CustomerCallRecordsSection
          customerId={shell.id}
          records={tabData as CustomerCallsData}
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
  notice,
  canCreateCalls,
  canCreateWechat,
  canManageLiveInvitations,
  canManageTags,
  canCreateSalesOrders,
  tradeOrderComposer,
  navigationContext,
  saveTradeOrderDraftAction,
  submitTradeOrderForReviewAction,
}: Readonly<{
  shell: CustomerDetailShellData;
  navigationContext: CustomerDetailNavigationContext;
  activeTab: CustomerDetailTab;
  tabData: CustomerDetailTabDataMap[CustomerDetailTab];
  notice: { tone: "success" | "danger"; message: string } | null;
  canCreateCalls: boolean;
  canCreateWechat: boolean;
  canManageLiveInvitations: boolean;
  canManageTags: boolean;
  canCreateSalesOrders: boolean;
  tradeOrderComposer: TradeOrderComposerData | null;
  saveTradeOrderDraftAction?: (formData: FormData) => Promise<void>;
  submitTradeOrderForReviewAction?: (formData: FormData) => Promise<void>;
}>) {
  const activeTabMeta = getCustomerDetailTabMeta(activeTab);
  const activeTabCount = getActiveTabCount(activeTab, shell);
  const isManagementView = shell.viewerScope === "ADMIN" || shell.viewerScope === "SUPERVISOR";
  const isPublicPoolContext = navigationContext.from === "public-pool";
  const effectiveRole: "ADMIN" | "SUPERVISOR" | "SALES" =
    shell.viewerScope === "ADMIN" || shell.viewerScope === "SUPERVISOR"
      ? shell.viewerScope
      : "SALES";
  const focusActions = buildFocusActions(effectiveRole, shell);
  const ownershipLabel = getCustomerOwnershipModeLabel(shell.ownershipMode);
  const publicPoolReasonLabel = shell.publicPoolReason
    ? publicPoolReasonLabels[shell.publicPoolReason]
    : "暂无入池原因";

  return (
    <WorkbenchLayout
      header={
        <SummaryHeader
          eyebrow="客户经营页"
          title={shell.name}
          description="详情页统一收口为摘要区、快捷动作、左侧摘要和右侧 Tabs 主内容，当前仅按激活标签页拉取数据。"
          badges={
            <>
              <CustomerStatusBadge status={shell.status} />
              <StatusBadge
                label={`Ownership：${ownershipLabel}`}
                variant={shell.ownershipMode === "PUBLIC" ? "warning" : "info"}
              />
              <StatusBadge
                label={shell.owner ? `负责人：${shell.owner.name}` : "未分配负责人"}
                variant={shell.owner ? "info" : "neutral"}
              />
              {isPublicPoolContext ? (
                <StatusBadge label="来自公海池" variant="warning" />
              ) : null}
              <StatusBadge
                label={`物流提醒 ${shell.logisticsFollowUpCount}`}
                variant={shell.logisticsFollowUpCount > 0 ? "warning" : "neutral"}
              />
            </>
          }
          actions={
            <div className="crm-toolbar-cluster">
              <Link
                href={navigationContext.returnTo ?? "/customers"}
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                {getCustomerDetailBackLabel(navigationContext)}
              </Link>
              {canCreateSalesOrders ? (
                <Link
                  href={buildCustomerTradeOrderHref(
                    shell.id,
                    tradeOrderComposer?.draft?.id,
                    navigationContext,
                  )}
                  className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                >
                  创建成交主单
                </Link>
              ) : null}
            </div>
          }
          metrics={[
            {
              label: "关联线索",
              value: String(shell.importSummary.linkedLeadCount),
              hint: "承接来源与归并历史",
            },
            {
              label: "通话记录",
              value: String(shell._count.callRecords),
              hint: "首呼与后续跟进节奏",
            },
            {
              label: "微信 / 直播",
              value: `${shell._count.wechatRecords} / ${shell._count.liveInvitations}`,
              hint: "私域触点与邀约推进",
            },
            {
              label: "订单 / 礼品",
              value: `${getCustomerTotalOrderCount(shell)} / ${shell._count.giftRecords}`,
              hint: "成交与履约回流结果",
            },
          ]}
        />
      }
      stickyBar={
        <StickyActionBar
          title={isManagementView ? "管理快捷动作" : "下一步动作"}
          description={
            isManagementView
              ? "先看档案、记录和成交结果，再判断是否存在承接异常或过程风险。"
              : "优先进入通话、微信、直播和订单标签页继续推进当前客户。"
          }
        >
          {focusActions.map((item) => (
            <SmartLink
              key={item.tab}
              href={buildCustomerTabHref(shell.id, item.tab, navigationContext)}
              scrollTargetId="customer-records"
              className={cn(
                "crm-button",
                activeTab === item.tab ? "crm-button-primary" : "crm-button-secondary",
              )}
            >
              <span>{item.label}</span>
              <span className="text-[11px] font-semibold tracking-[0.08em] text-current/72">
                {item.count}
              </span>
            </SmartLink>
          ))}
        </StickyActionBar>
      }
    >
      <DetailLayout
        sidebar={
          <DetailSidebar
            sections={[
              {
                eyebrow: isPublicPoolContext ? "Ownership 摘要" : "Ownership",
                title: isPublicPoolContext ? "公海池上下文" : "当前归属状态",
                description: isPublicPoolContext
                  ? "当前详情来自公海池，保留入池原因、最近 owner 和返回上下文。"
                  : "客户归属、入池历史和最近有效跟进在这里统一查看。",
                items: [
                  { label: "当前状态", value: ownershipLabel },
                  { label: "负责人", value: formatOwnerLabel(shell.owner) },
                  {
                    label: "最近 Owner",
                    value: shell.lastOwner ? shell.lastOwner.name : "暂无最近 owner",
                  },
                  { label: "入池原因", value: publicPoolReasonLabel },
                  {
                    label: "入池时间",
                    value: formatDateTimeSummary(shell.publicPoolEnteredAt, "未在公海中"),
                  },
                  {
                    label: "最近有效跟进",
                    value: formatDateTimeSummary(shell.lastEffectiveFollowUpAt),
                  },
                  {
                    label: "保护至",
                    value: formatDateTimeSummary(shell.claimLockedUntil, "未锁定"),
                  },
                  {
                    label: "公海团队",
                    value: shell.publicPoolTeam?.name ?? shell.owner?.team?.name ?? "暂无团队",
                  },
                ],
              },
              {
                eyebrow: isManagementView ? "管理摘要" : "执行摘要",
                title: isManagementView ? "客户经营摘要" : "下一步重点",
                description: isManagementView
                  ? "先看承接、来源和日志，再进入标签页检查具体记录。"
                  : "优先处理首呼、微信、直播和成交推进动作。",
                items: [
                  { label: "负责人", value: formatOwnerLabel(shell.owner) },
                  {
                    label: "最近跟进",
                    value: shell.latestFollowUpAt ? formatDateTime(shell.latestFollowUpAt) : "暂无",
                  },
                  { label: "关联线索", value: String(shell.importSummary.linkedLeadCount) },
                  { label: "日志记录", value: String(shell.operationLogCount) },
                  { label: "物流提醒", value: String(shell.logisticsFollowUpCount) },
                ],
              },
              {
                eyebrow: "客户档案",
                title: "基础信息",
                items: [
                  {
                    label: "地区",
                    value: formatRegion(shell.province, shell.city, shell.district),
                  },
                  { label: "等级", value: getCustomerLevelLabel(shell.level) },
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
                  { label: "最近更新", value: formatDateTime(shell.updatedAt) },
                ],
              },
              {
                eyebrow: "角色边界",
                title: "当前工作边界",
                items: [
                  {
                    label: "当前角色",
                    value: isManagementView ? "管理视角" : "销售执行视角",
                  },
                  {
                    label: "订单动作",
                    value: canCreateSalesOrders ? "可继续发起成交主单" : "仅查看成交结果",
                  },
                  {
                    label: "跟进动作",
                    value:
                      canCreateCalls || canCreateWechat || canManageLiveInvitations
                        ? "可在标签页补录关键跟进动作"
                        : "当前页面以查看记录为主",
                  },
                ],
              },
            ]}
          />
        }
        main={
          <>
            {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

            <SectionCard
              eyebrow="主内容"
              title="客户经营主内容"
              description="右侧只承接当前激活的业务标签页，左侧摘要不再和全部记录混排。"
              contentClassName="space-y-3.5"
              anchorId="customer-records"
            >
              <CustomerDetailTabs
                customerId={shell.id}
                activeTab={activeTab}
                buildHref={(tab) => buildCustomerTabHref(shell.id, tab, navigationContext)}
                scrollTargetId="customer-records"
                counts={{
                  calls: shell._count.callRecords,
                  wechat: shell._count.wechatRecords,
                  live: shell._count.liveInvitations,
                  orders: shell._count.salesOrders,
                  gifts: shell._count.giftRecords,
                  logs: shell.operationLogCount,
                }}
              />

              <div className="crm-subtle-panel flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1.5">
                  <p className="crm-detail-label">当前标签页</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-black/82">{activeTabMeta.label}</p>
                    {activeTabCount !== null ? (
                      <StatusBadge label={`${activeTabCount} 条记录`} variant="neutral" />
                    ) : null}
                  </div>
                  <p className="max-w-3xl text-sm leading-6 text-black/58">
                    {activeTabMeta.description}
                  </p>
                </div>
                <div className="text-sm leading-6 text-black/56">
                  <p>
                    最近导入：
                    {shell.importSummary.latestImportAt
                      ? formatDateTime(shell.importSummary.latestImportAt)
                      : "暂无导入记录"}
                  </p>
                  <p>最近更新：{formatDateTime(shell.updatedAt)}</p>
                </div>
              </div>

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
              })}
            </SectionCard>
          </>
        }
      />
    </WorkbenchLayout>
  );
}
