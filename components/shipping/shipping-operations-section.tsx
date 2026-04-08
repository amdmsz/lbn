import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { RecordTabs } from "@/components/shared/record-tabs";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { LogisticsTracePanel } from "@/components/shipping/logistics-trace-panel";
import { ShippingQuickFillDrawer } from "@/components/shipping/shipping-quick-fill-drawer";
import { ShippingSelectionToolbar } from "@/components/shipping/shipping-selection-toolbar";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  codCollectionStatusOptions,
  formatCurrency,
  getCodCollectionStatusLabel,
  getCodCollectionStatusVariant,
  getSalesOrderPaymentSchemeLabel,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
  getShippingReportStatusVariant,
  shippingFulfillmentStatusOptions,
} from "@/lib/fulfillment/metadata";
import { COMMON_LOGISTICS_PROVIDERS } from "@/lib/logistics/metadata";
import { buildShippingExportBatchDownloadHref } from "@/lib/shipping/download";
import type {
  ShippingOperationsFilters,
  ShippingOperationsItem,
  ShippingPendingBatchSummary,
  ShippingStageView,
  ShippingSupplierSummary,
} from "@/lib/shipping/queries";
import { cn } from "@/lib/utils";

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type SummaryData = {
  totalCount: number;
  pendingReportCount: number;
  pendingTrackingCount: number;
  shippedCount: number;
  exceptionCount: number;
  supplierCount: number;
};

type StageItem = {
  value: ShippingStageView;
  label: string;
  description: string;
};

const PRIMARY_STAGE_ITEMS: StageItem[] = [
  {
    value: "PENDING_REPORT",
    label: "当前报单",
    description: "先选供应商，再勾选当前可报单订单并导出。",
  },
  {
    value: "PENDING_TRACKING",
    label: "待填物流",
    description: "承接已导出订单，按批次回填物流并支持再次导出。",
  },
  {
    value: "SHIPPED",
    label: "已发货 / 回款关注",
    description: "收口发货后的签收、COD 与回款关注。",
  },
];

function getStageCount(summary: SummaryData, stageView: ShippingStageView) {
  switch (stageView) {
    case "PENDING_TRACKING":
      return summary.pendingTrackingCount;
    case "SHIPPED":
      return summary.shippedCount;
    case "EXCEPTION":
      return summary.exceptionCount;
    case "PENDING_REPORT":
    default:
      return summary.pendingReportCount;
  }
}

