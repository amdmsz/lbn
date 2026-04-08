import Link from "next/link";
import type { RoleCode } from "@prisma/client";
import { WorkbenchLayout } from "@/components/layout-patterns/workbench-layout";
import { ActionBanner } from "@/components/shared/action-banner";
import { RecordTabs } from "@/components/shared/record-tabs";
import { PageHeader } from "@/components/shared/page-header";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { PageToolbar } from "@/components/shared/page-toolbar";
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
        scope: "发货视图默认入口",
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
        note: "待主管或管理员审核",
        href: buildOrderFulfillmentHref("trade-orders", { statusView: "PENDING_REVIEW" }),
        emphasis: "warning",
      },
      {
        label: "已审核",
        value: String(tradeOrdersData.summary.approvedCount),
        note: "已进入执行层",
        href: buildOrderFulfillmentHref("trade-orders", { statusView: "APPROVED" }),
        emphasis: "success",
      },
      {
        label: "待回收金额",
        value: formatCurrency(tradeOrdersData.summary.totalRemainingAmount),
        note: "支付与催收仍在执行页继续推进",
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
        note: "还未冻结并导出给 supplier",
        href: buildOrderFulfillmentHref("shipping", { stageView: "PENDING_REPORT" }),
        emphasis: "warning",
      },
      {
        label: "待回物流",
        value: String(shippingData.summary.pendingTrackingCount),
        note: "已报单但还没回填物流单号",
        href: buildOrderFulfillmentHref("shipping", { stageView: "PENDING_TRACKING" }),
        emphasis: "info",
      },
      {
        label: "已发货",
        value: String(shippingData.summary.shippedCount),
        note: "已进入发货后跟进",
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
    const currentLineCount = batchData.items.reduce(
      (sum, item) => sum + item._count.lines,
      0,
    );
    const generatedCount = batchData.items.filter((item) => item.fileState === "READY").length;
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
        value: String(generatedCount),
        note: "当前页可直接下载的批次",
        emphasis: "success",
      },
      {
        label: "待重生成",
        value: String(pendingGenerationCount),
        note: "已冻结快照但文件未生成",
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
  const summaryItems = getSummaryItems(
    activeView,
    tradeOrdersData,
    shippingData,
    batchData,
  );
  const notice =
    tradeOrdersData?.notice ?? shippingData?.notice ?? batchData?.notice ?? null;

  return (
    <WorkbenchLayout
      header={
        <PageHeader
          eyebrow="订单中心业务域"
          title="订单中心"
          description={roleMeta.description}
          meta={
            <>
              <StatusBadge label={roleMeta.scope} variant="info" />
              <StatusBadge
                label={`当前视图 ${getOrderFulfillmentViewLabel(activeView)}`}
                variant="success"
              />
              <StatusBadge label="旧路由兼容中" variant="neutral" />
            </>
          }
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
                  切换到发货执行
                </Link>
              ) : null}
            </div>
          }
        />
      }
      summary={
        summaryItems.length > 0 ? <PageSummaryStrip items={summaryItems} /> : undefined
      }
      toolbar={
        <PageToolbar
          eyebrow={viewMeta.eyebrow}
          title={viewMeta.title}
          description={viewMeta.description}
          secondary={
            <>
              <StatusBadge label={`可见视图 ${accessibleViews.length}`} variant="neutral" />
              <StatusBadge
                label={canAccessSalesOrderModule(role) ? "保留父单叙事" : "仅执行视图"}
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
      }
    >
      {notice ? <ActionBanner tone={notice.tone}>{notice.message}</ActionBanner> : null}

      {activeView === "trade-orders" && tradeOrdersData ? (
        <SectionCard
          eyebrow="交易单"
          title="TradeOrder 父单总览"
          description="回看父单、审核与拆单。"
        >
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
        </SectionCard>
      ) : null}

      {activeView === "shipping" && shippingData ? (
        <SectionCard
          eyebrow="发货执行"
          title="SalesOrder + ShippingTask 执行视图"
          description="按阶段和 supplier 推进。"
        >
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
        </SectionCard>
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
