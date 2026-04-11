import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ActionBanner } from "@/components/shared/action-banner";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { PageToolbar } from "@/components/shared/page-toolbar";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ShippingExportBatchesSection } from "@/components/shipping/shipping-export-batches-section";
import { ShippingOperationsSection } from "@/components/shipping/shipping-operations-section";
import { TradeOrdersSection } from "@/components/trade-orders/trade-orders-section";
import {
  canAccessSalesOrderModule,
  canAccessShippingModule,
} from "@/lib/auth/access";
import {
  buildOrderFulfillmentHref,
  getOrderFulfillmentViewLabel,
  getOrderFulfillmentViewsForRole,
  type OrderFulfillmentView,
} from "@/lib/fulfillment/navigation";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  getShippingExportBatchesPageData,
  getShippingOperationsPageData,
} from "@/lib/shipping/queries";
import { getTradeOrdersPageData } from "@/lib/trade-orders/queries";

type TradeOrdersData = Awaited<ReturnType<typeof getTradeOrdersPageData>>;
type ShippingData = Awaited<ReturnType<typeof getShippingOperationsPageData>>;
type BatchData = Awaited<ReturnType<typeof getShippingExportBatchesPageData>>;

function getRoleMeta(role: RoleCode) {
  switch (role) {
    case "SHIPPER":
      return {
        scope: "发货执行默认入口",
        description: "统一查看交易单、发货执行与批次。",
      };
    case "SALES":
      return {
        scope: "交易单默认入口",
        description: "统一回看成交与履约。",
      };
    default:
      return {
        scope: "域级总览入口",
        description: "统一承接交易、发货与批次。",
      };
  }
}

function getSummaryItems(
  activeView: OrderFulfillmentView,
  tradeOrdersData: TradeOrdersData | null,
  shippingData: ShippingData | null,
  batchData: BatchData | null,
): PageSummaryStripItem[] {
  if (activeView === "trade-orders" && tradeOrdersData) {
    return [
      {
        label: "父单总数",
        value: String(tradeOrdersData.summary.totalCount),
        note: "当前筛选范围内的成交主单",
      },
      {
        label: "待审核",
        value: String(tradeOrdersData.summary.pendingReviewCount),
        note: "等待主管或管理员处理",
        href: buildOrderFulfillmentHref("trade-orders", { statusView: "PENDING_REVIEW" }),
        emphasis: "warning",
      },
      {
        label: "已审核",
        value: String(tradeOrdersData.summary.approvedCount),
        note: "已进入履约与收款执行",
        href: buildOrderFulfillmentHref("trade-orders", { statusView: "APPROVED" }),
        emphasis: "success",
      },
      {
        label: "待回收金额",
        value: formatCurrency(tradeOrdersData.summary.totalRemainingAmount),
        note: "支付与催收仍在执行链路中",
        emphasis: "info",
      },
    ];
  }

  if (activeView === "shipping" && shippingData) {
    return [
      {
        label: "履约任务",
        value: String(shippingData.summary.totalCount),
        note: "当前范围内的 supplier 子单执行任务",
      },
      {
        label: "待报单",
        value: String(shippingData.summary.pendingReportCount),
        note: "尚未冻结并导出给 supplier",
        href: buildOrderFulfillmentHref("shipping", { stageView: "PENDING_REPORT" }),
        emphasis: "warning",
      },
      {
        label: "待回物流",
        value: String(shippingData.summary.pendingTrackingCount),
        note: "已报单但尚未回填物流单号",
        href: buildOrderFulfillmentHref("shipping", { stageView: "PENDING_TRACKING" }),
        emphasis: "info",
      },
      {
        label: "已发货",
        value: String(shippingData.summary.shippedCount),
        note: "已进入签收与回款关注",
        href: buildOrderFulfillmentHref("shipping", { stageView: "SHIPPED" }),
        emphasis: "success",
      },
      {
        label: "履约异常",
        value: String(shippingData.summary.exceptionCount),
        note: "优先处理取消、文件异常和状态冲突",
        href: buildOrderFulfillmentHref("shipping", { stageView: "EXCEPTION" }),
        emphasis: "warning",
      },
    ];
  }

  if (activeView === "batches" && batchData) {
    const currentLineCount = batchData.items.reduce((sum, item) => sum + item._count.lines, 0);
    const readyCount = batchData.items.filter((item) => item.fileState === "READY").length;
    const pendingGenerationCount = batchData.items.filter(
      (item) => item.fileState === "MISSING" || item.fileState === "PENDING",
    ).length;

    return [
      {
        label: "批次总数",
        value: String(batchData.pagination.totalCount),
        note: "冻结导出快照与历史批次",
      },
      {
        label: "本页冻结行",
        value: String(currentLineCount),
        note: "当前页 ShippingExportLine 快照行数",
      },
      {
        label: "已生成文件",
        value: String(readyCount),
        note: "当前页可直接下载的批次",
        emphasis: "success",
      },
      {
        label: "待重生成",
        value: String(pendingGenerationCount),
        note: "快照已冻结，但文件尚未生成或缺失",
        emphasis: pendingGenerationCount > 0 ? "warning" : "default",
      },
    ];
  }

  return [];
}