function buildPageHref(
  filters: ShippingOperationsFilters,
  overrides: Partial<ShippingOperationsFilters> = {},
  basePath = "/shipping",
  baseSearchParams?: Record<string, string>,
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams(baseSearchParams);

  params.delete("supplierId");
  params.delete("reportStatus");
  params.delete("shippingStatus");
  params.delete("shippingStage");
  params.delete("hasTrackingNumber");

  if (next.keyword) params.set("keyword", next.keyword);
  else params.delete("keyword");

  if (next.supplierKeyword) params.set("supplierKeyword", next.supplierKeyword);
  else params.delete("supplierKeyword");

  if (next.supplierViewId) params.set("supplierViewId", next.supplierViewId);
  else params.delete("supplierViewId");

  if (next.batchViewId && next.stageView === "PENDING_TRACKING") {
    params.set("batchViewId", next.batchViewId);
  } else {
    params.delete("batchViewId");
  }

  params.set("stageView", next.stageView);

  if (next.isCod) params.set("isCod", next.isCod);
  else params.delete("isCod");

  if (next.page > 1) params.set("page", String(next.page));
  else params.delete("page");

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function getLatestCodRecord(item: ShippingOperationsItem) {
  return item.codCollectionRecords[0] ?? null;
}

function getExecutionIdentity(item: ShippingOperationsItem) {
  const tradeNo = item.tradeOrder?.tradeNo ?? item.salesOrder?.tradeOrder?.tradeNo ?? null;
  const subOrderNo = item.salesOrder?.subOrderNo || item.salesOrder?.orderNo || item.id;
  const supplierName = item.supplier?.name || "未绑定供应商";

  return {
    tradeNo,
    subOrderNo,
    supplierName,
  };
}

function getProductSummary(item: ShippingOperationsItem) {
  return (
    item.salesOrder?.items
      .map((orderItem) => `${orderItem.skuNameSnapshot}${orderItem.specSnapshot}`)
      .join(" + ") || "暂无商品行"
  );
}

function getPieceCount(item: ShippingOperationsItem) {
  return item.salesOrder?.items.reduce((total, orderItem) => total + orderItem.qty, 0) ?? 0;
}

function getExceptionLabels(item: ShippingOperationsItem) {
  const labels: string[] = [];
  if (item.shippingStatus === "CANCELED") labels.push("已取消");
  if (!item.tradeOrder?.tradeNo && !item.salesOrder?.tradeOrder?.tradeNo) labels.push("缺少父单锚点");
  if (item.reportStatus === "PENDING" && item.trackingNumber?.trim()) labels.push("未报单先有物流");
  if (item.reportStatus === "REPORTED" && item.exportBatch && !item.exportBatch.fileUrl) labels.push("批次文件缺失");
  return labels;
}

function getBatchStatusMeta(
  batch:
    | ShippingSupplierSummary["currentBatch"]
    | ShippingSupplierSummary["latestHistoryBatch"]
    | ShippingPendingBatchSummary
    | null,
): {
  label: string;
  variant: StatusBadgeVariant;
  note: string;
} | null {
  if (!batch) {
    return null;
  }

  switch (batch.fileState) {
    case "READY":
      return {
        label: "文件可下载",
        variant: "success",
        note: "冻结快照和导出文件都可直接使用。",
      };
    case "MISSING":
      return {
        label: "文件缺失",
        variant: "danger",
        note: "批次快照仍在，导出文件需要重生成。",
      };
    case "PENDING":
      return {
        label: "待生成文件",
        variant: "warning",
        note: "批次已冻结，但导出文件尚未生成。",
      };
    case "LEGACY":
    default:
      return {
        label: "历史兼容批次",
        variant: "neutral",
        note: "该批次仍可回看，但不代表当前待处理池。",
      };
  }
}

function getReviewStatusMeta(
  reviewStatus: NonNullable<ShippingOperationsItem["salesOrder"]>["reviewStatus"] | undefined,
) {
  switch (reviewStatus) {
    case "APPROVED":
      return { label: "已审核", variant: "success" as const };
    case "REJECTED":
      return { label: "已驳回", variant: "danger" as const };
    case "PENDING_REVIEW":
      return { label: "待审核", variant: "warning" as const };
    default:
      return { label: "未审核", variant: "neutral" as const };
  }
}

function getCollectionFocusMeta(item: ShippingOperationsItem) {
  const codRecord = getLatestCodRecord(item);
  const isCod = Number(item.codAmount) > 0;

  if (codRecord) {
    return {
      label: getCodCollectionStatusLabel(codRecord.status),
      variant: getCodCollectionStatusVariant(codRecord.status),
    };
  }

  if (!isCod) {
    return {
      label: "非 COD",
      variant: "neutral" as const,
    };
  }

  return {
    label: "待回款关注",
    variant: "warning" as const,
  };
}

function buildDefaultExportFileName() {
  return `shipping-export-${new Date().toISOString().slice(0, 10)}.csv`;
}

function StageWorkspaceHeader({
  title,
  description,
  badges,
  actions,
}: Readonly<{
  title: string;
  description: string;
  badges: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">{badges}</div>
        <div>
          <h3 className="text-xl font-semibold text-black/84">{title}</h3>
          <p className="mt-1 text-sm leading-7 text-black/58">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function CurrentReportWorkspace({
  activeSupplier,
  items,
  filters,
  pagination,
  createExportBatchAction,
  exportBatchesHref,
  basePath,
  baseSearchParams,
}: Readonly<{
  activeSupplier: ShippingSupplierSummary | null;
  items: ShippingOperationsItem[];
  filters: ShippingOperationsFilters;
  pagination: PaginationData;
  createExportBatchAction: (formData: FormData) => Promise<void>;
  exportBatchesHref: string;
  basePath: string;
  baseSearchParams?: Record<string, string>;
}>) {
  if (!activeSupplier) {
    return (
      <EmptyState
        title="当前报单池暂无供应商"
        description="先通过上方供应商筛选切到一个可报单的供应商。"
      />
    );
  }

  const currentHref = buildPageHref(filters, { page: pagination.page }, basePath, baseSearchParams);
  const pendingTrackingHref = buildPageHref(
    filters,
    {
      stageView: "PENDING_TRACKING",
      supplierViewId: activeSupplier.supplier.id,
      batchViewId: "",
      page: 1,
    },
    basePath,
    baseSearchParams,
  );
  const latestHistoryBatchMeta = getBatchStatusMeta(activeSupplier.latestHistoryBatch);
  const pageStart = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <section className="crm-section-card space-y-5">
      <StageWorkspaceHeader
        title={`${activeSupplier.supplier.name} · 当前报单`}
        description="这里是当前可导出的真实待处理池。先勾选当前 supplier 下的订单，再执行本次导出。"
        badges={
          <>
            <StatusBadge label="当前报单" variant="info" />
            <StatusBadge label={`${activeSupplier.stageTaskCount} 单待导出`} variant="success" />
            {activeSupplier.latestHistoryBatch ? (
              <StatusBadge
                label={`最近历史批次 ${activeSupplier.latestHistoryBatch.exportNo}`}
                variant="neutral"
              />
            ) : null}
          </>
        }
        actions={
          <>
            <form action={createExportBatchAction}>
              <input type="hidden" name="supplierId" value={activeSupplier.supplier.id} />
              <input type="hidden" name="fileName" value={buildDefaultExportFileName()} />
              <input type="hidden" name="remark" value="" />
              <input type="hidden" name="sourceStage" value="PENDING_REPORT" />
              <input type="hidden" name="redirectTo" value={pendingTrackingHref} />
              <button type="submit" className="crm-button crm-button-primary">
                导出当前 supplier 全部
              </button>
            </form>
            <Link href={exportBatchesHref} className="crm-button crm-button-secondary">
              查看历史批次
            </Link>
          </>
        }
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
        <div className="rounded-2xl border border-black/8 bg-white/74 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
            当前 supplier 摘要
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-black/62">
            <span>可报单 {activeSupplier.stageTaskCount} 单</span>
            <span>待填物流 {activeSupplier.pendingTrackingCount} 单</span>
            <span>异常 {activeSupplier.exceptionCount} 单</span>
          </div>
        </div>

        <div className="rounded-2xl border border-black/8 bg-white/74 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
            最近导出批次
          </p>
          <div className="mt-3 space-y-2 text-sm text-black/62">
            <div>
              {activeSupplier.latestHistoryBatch
                ? `${activeSupplier.latestHistoryBatch.exportNo} · ${formatDateTime(activeSupplier.latestHistoryBatch.exportedAt)}`
                : "当前 supplier 尚无历史批次"}
            </div>
            <div>{latestHistoryBatchMeta?.note ?? "历史批次只作为冻结记录回看，不代表当前待导出集合。"}</div>
            {activeSupplier.latestHistoryBatch?.canDownload && activeSupplier.latestHistoryBatch.fileUrl ? (
              <a
                href={buildShippingExportBatchDownloadHref(activeSupplier.latestHistoryBatch.id)}
                className="inline-flex text-sm font-medium text-[var(--color-info)] hover:underline"
              >
                下载最近历史批次文件
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="当前 supplier 暂无可报单订单"
          description="试试切换供应商或清空搜索条件。"
        />
      ) : (
        <>
          <form id="current-report-selection-form" className="space-y-3">
            <input type="hidden" name="supplierId" value={activeSupplier.supplier.id} />
            <input type="hidden" name="fileName" value={buildDefaultExportFileName()} />
            <input type="hidden" name="remark" value="" />
            <input type="hidden" name="sourceStage" value="PENDING_REPORT" />
            <input type="hidden" name="redirectTo" value={pendingTrackingHref} />

            <ShippingSelectionToolbar
              formId="current-report-selection-form"
              inputName="selectedShippingTaskId"
              summary={`当前 supplier 本页 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单，默认已勾选当前页。`}
            />

            <div className="overflow-x-auto rounded-2xl border border-black/8 bg-white/80">
              <table className="min-w-full divide-y divide-black/6 text-sm">
                <thead className="bg-[rgba(247,248,250,0.92)] text-left text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                  <tr>
                    <th className="px-4 py-3">选择</th>
                    <th className="px-4 py-3">子单 / 父单</th>
                    <th className="px-4 py-3">收件人</th>
                    <th className="px-4 py-3">电话</th>
                    <th className="px-4 py-3">地址摘要</th>
                    <th className="px-4 py-3">品名 / 件数</th>
                    <th className="px-4 py-3">代收 / 保价</th>
                    <th className="px-4 py-3">审核 / 履约</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/6">
                  {items.map((item) => {
                    const identity = getExecutionIdentity(item);
                    const reviewMeta = getReviewStatusMeta(item.salesOrder?.reviewStatus);

                    return (
                      <tr key={item.id} className="align-top text-black/68">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            name="selectedShippingTaskId"
                            value={item.id}
                            defaultChecked
                            className="mt-1 h-4 w-4 rounded border-black/15"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-black/82">{identity.subOrderNo}</div>
                          <div className="mt-1 text-xs text-black/48">
                            {identity.tradeNo ? `父单 ${identity.tradeNo}` : "缺少父单锚点"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {item.salesOrder?.receiverNameSnapshot || item.customer.name}
                        </td>
                        <td className="px-4 py-3">
                          {item.salesOrder?.receiverPhoneSnapshot || item.customer.phone}
                        </td>
                        <td className="max-w-[18rem] px-4 py-3 text-black/56">
                          <div className="line-clamp-2">
                            {item.salesOrder?.receiverAddressSnapshot || "暂无地址快照"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-[15rem] text-black/64">{getProductSummary(item)}</div>
                          <div className="mt-1 text-xs text-black/48">{getPieceCount(item)} 件</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{formatCurrency(item.codAmount)}</div>
                          <div className="mt-1 text-xs text-black/48">
                            保价 {item.insuranceRequired ? formatCurrency(item.insuranceAmount) : "否"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge label={reviewMeta.label} variant={reviewMeta.variant} />
                            <StatusBadge
                              label={getShippingReportStatusLabel(item.reportStatus)}
                              variant={getShippingReportStatusVariant(item.reportStatus)}
                            />
                            <StatusBadge
                              label={getShippingFulfillmentStatusLabel(item.shippingStatus)}
                              variant={getShippingFulfillmentStatusVariant(item.shippingStatus)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button formAction={createExportBatchAction} className="crm-button crm-button-primary">
                导出当前勾选
              </button>
              <Link href={currentHref} className="crm-button crm-button-secondary">
                保持当前筛选
              </Link>
            </div>
          </form>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`当前 supplier 显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单可报单记录`}
            buildHref={(pageNumber) =>
              buildPageHref(filters, { page: pageNumber }, basePath, baseSearchParams)
            }
          />
        </>
      )}
    </section>
  );
}

function PendingLogisticsWorkspace({
  activeSupplier,
  pendingBatchSummaries,
  activeBatch,
  items,
  activeBatchItems,
  filters,
  pagination,
  createExportBatchAction,
  bulkUpdateShippingAction,
  updateShippingAction,
  regenerateFileAction,
  exportBatchesHref,
  basePath,
  baseSearchParams,
}: Readonly<{
  activeSupplier: ShippingSupplierSummary | null;
  pendingBatchSummaries: ShippingPendingBatchSummary[];
  activeBatch: ShippingPendingBatchSummary | null;
  items: ShippingOperationsItem[];
  activeBatchItems: ShippingOperationsItem[];
  filters: ShippingOperationsFilters;
  pagination: PaginationData;
  createExportBatchAction: (formData: FormData) => Promise<void>;
  bulkUpdateShippingAction: (formData: FormData) => Promise<void>;
  updateShippingAction: (formData: FormData) => Promise<void>;
  regenerateFileAction: (formData: FormData) => Promise<void>;
  exportBatchesHref: string;
  basePath: string;
  baseSearchParams?: Record<string, string>;
}>) {
  if (!activeSupplier) {
    return (
      <EmptyState
        title="待填物流区暂无供应商"
        description="先通过上方供应商筛选切到一个待填物流 supplier。"
      />
    );
  }

  const currentHref = buildPageHref(filters, { page: pagination.page }, basePath, baseSearchParams);
  const activeBatchMeta = getBatchStatusMeta(activeBatch);
  const pageStart = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <section className="crm-section-card space-y-5">
      <StageWorkspaceHeader
        title={`${activeSupplier.supplier.name} · 待填物流`}
        description="这里承接已导出但尚未填写物流的订单。可以按批次切换、逐单回填，也可以对当前批次再次导出。"
        badges={
          <>
            <StatusBadge label="待填物流" variant="info" />
            <StatusBadge label={`${activeSupplier.pendingTrackingCount} 单待回填`} variant="warning" />
            {activeBatch ? (
              <StatusBadge label={`当前批次 ${activeBatch.exportNo}`} variant="success" />
            ) : null}
          </>
        }
        actions={
          <Link href={exportBatchesHref} className="crm-button crm-button-secondary">
            查看历史批次
          </Link>
        }
      />

      {pendingBatchSummaries.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-black/84">批次切换</h4>
              <p className="text-sm text-black/56">按当前 supplier 的待填物流批次切换工作面。</p>
            </div>
            <div className="text-sm text-black/56">共 {pendingBatchSummaries.length} 个待处理批次</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {pendingBatchSummaries.map((batch) => {
              const batchMeta = getBatchStatusMeta(batch);
              const isActive = batch.id === activeBatch?.id;

              return (
                <Link
                  key={batch.id}
                  href={buildPageHref(
                    filters,
                    {
                      supplierViewId: activeSupplier.supplier.id,
                      batchViewId: batch.id,
                      page: 1,
                    },
                    basePath,
                    baseSearchParams,
                  )}
                  className={cn(
                    "rounded-full border border-black/8 bg-white/78 px-3 py-2 text-sm text-black/64 transition hover:border-black/14 hover:bg-white",
                    isActive &&
                      "border-[rgba(20,118,92,0.28)] bg-[rgba(240,251,247,0.95)] text-[var(--color-success)]",
                  )}
                >
                  {batch.exportNo} · {batch.taskCount} 单
                  {batchMeta ? ` · ${batchMeta.label}` : ""}
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-black/8 bg-white/74 px-4 py-3 text-sm text-black/58">
          当前 supplier 暂无可切换的待填物流批次。若有遗留待填物流订单但未挂到批次，请在异常队列核对。
        </div>
      )}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)]">
        <div className="rounded-2xl border border-black/8 bg-white/74 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
            当前批次摘要
          </p>
          <div className="mt-3 space-y-2 text-sm text-black/62">
            <div>当前 supplier：{activeSupplier.supplier.name}</div>
            <div>当前待填物流：{activeSupplier.pendingTrackingCount} 单</div>
            <div>
              当前批次：
              {activeBatch
                ? `${activeBatch.exportNo} · ${formatDateTime(activeBatch.exportedAt)}`
                : "暂无已选批次"}
            </div>
            <div>{activeBatchMeta?.note ?? "待填物流支持再次导出，但请通过明确动作重新生成新的批次文件。"}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/8 bg-white/74 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
            当前批次动作
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeBatch?.canDownload && activeBatch.fileUrl ? (
              <a
                href={buildShippingExportBatchDownloadHref(activeBatch.id)}
                className="crm-button crm-button-secondary"
              >
                下载当前批次文件
              </a>
            ) : null}

            {activeBatch?.canRegenerate ? (
              <form action={regenerateFileAction}>
                <input type="hidden" name="exportBatchId" value={activeBatch.id} />
                <input type="hidden" name="redirectTo" value={currentHref} />
                <button type="submit" className="crm-button crm-button-secondary">
                  {activeBatch.fileState === "READY" ? "重生成当前批次文件" : "生成当前批次文件"}
                </button>
              </form>
            ) : null}

            {activeBatchItems.length > 0 ? (
              <form action={createExportBatchAction}>
                <input type="hidden" name="supplierId" value={activeSupplier.supplier.id} />
                <input type="hidden" name="fileName" value={buildDefaultExportFileName()} />
                <input type="hidden" name="remark" value="" />
                <input type="hidden" name="sourceStage" value="PENDING_TRACKING" />
                <input type="hidden" name="redirectTo" value={currentHref} />
                {activeBatchItems.map((item) => (
                  <input key={item.id} type="hidden" name="shippingTaskId" value={item.id} />
                ))}
                <button type="submit" className="crm-button crm-button-primary">
                  重新导出当前批次
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="当前批次暂无待填物流订单"
          description="试试切换批次、切换 supplier，或去异常队列核对未挂批次的记录。"
        />
      ) : (
        <>
          <form
            id="pending-logistics-form"
            action={bulkUpdateShippingAction}
            className="space-y-3"
          >
            <input type="hidden" name="redirectTo" value={currentHref} />
            <input type="hidden" name="supplierId" value={activeSupplier.supplier.id} />
            <input type="hidden" name="fileName" value={buildDefaultExportFileName()} />
            <input type="hidden" name="remark" value="" />
            <input type="hidden" name="sourceStage" value="PENDING_TRACKING" />

            <ShippingSelectionToolbar
              formId="pending-logistics-form"
              inputName="selectedShippingTaskId"
              summary={`当前批次本页 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单，默认已勾选当前页。`}
            />

            <div className="overflow-x-auto rounded-2xl border border-black/8 bg-white/80">
              <table className="min-w-full divide-y divide-black/6 text-sm">
                <thead className="bg-[rgba(247,248,250,0.92)] text-left text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                  <tr>
                    <th className="px-4 py-3">选择</th>
                    <th className="px-4 py-3">子单</th>
                    <th className="px-4 py-3">收件人 / 电话</th>
                    <th className="px-4 py-3">地址</th>
                    <th className="px-4 py-3">品名 / 件数</th>
                    <th className="px-4 py-3">最近导出批次</th>
                    <th className="px-4 py-3">最近导出时间</th>
                    <th className="px-4 py-3">承运商</th>
                    <th className="px-4 py-3">物流单号</th>
                    <th className="px-4 py-3">动作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/6">
                  {items.map((item) => {
                    const identity = getExecutionIdentity(item);
                    const receiverName = item.salesOrder?.receiverNameSnapshot || item.customer.name;
                    const receiverPhone = item.salesOrder?.receiverPhoneSnapshot || item.customer.phone;
                    const receiverAddress = item.salesOrder?.receiverAddressSnapshot || "暂无地址快照";

                    return (
                      <tr key={item.id} className="align-top text-black/68">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            name="selectedShippingTaskId"
                            value={item.id}
                            defaultChecked
                            className="mt-1 h-4 w-4 rounded border-black/15"
                          />
                          <input type="hidden" name="shippingTaskId" value={item.id} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-black/82">{identity.subOrderNo}</div>
                          <div className="mt-1 text-xs text-black/48">
                            {identity.tradeNo ? `父单 ${identity.tradeNo}` : "缺少父单锚点"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{receiverName}</div>
                          <div className="mt-1 text-xs text-black/48">{receiverPhone}</div>
                        </td>
                        <td className="max-w-[16rem] px-4 py-3 text-black/56">
                          <div className="line-clamp-2">{receiverAddress}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="max-w-[13rem] text-black/64">{getProductSummary(item)}</div>
                          <div className="mt-1 text-xs text-black/48">{getPieceCount(item)} 件</div>
                        </td>
                        <td className="px-4 py-3">{item.exportBatch?.exportNo || "-"}</td>
                        <td className="px-4 py-3">
                          {item.reportedAt ? formatDateTime(item.reportedAt) : "未导出"}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            name="shippingProvider"
                            defaultValue={item.shippingProvider ?? ""}
                            placeholder="承运商"
                            list="shipping-provider-options"
                            className="crm-input min-w-[7.5rem]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            name="trackingNumber"
                            defaultValue={item.trackingNumber ?? ""}
                            placeholder="物流单号"
                            className="crm-input min-w-[9.5rem]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-2">
                            <ShippingQuickFillDrawer
                              shippingTaskId={item.id}
                              supplierName={identity.supplierName}
                              subOrderNo={identity.subOrderNo}
                              receiverName={receiverName}
                              shippingProvider={item.shippingProvider}
                              trackingNumber={item.trackingNumber}
                              redirectTo={currentHref}
                              updateShippingAction={updateShippingAction}
                            />
                            <Link
                              href={`/orders/${item.salesOrder?.id || item.tradeOrder?.id || item.id}`}
                              className="text-sm font-medium text-[var(--color-info)] hover:underline"
                            >
                              查看详情
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button formAction={createExportBatchAction} className="crm-button crm-button-secondary">
                重新导出当前勾选
              </button>
              <button type="submit" className="crm-button crm-button-primary">
                批量回填物流
              </button>
            </div>
          </form>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`当前批次显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单待填物流记录`}
            buildHref={(pageNumber) =>
              buildPageHref(filters, { page: pageNumber }, basePath, baseSearchParams)
            }
          />
        </>
      )}
    </section>
  );
}

function ShippedAndExceptionWorkspace({
  activeSupplier,
  items,
  filters,
  pagination,
  stageView,
  updateShippingAction,
  basePath,
  baseSearchParams,
}: Readonly<{
  activeSupplier: ShippingSupplierSummary | null;
  items: ShippingOperationsItem[];
  filters: ShippingOperationsFilters;
  pagination: PaginationData;
  stageView: "SHIPPED" | "EXCEPTION";
  updateShippingAction: (formData: FormData) => Promise<void>;
  basePath: string;
  baseSearchParams?: Record<string, string>;
}>) {
  const isExceptionStage = stageView === "EXCEPTION";
  const currentHref = buildPageHref(filters, { page: pagination.page }, basePath, baseSearchParams);
  const pageStart = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <section className="crm-section-card space-y-5">
      <StageWorkspaceHeader
        title={
          isExceptionStage
            ? `${activeSupplier?.supplier.name || "当前供应商"} · 履约异常`
            : `${activeSupplier?.supplier.name || "当前供应商"} · 已发货 / 回款关注`
        }
        description={
          isExceptionStage
            ? "异常单独收口，不和主流程混用。优先处理取消、文件缺失、状态冲突等问题。"
            : "这里承接已填写物流并已发货的订单，重点关注签收、COD 与回款状态。"
        }
        badges={
          <>
            <StatusBadge
              label={isExceptionStage ? "履约异常" : "已发货 / 回款关注"}
              variant={isExceptionStage ? "danger" : "success"}
            />
            {activeSupplier ? (
              <StatusBadge label={`${activeSupplier.stageTaskCount} 单`} variant="neutral" />
            ) : null}
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title={isExceptionStage ? "当前 supplier 暂无履约异常" : "当前 supplier 暂无已发货记录"}
          description="试试切换 supplier、切换阶段，或清空搜索条件。"
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => {
              const identity = getExecutionIdentity(item);
              const isCod = Number(item.codAmount) > 0;
              const codRecord = getLatestCodRecord(item);
              const focusMeta = getCollectionFocusMeta(item);
              const exceptionLabels = getExceptionLabels(item);
              const receiverName = item.salesOrder?.receiverNameSnapshot || item.customer.name;

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-2xl border border-black/8 bg-white/80 p-4",
                    isExceptionStage &&
                      "border-[rgba(177,63,45,0.18)] bg-[linear-gradient(180deg,rgba(255,246,244,0.96),rgba(255,255,255,0.96))]",
                  )}
                >
                  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_auto]">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={getShippingFulfillmentStatusLabel(item.shippingStatus)}
                          variant={getShippingFulfillmentStatusVariant(item.shippingStatus)}
                        />
                        <StatusBadge label={focusMeta.label} variant={focusMeta.variant} />
                        <StatusBadge label={isCod ? "COD" : "非 COD"} variant={isCod ? "warning" : "neutral"} />
                        {exceptionLabels.map((label) => (
                          <StatusBadge key={label} label={label} variant="danger" />
                        ))}
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.12em] text-black/45">
                          {identity.tradeNo ? `父单 ${identity.tradeNo}` : "缺少父单锚点"}
                        </div>
                        <h4 className="mt-1 text-lg font-semibold text-black/84">{identity.subOrderNo}</h4>
                        <div className="mt-1 text-sm text-black/62">{receiverName}</div>
                      </div>
                      <div className="grid gap-3 text-sm text-black/62 md:grid-cols-3">
                        <div>承运商：{item.shippingProvider || "未填写"}</div>
                        <div>物流单号：{item.trackingNumber || "未填写"}</div>
                        <div>发货时间：{item.shippedAt ? formatDateTime(item.shippedAt) : "未发货"}</div>
                        <div>代收金额：{formatCurrency(item.codAmount)}</div>
                        <div>当前回款关注：{focusMeta.label}</div>
                        <div>
                          支付方案：
                          {item.salesOrder
                            ? getSalesOrderPaymentSchemeLabel(item.salesOrder.paymentScheme)
                            : "未知"}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <LogisticsTracePanel
                        shippingTaskId={item.id}
                        shippingProvider={item.shippingProvider}
                        trackingNumber={item.trackingNumber}
                        title="查看物流轨迹"
                      />
                      <Link
                        href={`/orders/${item.salesOrder?.id || item.tradeOrder?.id || item.id}`}
                        className="crm-button crm-button-secondary w-full justify-center"
                      >
                        查看详情
                      </Link>
                    </div>

                    <details className="rounded-2xl border border-black/8 bg-[rgba(247,248,250,0.82)] p-4">
                      <summary className="cursor-pointer text-sm font-medium text-black/74">
                        更多更新
                      </summary>
                      <form action={updateShippingAction} className="mt-4 space-y-3">
                        <input type="hidden" name="shippingTaskId" value={item.id} />
                        <input type="hidden" name="redirectTo" value={currentHref} />

                        <label className="space-y-2">
                          <span className="crm-label">承运商</span>
                          <input
                            name="shippingProvider"
                            defaultValue={item.shippingProvider ?? ""}
                            list="shipping-provider-options"
                            className="crm-input"
                          />
                        </label>

                        <label className="space-y-2">
                          <span className="crm-label">物流单号</span>
                          <input
                            name="trackingNumber"
                            defaultValue={item.trackingNumber ?? ""}
                            className="crm-input"
                          />
                        </label>

                        <label className="space-y-2">
                          <span className="crm-label">发货状态</span>
                          <select
                            name="shippingStatus"
                            defaultValue={item.shippingStatus}
                            className="crm-select"
                          >
                            {shippingFulfillmentStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        {isCod ? (
                          <div className="grid gap-3">
                            <label className="space-y-2">
                              <span className="crm-label">COD 回款状态</span>
                              <select
                                name="codCollectionStatus"
                                defaultValue={codRecord?.status ?? ""}
                                className="crm-select"
                              >
                                <option value="">不更新</option>
                                {codCollectionStatusOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-2">
                              <span className="crm-label">COD 回款金额</span>
                              <input
                                name="codCollectedAmount"
                                type="number"
                                step="0.01"
                                min="0"
                                defaultValue={codRecord?.collectedAmount ?? item.codAmount}
                                className="crm-input"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="crm-label">COD 备注</span>
                              <input
                                name="codRemark"
                                defaultValue={codRecord?.remark ?? ""}
                                className="crm-input"
                              />
                            </label>
                          </div>
                        ) : (
                          <>
                            <input type="hidden" name="codCollectionStatus" value="" />
                            <input type="hidden" name="codCollectedAmount" value="" />
                            <input type="hidden" name="codRemark" value="" />
                          </>
                        )}

                        <button type="submit" className="crm-button crm-button-primary w-full justify-center">
                          保存更新
                        </button>
                      </form>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`当前阶段显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单`}
            buildHref={(pageNumber) =>
              buildPageHref(filters, { page: pageNumber }, basePath, baseSearchParams)
            }
          />
        </>
      )}
    </section>
  );
}

export function ShippingOperationsSection({
  summary,
  supplierSummaries,
  activeSupplier,
  pendingBatchSummaries,
  activeBatch,
  items,
  activeBatchItems,
  filters,
  pagination,
  canManageReporting,
  createExportBatchAction,
  updateShippingAction,
  bulkUpdateShippingAction,
  regenerateFileAction,
  basePath = "/shipping",
  baseSearchParams,
  exportBatchesHref = "/shipping/export-batches",
}: Readonly<{
  summary: SummaryData;
  supplierSummaries: ShippingSupplierSummary[];
  activeSupplier: ShippingSupplierSummary | null;
  pendingBatchSummaries: ShippingPendingBatchSummary[];
  activeBatch: ShippingPendingBatchSummary | null;
  items: ShippingOperationsItem[];
  activeBatchItems: ShippingOperationsItem[];
  filters: ShippingOperationsFilters;
  pagination: PaginationData;
  canManageReporting: boolean;
  createExportBatchAction: (formData: FormData) => Promise<void>;
  updateShippingAction: (formData: FormData) => Promise<void>;
  bulkUpdateShippingAction: (formData: FormData) => Promise<void>;
  regenerateFileAction: (formData: FormData) => Promise<void>;
  basePath?: string;
  baseSearchParams?: Record<string, string>;
  exportBatchesHref?: string;
}>) {
  void canManageReporting;

  const currentStageCount = getStageCount(summary, filters.stageView);
  const stageTabsValue = PRIMARY_STAGE_ITEMS.some((item) => item.value === filters.stageView)
    ? filters.stageView
    : "";
  const pageBaseHref = buildPageHref(filters, { page: 1 }, basePath, baseSearchParams);

  return (
    <div className="space-y-6">
      <datalist id="shipping-provider-options">
        {COMMON_LOGISTICS_PROVIDERS.map((provider) => (
          <option key={provider.code} value={provider.label} />
        ))}
      </datalist>

      <section className="crm-filter-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label="发货执行工作台" variant="info" />
              {filters.stageView === "EXCEPTION" ? (
                <StatusBadge label="当前在辅助异常视图" variant="danger" />
              ) : (
                <StatusBadge label={`当前阶段 ${currentStageCount} 单`} variant="success" />
              )}
            </div>
            <h3 className="text-lg font-semibold text-black/85">发货执行工作台</h3>
            <p className="text-sm leading-7 text-black/58">
              把当前报单、待填物流、已发货 / 回款关注拆开处理；历史批次只作为冻结记录回看。
            </p>
          </div>

          <Link href={exportBatchesHref} className="crm-button crm-button-secondary">
            历史批次记录
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-black/8 bg-white/72 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">当前阶段总量</div>
            <div className="mt-2 text-2xl font-semibold text-black/84">{currentStageCount}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">当前 supplier 数</div>
            <div className="mt-2 text-2xl font-semibold text-black/84">{summary.supplierCount}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">当前待填物流数</div>
            <div className="mt-2 text-2xl font-semibold text-black/84">{summary.pendingTrackingCount}</div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/72 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">当前异常数</div>
            <div className="mt-2 text-2xl font-semibold text-black/84">{summary.exceptionCount}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <RecordTabs
            activeValue={stageTabsValue}
            items={PRIMARY_STAGE_ITEMS.map((item) => ({
              value: item.value,
              label: item.label,
              href: buildPageHref(
                filters,
                {
                  stageView: item.value,
                  batchViewId: "",
                  page: 1,
                },
                basePath,
                baseSearchParams,
              ),
              count: getStageCount(summary, item.value),
            }))}
          />

          <Link
            href={buildPageHref(
              filters,
              {
                stageView: "EXCEPTION",
                batchViewId: "",
                page: 1,
              },
              basePath,
              baseSearchParams,
            )}
            className={cn(
              "rounded-full border border-black/8 bg-white/80 px-3 py-2 text-sm font-medium text-black/62 transition hover:border-black/14 hover:bg-white",
              filters.stageView === "EXCEPTION" &&
                "border-[rgba(177,63,45,0.2)] bg-[rgba(255,245,244,0.95)] text-[var(--color-danger)]",
            )}
          >
            履约异常 · {summary.exceptionCount}
          </Link>
        </div>

        <form
          method="get"
          className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.45fr)_auto]"
        >
          {Object.entries(baseSearchParams ?? {}).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="stageView" value={filters.stageView} />
          <input type="hidden" name="supplierViewId" value={filters.supplierViewId} />
          {filters.stageView === "PENDING_TRACKING" && filters.batchViewId ? (
            <input type="hidden" name="batchViewId" value={filters.batchViewId} />
          ) : null}
          {filters.isCod ? <input type="hidden" name="isCod" value={filters.isCod} /> : null}

          <label className="space-y-2">
            <span className="crm-label">供应商筛选</span>
            <input
              name="supplierKeyword"
              defaultValue={filters.supplierKeyword}
              className="crm-input"
              placeholder="输入 supplier 名称"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">订单搜索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className="crm-input"
              placeholder="tradeNo / subOrderNo / 收件人 / 电话 / 物流单号"
            />
          </label>

          <div className="crm-filter-actions md:col-span-2 2xl:col-span-1">
            <button type="submit" className="crm-button crm-button-primary">
              应用筛选
            </button>
            <Link
              href={buildPageHref(
                {
                  ...filters,
                  keyword: "",
                  supplierKeyword: "",
                  page: 1,
                },
                {
                  keyword: "",
                  supplierKeyword: "",
                  page: 1,
                },
                basePath,
                baseSearchParams,
              )}
              className="crm-button crm-button-secondary"
            >
              重置
            </Link>
          </div>
        </form>
      </section>

      {supplierSummaries.length === 0 ? (
        <EmptyState
          title="当前阶段没有可处理的供应商"
          description="试试切换主阶段，或清空供应商 / 订单搜索条件。"
          action={
            <Link href={pageBaseHref} className="crm-button crm-button-primary">
              回到当前工作面
            </Link>
          }
        />
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-black/84">供应商筛选区</h3>
                <p className="text-sm text-black/56">
                  供应商是当前工作池的组织轴。先切 supplier，再进入对应阶段动作。
                </p>
              </div>
              <div className="text-sm text-black/56">
                当前阶段可见 {supplierSummaries.length} 个 supplier
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              {supplierSummaries.map((supplierSummary) => {
                const isActive = supplierSummary.supplier.id === activeSupplier?.supplier.id;
                const currentBatchMeta = getBatchStatusMeta(supplierSummary.currentBatch);

                return (
                  <Link
                    key={supplierSummary.supplier.id}
                    href={buildPageHref(
                      filters,
                      {
                        supplierViewId: supplierSummary.supplier.id,
                        batchViewId: "",
                        page: 1,
                      },
                      basePath,
                      baseSearchParams,
                    )}
                    className={cn(
                      "rounded-2xl border border-black/8 bg-white/74 p-4 transition hover:border-black/14 hover:bg-white",
                      isActive &&
                        "border-[rgba(20,118,92,0.28)] bg-[linear-gradient(180deg,rgba(240,251,247,0.96),rgba(255,255,255,0.96))]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-black/82">{supplierSummary.supplier.name}</div>
                        <div className="mt-1 text-xs text-black/46">
                          当前阶段 {supplierSummary.stageTaskCount} 单
                        </div>
                      </div>
                      {isActive ? <StatusBadge label="当前 supplier" variant="success" /> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {supplierSummary.pendingTrackingCount > 0 ? (
                        <StatusBadge
                          label={`待填物流 ${supplierSummary.pendingTrackingCount}`}
                          variant="warning"
                        />
                      ) : null}
                      {supplierSummary.exceptionCount > 0 ? (
                        <StatusBadge label={`异常 ${supplierSummary.exceptionCount}`} variant="danger" />
                      ) : null}
                      {currentBatchMeta && supplierSummary.currentBatch ? (
                        <StatusBadge
                          label={`当前批次 ${supplierSummary.currentBatch.exportNo}`}
                          variant={currentBatchMeta.variant}
                        />
                      ) : null}
                    </div>

                    <div className="mt-3 text-xs text-black/46">
                      历史最近批次：
                      {supplierSummary.latestHistoryBatch
                        ? `${supplierSummary.latestHistoryBatch.exportNo} · ${formatDateTime(
                            supplierSummary.latestHistoryBatch.exportedAt,
                          )}`
                        : "暂无"}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {filters.stageView === "PENDING_REPORT" ? (
            <CurrentReportWorkspace
              activeSupplier={activeSupplier}
              items={items}
              filters={filters}
              pagination={pagination}
              createExportBatchAction={createExportBatchAction}
              exportBatchesHref={exportBatchesHref}
              basePath={basePath}
              baseSearchParams={baseSearchParams}
            />
          ) : filters.stageView === "PENDING_TRACKING" ? (
            <PendingLogisticsWorkspace
              activeSupplier={activeSupplier}
              pendingBatchSummaries={pendingBatchSummaries}
              activeBatch={activeBatch}
              items={items}
              activeBatchItems={activeBatchItems}
              filters={filters}
              pagination={pagination}
              createExportBatchAction={createExportBatchAction}
              bulkUpdateShippingAction={bulkUpdateShippingAction}
              updateShippingAction={updateShippingAction}
              regenerateFileAction={regenerateFileAction}
              exportBatchesHref={exportBatchesHref}
              basePath={basePath}
              baseSearchParams={baseSearchParams}
            />
          ) : (
            <ShippedAndExceptionWorkspace
              activeSupplier={activeSupplier}
              items={items}
              filters={filters}
              pagination={pagination}
              stageView={filters.stageView === "EXCEPTION" ? "EXCEPTION" : "SHIPPED"}
              updateShippingAction={updateShippingAction}
              basePath={basePath}
              baseSearchParams={baseSearchParams}
            />
          )}
        </>
      )}
    </div>
  );
}
