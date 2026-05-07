import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ActionBanner } from "@/components/shared/action-banner";
import { MetricCard } from "@/components/shared/metric-card";
import { PageHeader } from "@/components/shared/page-header";
import { RecordTabs } from "@/components/shared/record-tabs";
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
import type { RecycleFinalizePreview } from "@/lib/recycle-bin/types";
import {
  getShippingExportBatchesPageData,
  getShippingOperationsPageData,
} from "@/lib/shipping/queries";
import { getTradeOrdersPageData } from "@/lib/trade-orders/queries";
import type { TradeOrderRecycleGuard } from "@/lib/trade-orders/recycle-guards";

type TradeOrdersData = Awaited<ReturnType<typeof getTradeOrdersPageData>>;
type ShippingData = Awaited<ReturnType<typeof getShippingOperationsPageData>>;
type BatchData = Awaited<ReturnType<typeof getShippingExportBatchesPageData>>;

function getRoleMeta(role: RoleCode) {
  switch (role) {
    case "SHIPPER":
      return {
        scope: "发货执行视角",
        description: "按 supplier 子单处理报单、导出、物流回填和异常跟进。",
      };
    case "SALES":
      return {
        scope: "我的成交与履约",
        description: "查看自己成交父单的审核、收款和履约进度。",
      };
    default:
      return {
        scope: "订单履约总览",
        description: "父单保留成交真相，supplier 子单分别执行发货和物流。",
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
  return (
    tradeOrdersData.filters.focusView ||
    tradeOrdersData.filters.statusView ||
    "全部"
  );
}

function getBatchFileViewLabel(fileView: string) {
  switch (fileView) {
    case "READY":
      return "文件就绪";
    case "MISSING":
    case "MISSING_FILE":
      return "文件缺失";
    case "PENDING":
      return "待生成";
    case "LEGACY":
      return "历史兼容";
    default:
      return "全部文件状态";
  }
}

function getBatchCurrentLineCount(batchData: BatchData) {
  return batchData.items.reduce((sum, item) => sum + item._count.lines, 0);
}

function getBatchReadyCount(batchData: BatchData) {
  return batchData.items.filter((item) => item.fileState === "READY").length;
}

function getBatchPendingCount(batchData: BatchData) {
  return batchData.items.filter(
    (item) => item.fileState === "MISSING" || item.fileState === "PENDING",
  ).length;
}

function getBatchLegacyCount(batchData: BatchData) {
  return batchData.items.filter((item) => item.fileState === "LEGACY").length;
}

function ContextStrip({ items }: Readonly<{ items: string[] }>) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-full border border-border/50 bg-transparent px-3 py-1.5 text-[11px] font-medium tracking-[0.04em] text-muted-foreground">
      {items.map((item, index) => (
        <span key={`${item}-${index}`} className="contents">
          {index > 0 ? (
            <span className="h-1 w-1 rounded-full bg-border" />
          ) : null}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
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
  moveTradeOrderToRecycleBinAction,
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
  moveTradeOrderToRecycleBinAction: (formData: FormData) => Promise<{
    status: "success" | "error";
    message: string;
    recycleStatus?: "created" | "already_in_recycle_bin" | "blocked";
    guard?: TradeOrderRecycleGuard;
    finalizePreview?: RecycleFinalizePreview | null;
  }>;
  createShippingExportBatchAction: (formData: FormData) => Promise<void>;
  updateShippingAction: (formData: FormData) => Promise<void>;
  bulkUpdateShippingAction: (formData: FormData) => Promise<void>;
  regenerateShippingExportBatchFileAction: (
    formData: FormData,
  ) => Promise<void>;
}>) {
  const roleMeta = getRoleMeta(role);
  const accessibleViews = getOrderFulfillmentViewsForRole(role);
  const viewTabs = accessibleViews.map((view) => ({
    value: view,
    label: getOrderFulfillmentViewLabel(view),
    href: buildOrderFulfillmentHref(view),
  }));

  const isTradeOrdersView =
    activeView === "trade-orders" && tradeOrdersData !== null;
  const isShippingView = activeView === "shipping" && shippingData !== null;
  const isBatchesView = activeView === "batches" && batchData !== null;
  const notice =
    tradeOrdersData?.notice ??
    shippingData?.notice ??
    batchData?.notice ??
    null;

  const headerItems = [roleMeta.scope, getOrderFulfillmentViewLabel(activeView)];
  if (isTradeOrdersView) {
    headerItems.push(`焦点 ${getTradeOrdersFocusLabel(tradeOrdersData)}`, "parent-first");
  } else if (isShippingView) {
    headerItems.push(
      shippingData.activeSupplier?.supplier.name ?? "待选择 supplier",
      `阶段 ${shippingData.filters.stageView}`,
    );
  } else if (isBatchesView) {
    headerItems.push(getBatchFileViewLabel(batchData.filters.fileView), "结果 / 审计");
  }

  const summary = isTradeOrdersView ? (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="父单总数"
        value={String(tradeOrdersData.summary.totalCount)}
        note="当前筛选范围内的成交主单"
        density="strip"
        className="rounded-2xl border-border/60 bg-card shadow-sm"
      />
      <MetricCard
        label="待审核"
        value={String(tradeOrdersData.summary.pendingReviewCount)}
        note="等待主管或管理员处理"
        density="strip"
        className="rounded-2xl border-border/60 bg-card shadow-sm"
      />
      <MetricCard
        label="履约异常"
        value={String(tradeOrdersData.summary.focusCounts.exception)}
        note="优先排查报单、物流或状态冲突"
        density="strip"
        className="rounded-2xl border-border/60 bg-card shadow-sm"
      />
      <MetricCard
        label="成交金额"
        value={formatCurrency(tradeOrdersData.summary.totalFinalAmount)}
        note="父单成交金额，子单按 supplier 执行"
        density="strip"
        className="rounded-2xl border-border/60 bg-card shadow-sm"
      />
    </div>
  ) : isShippingView ? (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="当前阶段"
        value={String(getShippingStageCount(shippingData))}
        note="当前 stage 下可继续处理的执行记录"
        density="strip"
      />
      <MetricCard
        label="待报单"
        value={String(shippingData.summary.pendingReportCount)}
        note="尚未冻结导出给供货商的子单"
        density="strip"
      />
      <MetricCard
        label="待填物流"
        value={String(shippingData.summary.pendingTrackingCount)}
        note="已导出但尚未回填物流单号"
        density="strip"
      />
      <MetricCard
        label="异常"
        value={String(shippingData.summary.exceptionCount)}
        note="取消、文件异常或履约状态冲突"
        density="strip"
      />
    </div>
  ) : isBatchesView ? (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="批次数"
        value={String(batchData.pagination.totalCount)}
        note="当前可见范围内的冻结导出批次"
        density="strip"
      />
      <MetricCard
        label="本页冻结行"
        value={String(getBatchCurrentLineCount(batchData))}
        note="当前页 ShippingExportLine 快照行数"
        density="strip"
      />
      <MetricCard
        label="文件就绪"
        value={String(getBatchReadyCount(batchData))}
        note="当前页可直接下载的批次"
        density="strip"
      />
      <MetricCard
        label="待补文件"
        value={String(getBatchPendingCount(batchData))}
        note="待生成或文件缺失的批次"
        density="strip"
      />
    </div>
  ) : undefined;

  const toolbarItems = isTradeOrdersView
    ? [
        `焦点 ${getTradeOrdersFocusLabel(tradeOrdersData)}`,
        `审核 ${tradeOrdersData.filters.statusView || "全部"}`,
        `待审核 ${tradeOrdersData.summary.pendingReviewCount}`,
        canAccessSalesOrderModule(role) ? "parent-first" : "只读总览",
      ]
    : isShippingView
      ? [
          `阶段 ${shippingData.filters.stageView}`,
          shippingData.activeSupplier?.supplier.name ?? "待选择 supplier",
          shippingData.activeBatch
            ? `批次 ${shippingData.activeBatch.exportNo}`
            : "当前未锁定批次",
          canAccessSalesOrderModule(role) ? "保留父单叙事" : "执行视角",
        ]
      : isBatchesView
        ? [
            getBatchFileViewLabel(batchData.filters.fileView),
            `文件就绪 ${getBatchReadyCount(batchData)}`,
            `待补文件 ${getBatchPendingCount(batchData)}`,
            `历史批次 ${getBatchLegacyCount(batchData)}`,
          ]
        : [];

  const toolbar = toolbarItems.length ? (
    <div className="space-y-2">
      <RecordTabs activeValue={activeView} items={viewTabs} />
      <ContextStrip items={toolbarItems} />
    </div>
  ) : undefined;

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="订单履约业务域"
          title="订单中心"
          description={roleMeta.description}
          meta={<ContextStrip items={headerItems} />}
          className="px-4 py-2 md:px-5 md:py-2.5"
          actions={
            <div className="crm-toolbar-cluster">
              {canCreateTradeOrder ? (
                <Link
                  href="/customers"
                  className="inline-flex min-h-0 items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:opacity-90"
                >
                  去客户中心建单
                </Link>
              ) : null}
              {canAccessShippingModule(role) ? (
                <Link
                  href={buildOrderFulfillmentHref("shipping")}
                  className="inline-flex min-h-0 items-center justify-center rounded-lg border border-border/60 bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
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
      {notice ? (
        <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner>
      ) : null}

      {activeView === "trade-orders" && tradeOrdersData ? (
        <TradeOrdersSection
          summary={tradeOrdersData.summary}
          items={tradeOrdersData.items}
          filters={tradeOrdersData.filters}
          suppliers={tradeOrdersData.suppliers}
          salesOptions={tradeOrdersData.salesOptions}
          pagination={tradeOrdersData.pagination}
          canCreate={canCreateTradeOrder}
          canReview={canReviewTradeOrder}
          reviewAction={reviewTradeOrderAction}
          moveToRecycleBinAction={moveTradeOrderToRecycleBinAction}
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
          backLabel={
            canAccessShippingModule(role) ? "返回发货执行" : "返回交易单"
          }
        />
      ) : null}
    </WorkbenchLayout>
  );
}