function getViewMeta(activeView: OrderFulfillmentView) {
  switch (activeView) {
    case "trade-orders":
      return {
        title: "交易单",
        description: "查看成交审核与父单履约。",
        eyebrow: "父单叙事",
      };
    case "shipping":
      return {
        title: "发货执行",
        description: "按阶段和 supplier 处理发货执行。",
        eyebrow: "执行视图",
      };
    case "batches":
      return {
        title: "批次记录",
        description: "查看冻结批次与文件。",
        eyebrow: "结果与审计",
      };
    default:
      return {
        title: "",
        description: "",
        eyebrow: "",
      };
  }
}

function getShippingStageCount(shippingData: ShippingData) {
  switch (shippingData.filters.stageView) {
    case "PENDING_TRACKING":
      return shippingData.summary.pendingTrackingCount;
    case "SHIPPED":
      return shippingData.summary.shippedCount;
    case "EXCEPTION":
      return shippingData.summary.exceptionCount;
    case "PENDING_REPORT":
    default:
      return shippingData.summary.pendingReportCount;
  }
}

function getTradeOrdersFocusLabel(tradeOrdersData: TradeOrdersData) {
  return tradeOrdersData.filters.focusView || tradeOrdersData.filters.statusView || "全部";
}

export function OrderFulfillmentCenter({
  role,
  activeView,
  tradeOrdersData,
  shippingData,
  batchData,
  canCreateTradeOrder,
  canReviewTradeOrder,
  canManageShippingReporting,
  reviewTradeOrderAction,
  createShippingExportBatchAction,
  updateShippingAction,
  bulkUpdateShippingAction,
  regenerateShippingExportBatchFileAction,
}: Readonly<{
  role: RoleCode;
  activeView: OrderFulfillmentView;
  tradeOrdersData: TradeOrdersData | null;
  shippingData: ShippingData | null;
  batchData: BatchData | null;
  canCreateTradeOrder: boolean;
  canReviewTradeOrder: boolean;
  canManageShippingReporting: boolean;
  reviewTradeOrderAction: (formData: FormData) => Promise<void>;
  createShippingExportBatchAction: (formData: FormData) => Promise<void>;
  updateShippingAction: (formData: FormData) => Promise<void>;
  bulkUpdateShippingAction: (formData: FormData) => Promise<void>;
  regenerateShippingExportBatchFileAction: (formData: FormData) => Promise<void>;
}>) {
  const roleMeta = getRoleMeta(role);
  const viewMeta = getViewMeta(activeView);
  const accessibleViews = getOrderFulfillmentViewsForRole(role);
  const isShippingView = activeView === "shipping" && shippingData !== null;
  const isTradeOrdersView = activeView === "trade-orders" && tradeOrdersData !== null;
  const summaryItems = getSummaryItems(
    activeView,
    tradeOrdersData,
    shippingData,
    batchData,
  );
  const notice =
    tradeOrdersData?.notice ?? shippingData?.notice ?? batchData?.notice ?? null;

  const headerDescription = isShippingView
    ? "按阶段和 supplier 组织发货执行工作面，保留统一入口与导航语义，只把执行层收口成更稳定的 supplier workbench。"
    : isTradeOrdersView
      ? "以 TradeOrder 为父单主叙事，统一承接审核、履约摘要和跨执行视图跳转，不回退到子单主视角。"
      : roleMeta.description;

  const headerMeta = isShippingView ? (
    <>
      <StatusBadge label={roleMeta.scope} variant="info" />
      <StatusBadge
        label={`当前视图 ${getOrderFulfillmentViewLabel(activeView)}`}
        variant="success"
      />
      <StatusBadge
        label={`当前 supplier ${shippingData.activeSupplier?.supplier.name ?? "待选择"}`}
        variant={shippingData.activeSupplier ? "neutral" : "warning"}
      />
      <StatusBadge
        label={`stage ${shippingData.filters.stageView}`}
        variant={shippingData.filters.stageView === "EXCEPTION" ? "warning" : "info"}
      />
    </>
  ) : isTradeOrdersView ? (
    <>
      <StatusBadge label={roleMeta.scope} variant="info" />
      <StatusBadge
        label={`当前视图 ${getOrderFulfillmentViewLabel(activeView)}`}
        variant="success"
      />
      <StatusBadge
        label={`当前焦点 ${getTradeOrdersFocusLabel(tradeOrdersData)}`}
        variant="neutral"
      />
      <StatusBadge label="详情语义 parent-first" variant="info" />
    </>
  ) : (
    <>
      <StatusBadge label={roleMeta.scope} variant="info" />
      <StatusBadge
        label={`当前视图 ${getOrderFulfillmentViewLabel(activeView)}`}
        variant="success"
      />
      <StatusBadge label="兼容路由持续可用" variant="neutral" />
    </>
  );

  const summary = isShippingView ? (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        label="当前阶段"
        value={String(getShippingStageCount(shippingData))}
        note="当前 stage 下可继续处理的执行记录"
        density="strip"
      />
      <MetricCard
        label="supplier 池"
        value={String(shippingData.summary.supplierCount)}
        note="当前筛选范围内可见 supplier 数量"
        density="strip"
      />
      <MetricCard
        label="待填物流"
        value={String(shippingData.summary.pendingTrackingCount)}
        note="已导出但尚未回填物流单号"
        density="strip"
      />
      <MetricCard
        label="已发货"
        value={String(shippingData.summary.shippedCount)}
        note="已进入签收与回款关注阶段"
        density="strip"
      />
      <MetricCard
        label="履约异常"
        value={String(shippingData.summary.exceptionCount)}
        note="优先处理取消、文件异常和状态冲突"
        density="strip"
      />
    </div>
  ) : isTradeOrdersView ? (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="父单总数"
        value={String(tradeOrdersData.summary.totalCount)}
        note="当前筛选范围内的成交主单"
        density="strip"
      />
      <MetricCard
        label="待审核"
        value={String(tradeOrdersData.summary.pendingReviewCount)}
        note="等待主管或管理员处理"
        density="strip"
      />
      <MetricCard
        label="已审核"
        value={String(tradeOrdersData.summary.approvedCount)}
        note="已进入履约与收款执行"
        density="strip"
      />
      <MetricCard
        label="待回收金额"
        value={formatCurrency(tradeOrdersData.summary.totalRemainingAmount)}
        note="支付与催收仍在执行链路中"
        density="strip"
      />
    </div>
  ) : summaryItems.length > 0 ? (
    <PageSummaryStrip items={summaryItems} />
  ) : undefined;

  const toolbar = isShippingView ? (
    <SectionCard
      eyebrow="Supplier Workbench"
      title="发货执行工作面"
      description="先按阶段切换，再进入具体 supplier 工作池。批量动作和明细表保持在同一条执行语境里。"
      density="compact"
      className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
      actions={
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge label={`可见视图 ${accessibleViews.length}`} variant="neutral" />
          <StatusBadge
            label={
              shippingData.activeBatch
                ? `当前批次 ${shippingData.activeBatch.exportNo}`
                : "当前未锁定批次"
            }
            variant={shippingData.activeBatch ? "success" : "neutral"}
          />
          <StatusBadge
            label={canAccessSalesOrderModule(role) ? "保留父单叙事" : "仅执行视角"}
            variant={canAccessSalesOrderModule(role) ? "info" : "warning"}
          />
        </div>
      }
    >
      <div className="space-y-3">
        <RecordTabs
          activeValue={activeView}
          items={accessibleViews.map((view) => ({
            value: view,
            label: getOrderFulfillmentViewLabel(view),
            href: buildOrderFulfillmentHref(view),
          }))}
        />
        <div className="rounded-[0.95rem] border border-black/8 bg-[rgba(247,248,250,0.72)] px-3.5 py-3 text-sm leading-6 text-black/66">
          当前聚焦于阶段 {shippingData.filters.stageView}，supplier 为{" "}
          {shippingData.activeSupplier?.supplier.name ?? "待选择"}。保留 tab、stageView、
          supplierViewId 等导航参数不变，只收口执行层级与信息密度。
        </div>
      </div>
    </SectionCard>
  ) : isTradeOrdersView ? (
    <SectionCard
      eyebrow="TradeOrder Workbench"
      title="父单总览工作台"
      description="先按焦点切换，再在当前父单池里完成审核、履约概览和跨执行视图跳转。默认态更利于扫描，次级动作后置。"
      density="compact"
      className="rounded-[1.05rem] border-black/8 bg-[rgba(255,255,255,0.88)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]"
      actions={
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge
            label={`待审核 ${tradeOrdersData.summary.pendingReviewCount}`}
            variant={tradeOrdersData.summary.pendingReviewCount > 0 ? "warning" : "neutral"}
          />
          <StatusBadge
            label={`已审核 ${tradeOrdersData.summary.approvedCount}`}
            variant="success"
          />
          <StatusBadge
            label={canAccessSalesOrderModule(role) ? "保留父单主叙事" : "只读总览视角"}
            variant={canAccessSalesOrderModule(role) ? "info" : "neutral"}
          />
        </div>
      }
    >
      <div className="space-y-3">
        <RecordTabs
          activeValue={activeView}
          items={accessibleViews.map((view) => ({
            value: view,
            label: getOrderFulfillmentViewLabel(view),
            href: buildOrderFulfillmentHref(view),
          }))}
        />
        <div className="rounded-[0.95rem] border border-black/8 bg-[rgba(247,248,250,0.72)] px-3.5 py-3 text-sm leading-6 text-black/66">
          当前焦点为 {getTradeOrdersFocusLabel(tradeOrdersData)}，审核状态筛选为{" "}
          {tradeOrdersData.filters.statusView || "全部"}。保留 parent-first 详情语义和
          `/orders/[id]` 兼容跳转，只收口父单列表层级与动作优先级。
        </div>
      </div>
    </SectionCard>
  ) : (
    <PageToolbar
      eyebrow={viewMeta.eyebrow}
      title={viewMeta.title}
      description={viewMeta.description}
      secondary={
        <>
          <StatusBadge label={`可见视图 ${accessibleViews.length}`} variant="neutral" />
          <StatusBadge
            label={canAccessSalesOrderModule(role) ? "保留父单叙事" : "仅执行视角"}
            variant={canAccessSalesOrderModule(role) ? "info" : "warning"}
          />
        </>
      }
      primary={
        <RecordTabs
          activeValue={activeView}
          items={accessibleViews.map((view) => ({
            value: view,
            label: getOrderFulfillmentViewLabel(view),
            href: buildOrderFulfillmentHref(view),
          }))}
        />
      }
    />
  );

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="订单履约业务域"
          title="订单中心"
          description={headerDescription}
          meta={headerMeta}
          actions={
            <div className="crm-toolbar-cluster">
              {canCreateTradeOrder ? (
                <Link
                  href="/customers"
                  className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
                >
                  去客户中心建单
                </Link>
              ) : null}
              {canAccessShippingModule(role) ? (
                <Link
                  href={buildOrderFulfillmentHref("shipping")}
                  className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
                >
                  切到发货执行
                </Link>
              ) : null}
            </div>
          }
        />
      }
      summary={summary}
      toolbar={toolbar}
    >
      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      {activeView === "trade-orders" && tradeOrdersData ? (
        <TradeOrdersSection
          summary={tradeOrdersData.summary}
          items={tradeOrdersData.items}
          filters={tradeOrdersData.filters}
          suppliers={tradeOrdersData.suppliers}
          pagination={tradeOrdersData.pagination}
          canCreate={canCreateTradeOrder}
          canReview={canReviewTradeOrder}
          reviewAction={reviewTradeOrderAction}
          basePath="/fulfillment"
          baseSearchParams={{ tab: "trade-orders" }}
        />
      ) : null}

      {activeView === "shipping" && shippingData ? (
        <ShippingOperationsSection
          summary={shippingData.summary}
          supplierSummaries={shippingData.supplierSummaries}
          activeSupplier={shippingData.activeSupplier}
          pendingBatchSummaries={shippingData.pendingBatchSummaries}
          activeBatch={shippingData.activeBatch}
          items={shippingData.items}
          activeBatchItems={shippingData.activeBatchItems}
          filters={shippingData.filters}
          pagination={shippingData.pagination}
          canManageReporting={canManageShippingReporting}
          createExportBatchAction={createShippingExportBatchAction}
          updateShippingAction={updateShippingAction}
          bulkUpdateShippingAction={bulkUpdateShippingAction}
          regenerateFileAction={regenerateShippingExportBatchFileAction}
          basePath="/fulfillment"
          baseSearchParams={{ tab: "shipping" }}
          exportBatchesHref={buildOrderFulfillmentHref("batches")}
        />
      ) : null}

      {activeView === "batches" && batchData ? (
        <SectionCard
          eyebrow="批次记录"
          title="ShippingExportBatch 冻结结果与审计"
          description="查看批次、文件与审计。"
        >
          <ShippingExportBatchesSection
            items={batchData.items}
            filters={batchData.filters}
            pagination={batchData.pagination}
            canManageReporting={canManageShippingReporting}
            regenerateFileAction={regenerateShippingExportBatchFileAction}
            basePath="/fulfillment"
            baseSearchParams={{ tab: "batches" }}
            backHref={buildOrderFulfillmentHref(
              canAccessShippingModule(role) ? "shipping" : "trade-orders",
            )}
            backLabel={canAccessShippingModule(role) ? "返回发货执行" : "返回交易单"}
          />
        </SectionCard>
      ) : null}
    </WorkbenchLayout>
  );
}
