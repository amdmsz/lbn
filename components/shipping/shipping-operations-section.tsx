import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { RecordTabs } from "@/components/shared/record-tabs";
import { StatusBadge } from "@/components/shared/status-badge";
import { LogisticsTracePanel } from "@/components/shipping/logistics-trace-panel";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  codCollectionStatusOptions,
  formatCurrency,
  getCodCollectionStatusLabel,
  getCodCollectionStatusVariant,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderPaymentSchemeVariant,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
  getShippingReportStatusVariant,
  shippingFulfillmentStatusOptions,
} from "@/lib/fulfillment/metadata";
import {
  COMMON_LOGISTICS_PROVIDERS,
  getShippingLogisticsStatusMeta,
  getShippingLogisticsSummaryText,
} from "@/lib/logistics/metadata";
import type {
  ShippingOperationsFilters,
  ShippingOperationsItem,
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

const stageItems: Array<{
  value: ShippingStageView;
  label: string;
  description: string;
}> = [
  { value: "PENDING_REPORT", label: "待报单", description: "当前阶段只看还未冻结导出给 supplier 的子单池。" },
  { value: "PENDING_TRACKING", label: "已报单待物流", description: "这些子单已经报给 supplier，但还需要回填物流单号才能进入已发货。" },
  { value: "SHIPPED", label: "已发货", description: "当前阶段聚焦已回填物流并进入发货后的 supplier 子单。" },
  { value: "EXCEPTION", label: "履约异常", description: "聚合取消、先有物流后未报单、批次文件缺失等需要人工处理的异常。" },
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

function getStageMeta(stageView: ShippingStageView) {
  return stageItems.find((item) => item.value === stageView) ?? stageItems[0];
}

function buildPageHref(
  filters: ShippingOperationsFilters,
  overrides: Partial<{
    keyword: string;
    supplierViewId: string;
    stageView: ShippingStageView;
    page: number;
  }> = {},
  basePath = "/shipping",
  baseSearchParams?: Record<string, string>,
) {
  const params = new URLSearchParams(baseSearchParams);
  const keyword = overrides.keyword ?? filters.keyword;
  const supplierViewId = overrides.supplierViewId ?? filters.supplierViewId;
  const stageView = overrides.stageView ?? filters.stageView;
  const page = overrides.page ?? filters.page;

  params.delete("supplierId");
  params.delete("reportStatus");
  params.delete("shippingStatus");
  params.delete("shippingStage");
  params.delete("hasTrackingNumber");

  if (keyword) params.set("keyword", keyword);
  else params.delete("keyword");

  if (supplierViewId) params.set("supplierViewId", supplierViewId);
  else params.delete("supplierViewId");

  params.set("stageView", stageView);

  if (filters.isCod) params.set("isCod", filters.isCod);
  else params.delete("isCod");

  if (page > 1) params.set("page", String(page));
  else params.delete("page");

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function getLatestCodRecord(item: ShippingOperationsItem) {
  return item.codCollectionRecords[0] ?? null;
}

function getExecutionIdentity(item: ShippingOperationsItem) {
  const tradeNo = item.tradeOrder?.tradeNo ?? null;
  const subOrderNo = item.salesOrder?.subOrderNo || item.salesOrder?.orderNo || item.id;
  const supplierName = item.supplier?.name || "未绑定供货商";

  return {
    tradeNo,
    subOrderNo,
    supplierName,
    displayNo: tradeNo ? `${tradeNo} / ${subOrderNo}` : subOrderNo,
  };
}

function getProductSummary(item: ShippingOperationsItem) {
  return item.salesOrder?.items.map((orderItem) => `${orderItem.productNameSnapshot} x ${orderItem.qty}`).join("，") || "暂无商品行";
}

function getPieceCount(item: ShippingOperationsItem) {
  return item.salesOrder?.items.reduce((total, orderItem) => total + orderItem.qty, 0) ?? 0;
}

function getExceptionLabels(item: ShippingOperationsItem) {
  const labels: string[] = [];
  if (item.shippingStatus === "CANCELED") labels.push("已取消");
  if (item.reportStatus === "PENDING" && item.trackingNumber?.trim()) labels.push("未报单先有物流");
  if (item.reportStatus === "REPORTED" && item.exportBatch && !item.exportBatch.fileUrl) labels.push("批次文件缺失");
  return labels;
}

function buildDefaultExportFileName() {
  return `shipping-export-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function ShippingOperationsSection({
  summary,
  supplierSummaries,
  activeSupplier,
  items,
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
  items: ShippingOperationsItem[];
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
  const currentStage = getStageMeta(filters.stageView);
  const currentHref = buildPageHref(filters, { page: pagination.page }, basePath, baseSearchParams);
  const pageStart = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

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
            <h3 className="text-lg font-semibold text-black/85">按 supplier 推进发货执行</h3>
            <p className="text-sm leading-7 text-black/60">
              发货执行不再按平铺任务理解，而是先看当前阶段有哪些 supplier 正在排队，再进入当前 supplier 的子单池继续报单、回填物流和查看结果。
            </p>
          </div>
          <Link href={exportBatchesHref} className="crm-button crm-button-secondary">
            查看批次记录
          </Link>
        </div>

        <RecordTabs
          activeValue={filters.stageView}
          items={stageItems.map((item) => ({
            value: item.value,
            label: item.label,
            href: buildPageHref(
              filters,
              {
                stageView: item.value,
                page: 1,
              },
              basePath,
              baseSearchParams,
            ),
            count: getStageCount(summary, item.value),
          }))}
        />

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.8fr))]">
          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              当前阶段
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge label={currentStage.label} variant="info" />
              <StatusBadge label={`supplier ${summary.supplierCount}`} variant="neutral" />
            </div>
            <p className="mt-3 text-sm leading-7 text-black/62">{currentStage.description}</p>
          </div>

          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              当前阶段子单
            </p>
            <div className="mt-2 text-2xl font-semibold text-black/85">
              {getStageCount(summary, filters.stageView)}
            </div>
            <p className="mt-1 text-sm text-black/55">只统计当前关键词范围内的 supplier 子单池。</p>
          </div>

          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              所有执行子单
            </p>
            <div className="mt-2 text-2xl font-semibold text-black/85">{summary.totalCount}</div>
            <p className="mt-1 text-sm text-black/55">用于判断当前发货执行总盘子，不改变子单粒度真相。</p>
          </div>

          <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
              当前异常
            </p>
            <div className="mt-2 text-2xl font-semibold text-black/85">{summary.exceptionCount}</div>
            <p className="mt-1 text-sm text-black/55">优先收口批次文件缺失、取消和异常状态混乱的子单。</p>
          </div>
        </div>

        <form method="get" className="crm-filter-grid xl:grid-cols-[minmax(0,1.6fr)_auto]">
          {Object.entries(baseSearchParams ?? {}).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="stageView" value={filters.stageView} />
          <input type="hidden" name="supplierViewId" value={filters.supplierViewId} />
          {filters.isCod ? <input type="hidden" name="isCod" value={filters.isCod} /> : null}
          <label className="space-y-2">
            <span className="crm-label">快速搜索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              autoFocus
              className="crm-input text-base"
              placeholder="tradeNo / subOrderNo / 客户 / 收件人 / 物流单号"
            />
          </label>
          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              搜索
            </button>
            <Link
              href={buildPageHref(
                { ...filters, keyword: "", page: 1 },
                { keyword: "", page: 1 },
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
          title="当前阶段没有可处理 supplier"
          description="当前阶段和搜索条件下，没有命中的 supplier 子单池。可以切换阶段或调整关键词继续查看。"
        />
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-black/85">supplier 汇总条</h3>
                <p className="text-sm text-black/55">
                  先选 supplier，再进入当前 supplier 的阶段工作池继续推进。
                </p>
              </div>
              <div className="text-sm text-black/55">
                当前阶段共 {supplierSummaries.length} 个 supplier
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              {supplierSummaries.map((supplierSummary) => {
                const isActive = supplierSummary.supplier.id === activeSupplier?.supplier.id;

                return (
                  <Link
                    key={supplierSummary.supplier.id}
                    href={buildPageHref(
                      filters,
                      {
                        supplierViewId: supplierSummary.supplier.id,
                        page: 1,
                      },
                      basePath,
                      baseSearchParams,
                    )}
                    className={cn(
                      "rounded-2xl border border-black/8 bg-white/74 p-4 transition hover:border-black/16 hover:bg-white",
                      isActive &&
                        "border-[rgba(20,118,92,0.28)] bg-[linear-gradient(180deg,rgba(240,251,247,0.96),rgba(255,255,255,0.96))]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-black/82">{supplierSummary.supplier.name}</div>
                        <div className="mt-1 text-xs text-black/45">
                          当前阶段 {supplierSummary.stageTaskCount} 个子单
                        </div>
                      </div>
                      {isActive ? <StatusBadge label="当前池" variant="success" /> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {supplierSummary.hasException ? (
                        <StatusBadge label={`异常 ${supplierSummary.exceptionCount}`} variant="danger" />
                      ) : null}
                      {supplierSummary.hasPendingTracking ? (
                        <StatusBadge
                          label={`待回物流 ${supplierSummary.pendingTrackingCount}`}
                          variant="warning"
                        />
                      ) : null}
                      {supplierSummary.hasFileIssue ? (
                        <StatusBadge label="文件待重生" variant="warning" />
                      ) : null}
                      {!supplierSummary.hasException &&
                      !supplierSummary.hasPendingTracking &&
                      !supplierSummary.hasFileIssue ? (
                        <StatusBadge label="状态稳定" variant="neutral" />
                      ) : null}
                    </div>

                    <div className="mt-3 text-xs text-black/45">
                      最近批次：
                      {supplierSummary.latestBatch
                        ? `${supplierSummary.latestBatch.exportNo} · ${formatDateTime(
                            supplierSummary.latestBatch.exportedAt,
                          )}`
                        : "尚无报单批次"}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {activeSupplier ? (
            <section className="crm-section-card space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={currentStage.label} variant="info" />
                    <StatusBadge
                      label={`当前池 ${activeSupplier.stageTaskCount} 单`}
                      variant="success"
                    />
                    {activeSupplier.hasException ? (
                      <StatusBadge
                        label={`异常 ${activeSupplier.exceptionCount}`}
                        variant="danger"
                      />
                    ) : null}
                    {activeSupplier.hasPendingTracking ? (
                      <StatusBadge
                        label={`待回物流 ${activeSupplier.pendingTrackingCount}`}
                        variant="warning"
                      />
                    ) : null}
                    {activeSupplier.hasFileIssue ? (
                      <StatusBadge label="文件待重生" variant="warning" />
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-black/85">
                      {activeSupplier.supplier.name} 发货池
                    </h3>
                    <p className="text-sm leading-7 text-black/60">
                      当前 supplier 下的子单仍然按 SalesOrder + ShippingTask 执行，只是页面主叙事变成“这个 supplier 现在该处理哪些单”。
                    </p>
                  </div>
                </div>

                <div className="space-y-2 text-right text-sm text-black/55">
                  <div>
                    最近批次：
                    {activeSupplier.latestBatch ? activeSupplier.latestBatch.exportNo : "尚无"}
                  </div>
                  <div>
                    最近导出：
                    {activeSupplier.latestBatch
                      ? formatDateTime(activeSupplier.latestBatch.exportedAt)
                      : "暂无"}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                    supplier 级操作区
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {canManageReporting && filters.stageView === "PENDING_REPORT" ? (
                      <form action={createExportBatchAction}>
                        <input type="hidden" name="supplierId" value={activeSupplier.supplier.id} />
                        <input type="hidden" name="fileName" value={buildDefaultExportFileName()} />
                        <input type="hidden" name="remark" value="" />
                        <input type="hidden" name="redirectTo" value={currentHref} />
                        <button type="submit" className="crm-button crm-button-primary">
                          批量生成批次
                        </button>
                      </form>
                    ) : null}

                    {activeSupplier.latestBatch?.fileUrl ? (
                      <a
                        href={activeSupplier.latestBatch.fileUrl}
                        className="crm-button crm-button-secondary"
                      >
                        下载最新文件
                      </a>
                    ) : null}

                    {canManageReporting &&
                    activeSupplier.latestBatch &&
                    !activeSupplier.latestBatch.fileUrl ? (
                      <form action={regenerateFileAction}>
                        <input
                          type="hidden"
                          name="exportBatchId"
                          value={activeSupplier.latestBatch.id}
                        />
                        <input type="hidden" name="redirectTo" value={currentHref} />
                        <button type="submit" className="crm-button crm-button-secondary">
                          重生成最新文件
                        </button>
                      </form>
                    ) : null}

                    <Link href={exportBatchesHref} className="crm-button crm-button-secondary">
                      查看批次记录
                    </Link>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-black/58">
                    批量生成批次只作用于当前 supplier 的待报单池；批量回填物流只作用于当前 supplier 当前页已勾选的子单，不会越过 supplier 上下文。
                  </p>
                </div>

                <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                    当前池说明
                  </p>
                  <div className="mt-3 space-y-2 text-sm leading-7 text-black/60">
                    <div>当前阶段：{currentStage.label}</div>
                    <div>当前 supplier 子单：{activeSupplier.stageTaskCount}</div>
                    <div>已报单待物流：{activeSupplier.pendingTrackingCount}</div>
                    <div>
                      文件状态：
                      {activeSupplier.latestBatch
                        ? activeSupplier.latestBatch.fileUrl
                          ? "最新批次可下载"
                          : "最新批次文件缺失，可重生成"
                        : "尚无批次"}
                    </div>
                  </div>
                </div>
              </div>

              {canManageReporting &&
              filters.stageView === "PENDING_TRACKING" &&
              items.length > 0 ? (
                <div className="rounded-2xl border border-[rgba(155,106,29,0.16)] bg-[linear-gradient(180deg,rgba(255,251,242,0.96),rgba(255,255,255,0.96))] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-semibold text-black/82">批量回填物流</h4>
                      <p className="mt-1 text-sm leading-7 text-black/58">
                        勾选当前页子单后，统一回填承运商和物流单号。提交后这些子单会推进到“已发货”阶段。
                      </p>
                    </div>
                    <StatusBadge label={`本页 ${items.length} 单`} variant="warning" />
                  </div>

                  <form action={bulkUpdateShippingAction} className="mt-4 space-y-3">
                    <input type="hidden" name="redirectTo" value={currentHref} />
                    {items.map((item) => {
                      const identity = getExecutionIdentity(item);

                      return (
                        <div
                          key={item.id}
                          className="grid gap-3 rounded-2xl border border-black/8 bg-white/80 p-4 xl:grid-cols-[auto_minmax(0,1fr)_12rem_16rem]"
                        >
                          <label className="flex items-start gap-2 pt-1 text-sm text-black/65">
                            <input
                              type="checkbox"
                              name="selectedShippingTaskId"
                              value={item.id}
                              defaultChecked
                              className="mt-1 h-4 w-4 rounded border-black/15"
                            />
                            <span>勾选</span>
                          </label>

                          <div>
                            <div className="font-medium text-black/82">{identity.displayNo}</div>
                            <div className="mt-1 text-sm text-black/58">
                              {item.customer.name} /{" "}
                              {item.salesOrder?.receiverNameSnapshot || item.customer.name}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <input type="hidden" name="shippingTaskId" value={item.id} />
                            <span className="crm-label">承运商</span>
                            <input
                              name="shippingProvider"
                              defaultValue={item.shippingProvider ?? ""}
                              placeholder="例如：顺丰 / 京东"
                              list="shipping-provider-options"
                              className="crm-input"
                            />
                          </div>

                          <div className="space-y-2">
                            <span className="crm-label">物流单号</span>
                            <input
                              name="trackingNumber"
                              defaultValue={item.trackingNumber ?? ""}
                              placeholder="回填后推进到已发货"
                              className="crm-input"
                            />
                          </div>
                        </div>
                      );
                    })}

                    <div className="flex justify-end">
                      <button type="submit" className="crm-button crm-button-primary">
                        批量回填物流
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}
            </section>
          ) : null}

          {items.length > 0 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-black/60">
                <span>
                  当前 supplier 本页显示 {pageStart} - {pageEnd} / {pagination.totalCount} 个子单
                </span>
                <span>TradeOrder 只作为上下文，主叙事仍然是 supplier 子单执行。</span>
              </div>

              {items.map((item) => {
                const codRecord = getLatestCodRecord(item);
                const identity = getExecutionIdentity(item);
                const isCod = Number(item.codAmount) > 0;
                const exceptionLabels = getExceptionLabels(item);
                const hasException = exceptionLabels.length > 0;
                const logisticsStatusMeta = getShippingLogisticsStatusMeta({
                  shippingStatus: item.shippingStatus,
                  trackingNumber: item.trackingNumber,
                });
                const logisticsSummaryText = getShippingLogisticsSummaryText({
                  shippingProvider: item.shippingProvider,
                  trackingNumber: item.trackingNumber,
                });

                return (
                  <section
                    key={item.id}
                    className={cn(
                      "crm-section-card",
                      hasException &&
                        "border-[rgba(177,63,45,0.18)] bg-[linear-gradient(180deg,rgba(255,246,244,0.96),rgba(255,255,255,0.96))]",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge
                            label={getShippingReportStatusLabel(item.reportStatus)}
                            variant={getShippingReportStatusVariant(item.reportStatus)}
                          />
                          <StatusBadge
                            label={getShippingFulfillmentStatusLabel(item.shippingStatus)}
                            variant={getShippingFulfillmentStatusVariant(item.shippingStatus)}
                          />
                          {item.salesOrder ? (
                            <StatusBadge
                              label={getSalesOrderPaymentSchemeLabel(item.salesOrder.paymentScheme)}
                              variant={getSalesOrderPaymentSchemeVariant(item.salesOrder.paymentScheme)}
                            />
                          ) : null}
                          <StatusBadge
                            label={isCod ? "COD" : "非 COD"}
                            variant={isCod ? "warning" : "neutral"}
                          />
                          {codRecord ? (
                            <StatusBadge
                              label={getCodCollectionStatusLabel(codRecord.status)}
                              variant={getCodCollectionStatusVariant(codRecord.status)}
                            />
                          ) : null}
                          {exceptionLabels.map((label) => (
                            <StatusBadge key={label} label={label} variant="danger" />
                          ))}
                        </div>

                        <div>
                          <div className="text-xs uppercase tracking-[0.12em] text-black/45">
                            {identity.tradeNo ? `父单 ${identity.tradeNo}` : "当前子单缺少父单上下文"}
                          </div>
                          <h3 className="mt-1 text-lg font-semibold text-black/85">
                            {identity.subOrderNo}
                          </h3>
                          <p className="mt-1 text-sm leading-7 text-black/60">
                            {item.customer.name} / {item.customer.phone} / {identity.supplierName}
                          </p>
                          <p className="text-xs leading-5 text-black/48">
                            物流摘要：{logisticsStatusMeta.label} / {logisticsSummaryText}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 text-right">
                        <div className="text-xs text-black/45">
                          创建于 {formatDateTime(item.createdAt)}
                        </div>
                        <Link
                          href={`/orders/${item.salesOrder?.id || item.tradeOrder?.id || item.id}`}
                          className="crm-button crm-button-secondary"
                        >
                          查看详情
                        </Link>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="crm-subtle-panel">
                        <p className="crm-detail-label">收件与商品摘要</p>
                        <div className="mt-3 space-y-2 text-sm text-black/68">
                          <div>
                            收件人：
                            {item.salesOrder?.receiverNameSnapshot || item.customer.name} /{" "}
                            {item.salesOrder?.receiverPhoneSnapshot || item.customer.phone}
                          </div>
                          <div>
                            地址：
                            {item.salesOrder?.receiverAddressSnapshot || "暂无收件地址快照"}
                          </div>
                          <div>商品：{getProductSummary(item)}</div>
                          <div>件数：{getPieceCount(item)}</div>
                        </div>
                      </div>

                      <div className="crm-subtle-panel">
                        <p className="crm-detail-label">履约执行摘要</p>
                        <div className="mt-3 space-y-2 text-sm text-black/68">
                          <div>
                            报单时间：{item.reportedAt ? formatDateTime(item.reportedAt) : "未报单"}
                          </div>
                          <div>
                            发货时间：{item.shippedAt ? formatDateTime(item.shippedAt) : "未发货"}
                          </div>
                          <div>承运商：{item.shippingProvider || "未填写"}</div>
                          <div>物流单号：{item.trackingNumber || "未回填"}</div>
                          <div>最近批次：{item.exportBatch?.exportNo || "尚未生成"}</div>
                        </div>
                        <LogisticsTracePanel
                          shippingTaskId={item.id}
                          shippingProvider={item.shippingProvider}
                          trackingNumber={item.trackingNumber}
                          className="mt-4"
                          title="查看物流轨迹"
                        />
                      </div>

                      <div className="crm-subtle-panel">
                        <p className="crm-detail-label">执行提示</p>
                        <div className="mt-3 space-y-2 text-sm text-black/68">
                          <div>代收金额：{formatCurrency(item.codAmount)}</div>
                          <div>
                            保价：{item.insuranceRequired ? "需要" : "不需要"} /{" "}
                            {formatCurrency(item.insuranceAmount)}
                          </div>
                          <div>
                            当前阶段提示：
                            {filters.stageView === "PENDING_REPORT"
                              ? "当前子单会随 supplier 批量生成批次。"
                              : filters.stageView === "PENDING_TRACKING"
                                ? "回填物流后即可进入已发货。"
                                : filters.stageView === "SHIPPED"
                                  ? "可在单卡更新里继续推进签收与完成。"
                                  : "先处理异常，再回到正常阶段推进。"}
                          </div>
                          {hasException ? <div>异常标记：{exceptionLabels.join("，")}</div> : null}
                        </div>
                      </div>
                    </div>

                    {canManageReporting ? (
                      <details className="mt-4 rounded-2xl border border-black/8 bg-white/76 p-4">
                        <summary className="cursor-pointer text-sm font-medium text-black/75">
                          单卡更新
                        </summary>
                        <form action={updateShippingAction} className="mt-4 space-y-3">
                          <input type="hidden" name="shippingTaskId" value={item.id} />
                          <input type="hidden" name="redirectTo" value={currentHref} />

                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-2">
                              <span className="crm-label">承运商</span>
                              <input
                                name="shippingProvider"
                                defaultValue={item.shippingProvider ?? ""}
                                placeholder="例如：顺丰 / 京东"
                                list="shipping-provider-options"
                                className="crm-input"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="crm-label">物流单号</span>
                              <input
                                name="trackingNumber"
                                defaultValue={item.trackingNumber ?? ""}
                                placeholder="回填后可推进到已发货"
                                className="crm-input"
                              />
                            </label>
                          </div>

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
                            <div className="grid gap-3 md:grid-cols-3">
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
                          ) : null}

                          <div className="flex justify-end">
                            <button type="submit" className="crm-button crm-button-primary">
                              保存单卡更新
                            </button>
                          </div>
                        </form>
                      </details>
                    ) : null}
                  </section>
                );
              })}

              <PaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                summary={`当前 supplier 本页显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 个子单`}
                buildHref={(pageNumber) =>
                  buildPageHref(
                    filters,
                    { page: pageNumber },
                    basePath,
                    baseSearchParams,
                  )
                }
              />
            </div>
          ) : (
            <EmptyState
              title="当前 supplier 暂无子单"
              description="当前 supplier 在这个阶段下没有可显示的子单。可以切换 supplier 或切换阶段继续处理。"
            />
          )}
        </>
      )}
    </div>
  );
}
