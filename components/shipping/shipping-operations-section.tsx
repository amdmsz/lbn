/**
 * ShippingOperationsSection — 发货执行三阶段工作面 (Wave 6 Phase 1C 视觉升级).
 *
 * 视觉气质 (补做 Wave 5 跳过项):
 * - 三 workspace 顶部摘要统一走 MetricStrip 3-4 项.
 * - 表格列从 8 收敛到 5-6: 删 [供应商] 列 (workspace 已锁 supplier 冗余),
 *   合并 [品名/件数] -> ProductCell, 合并 [金额/COD/保价/备注] -> CommercialCell.
 * - 审核/报单/履约 三连 badge -> PhaseTrackBadges (mini 3 阶段进度链).
 * - 异常 6 标签 -> CompactBadgeGroup maxVisible=3 + overflow chip.
 * - ShippedAndExceptionWorkspace 卡片使用 OrderProgressTrack 全 7 阶段轨道.
 *
 * 拆分: 展示原语 + utility 抽到 sidecar shipping-operations-bits.tsx 控制本文件行数.
 * 严格不动 trade-orders/, shared/, 其他模块. 无 gradient. 无 hover translate. dark mode token.
 */

import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import CompactBadgeGroup from "@/components/shared/compact-badge-group";
import MetricStrip, {
  type MetricItem,
} from "@/components/shared/metric-strip";
import OrderProgressTrack from "@/components/trade-orders/order-progress-track";
import { LogisticsTracePanel } from "@/components/shipping/logistics-trace-panel";
import { ShippingQuickFillDrawer } from "@/components/shipping/shipping-quick-fill-drawer";
import { ShippingSelectionToolbar } from "@/components/shipping/shipping-selection-toolbar";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  getSalesOrderPaymentSchemeLabel,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
} from "@/lib/fulfillment/metadata";
import { COMMON_LOGISTICS_PROVIDERS } from "@/lib/logistics/metadata";
import { buildShippingExportBatchDownloadHref } from "@/lib/shipping/download";
import { getPrimaryShippingPackageSnapshot } from "@/lib/shipping/package-snapshots";
import type {
  ShippingOperationsFilters,
  ShippingOperationsItem,
  ShippingPendingBatchSummary,
  ShippingStageView,
  ShippingSupplierSummary,
} from "@/lib/shipping/queries";
import { cn } from "@/lib/utils";

import {
  CommercialCell,
  CustomerOwnerHint,
  HiddenFields,
  OutcomeFinalizeForms,
  PhaseTrackBadges,
  ProductCell,
  ShippingUpdateDetailsForm,
  StageWorkspaceHeader,
  StatusBadge,
  buildExportBatchHiddenFields,
  buildPageHref,
  buildSupplierMetrics,
  canFinalizeShippingOutcome,
  deriveOrderProgressPhase,
  getBatchStatusMeta,
  getCollectionFocusMeta,
  getExceptionBadgeItems,
  getExecutionIdentity,
  getLatestCodRecord,
  getOrderCommercialContext,
  getShippingPackagesSummary,
  getStageCount,
  tableCellClass,
  tableHeadCellClass,
  tableHeaderClass,
  workspaceHintClassName,
  workspacePanelClassName,
  workspaceQuietActionClassName,
  workspaceSectionClassName,
  workspaceTableShellClassName,
  type PaginationData,
  type SummaryData,
} from "@/components/shipping/shipping-operations-bits";

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

// ---------------------------------------------------------------------------
// CurrentReportWorkspace
// ---------------------------------------------------------------------------

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
  const currentHref = buildPageHref(
    filters,
    { page: pagination.page },
    basePath,
    baseSearchParams,
  );
  const latestHistoryBatchMeta = getBatchStatusMeta(
    activeSupplier.latestHistoryBatch,
  );
  const pageStart =
    pagination.totalCount === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalCount,
  );

  return (
    <section className={workspaceSectionClassName}>
      <StageWorkspaceHeader
        title={`${activeSupplier.supplier.name} · 当前报单`}
        description="当前可导出的真实待处理池。先勾选当前 supplier 下的订单, 再执行本次导出。"
        badges={
          <>
            <StatusBadge label="当前报单" variant="info" />
            <StatusBadge
              label={`${activeSupplier.stageTaskCount} 单待导出`}
              variant="success"
            />
          </>
        }
        actions={
          <>
            <form action={createExportBatchAction}>
              <HiddenFields
                fields={buildExportBatchHiddenFields({
                  supplierId: activeSupplier.supplier.id,
                  sourceStage: "PENDING_REPORT",
                  redirectTo: pendingTrackingHref,
                })}
              />
              <button type="submit" className="crm-button crm-button-primary">
                导出当前 supplier 全部
              </button>
            </form>
            <Link
              href={exportBatchesHref}
              className="crm-button crm-button-secondary"
            >
              查看历史批次
            </Link>
          </>
        }
      />

      <MetricStrip
        ariaLabel="当前 supplier 摘要"
        metrics={buildSupplierMetrics(activeSupplier)}
      />

      {activeSupplier.latestHistoryBatch ? (
        <div className={workspacePanelClassName}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            最近导出批次
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {activeSupplier.latestHistoryBatch.exportNo}
            </span>
            <span>
              {formatDateTime(activeSupplier.latestHistoryBatch.exportedAt)}
            </span>
            <span className="text-[11px]">
              {latestHistoryBatchMeta?.note ??
                "历史批次只作回看, 不代表当前待导出集合。"}
            </span>
            {activeSupplier.latestHistoryBatch.canDownload &&
            activeSupplier.latestHistoryBatch.fileUrl ? (
              <a
                href={buildShippingExportBatchDownloadHref(
                  activeSupplier.latestHistoryBatch.id,
                )}
                className="text-sm font-medium text-[var(--color-info)] hover:underline"
              >
                下载文件
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="当前 supplier 暂无可报单订单"
          description="尝试切换供应商或清空搜索条件。"
        />
      ) : (
        <>
          <form id="current-report-selection-form" className="space-y-3">
            <HiddenFields
              fields={buildExportBatchHiddenFields({
                supplierId: activeSupplier.supplier.id,
                sourceStage: "PENDING_REPORT",
                redirectTo: pendingTrackingHref,
              })}
            />
            <ShippingSelectionToolbar
              formId="current-report-selection-form"
              inputName="selectedShippingTaskId"
              summary={`本页 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单, 默认勾选当前页。`}
            />

            <div className={workspaceTableShellClassName}>
              <table className="min-w-full divide-y divide-border/60 text-sm">
                <thead className={tableHeaderClass}>
                  <tr>
                    <th className={tableHeadCellClass}>选</th>
                    <th className={tableHeadCellClass}>子单 / 父单</th>
                    <th className={tableHeadCellClass}>收件人 / 地址</th>
                    <th className={tableHeadCellClass}>商品</th>
                    <th className={tableHeadCellClass}>金额</th>
                    <th className={tableHeadCellClass}>进度</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {items.map((item) => {
                    const identity = getExecutionIdentity(item);
                    return (
                      <tr key={item.id} className="text-muted-foreground">
                        <td className={tableCellClass}>
                          <input
                            type="checkbox"
                            name="selectedShippingTaskId"
                            value={item.id}
                            defaultChecked
                            className="mt-0.5 h-4 w-4 rounded border-border"
                          />
                        </td>
                        <td className={tableCellClass}>
                          <div className="font-medium text-foreground">
                            {identity.subOrderNo}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {identity.tradeNo
                              ? `父单 ${identity.tradeNo}`
                              : "缺少父单锚点"}
                          </div>
                        </td>
                        <td className={tableCellClass}>
                          <div className="text-foreground">
                            {item.salesOrder?.receiverNameSnapshot ||
                              item.customer.name}
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              {item.salesOrder?.receiverPhoneSnapshot ||
                                item.customer.phone}
                            </span>
                          </div>
                          <div className="mt-0.5 line-clamp-1 max-w-[16rem] text-[11px] text-muted-foreground">
                            {item.salesOrder?.receiverAddressSnapshot ||
                              "暂无地址快照"}
                          </div>
                          <CustomerOwnerHint item={item} />
                        </td>
                        <td className={tableCellClass}>
                          <ProductCell item={item} />
                        </td>
                        <td className={tableCellClass}>
                          <CommercialCell item={item} />
                        </td>
                        <td className={tableCellClass}>
                          <PhaseTrackBadges item={item} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button
                formAction={createExportBatchAction}
                className="crm-button crm-button-primary"
              >
                导出当前勾选
              </button>
              <Link
                href={currentHref}
                className="crm-button crm-button-secondary"
              >
                保持当前筛选
              </Link>
            </div>
          </form>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单`}
            buildHref={(pageNumber) =>
              buildPageHref(
                filters,
                { page: pageNumber },
                basePath,
                baseSearchParams,
              )
            }
          />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// PendingLogisticsWorkspace
// ---------------------------------------------------------------------------

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

  const currentHref = buildPageHref(
    filters,
    { page: pagination.page },
    basePath,
    baseSearchParams,
  );
  const activeBatchMeta = getBatchStatusMeta(activeBatch);
  const pageStart =
    pagination.totalCount === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalCount,
  );

  return (
    <section className={workspaceSectionClassName}>
      <StageWorkspaceHeader
        title={`${activeSupplier.supplier.name} · 待填物流`}
        description="承接已导出但尚未填写物流的订单。按批次切换、逐单回填, 也可对当前批次再次导出。"
        badges={
          <>
            <StatusBadge label="待填物流" variant="info" />
            <StatusBadge
              label={`${activeSupplier.pendingTrackingCount} 单待回填`}
              variant="warning"
            />
            {activeBatch ? (
              <StatusBadge
                label={`当前批次 ${activeBatch.exportNo}`}
                variant="success"
              />
            ) : null}
          </>
        }
        actions={
          <Link
            href={exportBatchesHref}
            className="crm-button crm-button-secondary"
          >
            查看历史批次
          </Link>
        }
      />

      <MetricStrip
        ariaLabel="当前 supplier 摘要"
        metrics={buildSupplierMetrics(activeSupplier)}
      />

      {pendingBatchSummaries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            批次切换
          </span>
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
                  workspaceQuietActionClassName,
                  isActive &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
                )}
              >
                {batch.exportNo} · {batch.taskCount} 单
                {batchMeta ? ` · ${batchMeta.label}` : ""}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={workspaceHintClassName}>
          当前 supplier 暂无可切换的待填物流批次。
        </div>
      )}

      {activeBatch ? (
        <div className={workspacePanelClassName}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {activeBatch.exportNo}
              </span>
              <span className="ml-2 text-[11px]">
                {formatDateTime(activeBatch.exportedAt)} ·{" "}
                {activeBatchMeta?.note ?? "可再次导出。"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeBatch.canDownload && activeBatch.fileUrl ? (
                <a
                  href={buildShippingExportBatchDownloadHref(activeBatch.id)}
                  className="crm-button crm-button-secondary"
                >
                  下载文件
                </a>
              ) : null}
              {activeBatch.canRegenerate ? (
                <form action={regenerateFileAction}>
                  <HiddenFields
                    fields={{
                      exportBatchId: activeBatch.id,
                      redirectTo: currentHref,
                    }}
                  />
                  <button
                    type="submit"
                    className="crm-button crm-button-secondary"
                  >
                    {activeBatch.fileState === "READY"
                      ? "重新生成文件"
                      : "生成文件"}
                  </button>
                </form>
              ) : null}
              {activeBatchItems.length > 0 ? (
                <form action={createExportBatchAction}>
                  <HiddenFields
                    fields={buildExportBatchHiddenFields({
                      supplierId: activeSupplier.supplier.id,
                      sourceStage: "PENDING_TRACKING",
                      redirectTo: currentHref,
                    })}
                  />
                  {activeBatchItems.map((item) => (
                    <input
                      key={item.id}
                      type="hidden"
                      name="shippingTaskId"
                      value={item.id}
                    />
                  ))}
                  <button
                    type="submit"
                    className="crm-button crm-button-primary"
                  >
                    重新导出当前批次
                  </button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="当前批次暂无待填物流订单"
          description="尝试切换批次、切换 supplier, 或去异常队列核对未挂批次的记录。"
        />
      ) : (
        <>
          <form
            id="pending-logistics-form"
            action={bulkUpdateShippingAction}
            className="space-y-3"
          >
            <HiddenFields
              fields={buildExportBatchHiddenFields({
                supplierId: activeSupplier.supplier.id,
                sourceStage: "PENDING_TRACKING",
                redirectTo: currentHref,
              })}
            />

            <ShippingSelectionToolbar
              formId="pending-logistics-form"
              inputName="selectedShippingTaskId"
              summary={`本页 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单, 默认勾选当前页。`}
            />

            <div className={workspaceTableShellClassName}>
              <table className="min-w-full divide-y divide-border/60 text-sm">
                <thead className={tableHeaderClass}>
                  <tr>
                    <th className={tableHeadCellClass}>选</th>
                    <th className={tableHeadCellClass}>子单 / 收件人</th>
                    <th className={tableHeadCellClass}>商品 / 金额</th>
                    <th className={tableHeadCellClass}>承运商 / 物流单号</th>
                    <th className={tableHeadCellClass}>动作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {items.map((item) => {
                    const identity = getExecutionIdentity(item);
                    const receiverName =
                      item.salesOrder?.receiverNameSnapshot ||
                      item.customer.name;
                    const receiverPhone =
                      item.salesOrder?.receiverPhoneSnapshot ||
                      item.customer.phone;
                    const receiverAddress =
                      item.salesOrder?.receiverAddressSnapshot ||
                      "暂无地址快照";

                    return (
                      <tr key={item.id} className="text-muted-foreground">
                        <td className={tableCellClass}>
                          <input
                            type="checkbox"
                            name="selectedShippingTaskId"
                            value={item.id}
                            defaultChecked
                            className="mt-0.5 h-4 w-4 rounded border-border"
                          />
                          <input
                            type="hidden"
                            name="shippingTaskId"
                            value={item.id}
                          />
                        </td>
                        <td className={tableCellClass}>
                          <div className="font-medium text-foreground">
                            {identity.subOrderNo}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {identity.tradeNo
                              ? `父单 ${identity.tradeNo}`
                              : "缺少父单锚点"}
                          </div>
                          <div className="mt-1 text-foreground">
                            {receiverName}
                            <span className="ml-1.5 text-[11px] text-muted-foreground">
                              {receiverPhone}
                            </span>
                          </div>
                          <div className="mt-0.5 line-clamp-1 max-w-[16rem] text-[11px] text-muted-foreground">
                            {receiverAddress}
                          </div>
                          {item.exportBatch?.exportNo ? (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              批次 {item.exportBatch.exportNo}
                              {item.reportedAt
                                ? ` · ${formatDateTime(item.reportedAt)}`
                                : ""}
                            </div>
                          ) : null}
                        </td>
                        <td className={tableCellClass}>
                          <div className="space-y-1.5">
                            <ProductCell item={item} />
                            <CommercialCell item={item} />
                          </div>
                        </td>
                        <td className={tableCellClass}>
                          <div className="flex flex-col gap-1.5">
                            <input
                              name="shippingProvider"
                              defaultValue={item.shippingProvider ?? ""}
                              placeholder="承运商"
                              list="shipping-provider-options"
                              className="crm-input min-w-[7.5rem]"
                            />
                            <input
                              name="trackingNumber"
                              defaultValue={item.trackingNumber ?? ""}
                              placeholder="物流单号"
                              className="crm-input min-w-[9.5rem]"
                            />
                          </div>
                        </td>
                        <td className={tableCellClass}>
                          <div className="flex flex-col items-start gap-1.5">
                            <ShippingQuickFillDrawer
                              shippingTaskId={item.id}
                              supplierName={identity.supplierName}
                              subOrderNo={identity.subOrderNo}
                              receiverName={receiverName}
                              shippingProvider={item.shippingProvider}
                              trackingNumber={item.trackingNumber}
                              shippingPackages={item.shippingPackages}
                              redirectTo={currentHref}
                              updateShippingAction={updateShippingAction}
                            />
                            <Link
                              href={`/orders/${item.salesOrder?.id || item.tradeOrder?.id || item.id}`}
                              className="text-[12px] font-medium text-[var(--color-info)] hover:underline"
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
              <button
                formAction={createExportBatchAction}
                className="crm-button crm-button-secondary"
              >
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
            summary={`显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单`}
            buildHref={(pageNumber) =>
              buildPageHref(
                filters,
                { page: pageNumber },
                basePath,
                baseSearchParams,
              )
            }
          />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// ShippedAndExceptionWorkspace
// ---------------------------------------------------------------------------

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
  const currentHref = buildPageHref(
    filters,
    { page: pagination.page },
    basePath,
    baseSearchParams,
  );
  const pageStart =
    pagination.totalCount === 0
      ? 0
      : (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalCount,
  );

  return (
    <section className={workspaceSectionClassName}>
      <StageWorkspaceHeader
        title={
          isExceptionStage
            ? `${activeSupplier?.supplier.name || "当前供应商"} · 履约异常`
            : `${activeSupplier?.supplier.name || "当前供应商"} · 已发货 / 回款关注`
        }
        description={
          isExceptionStage
            ? "异常单独收口。优先处理取消、文件缺失、状态冲突等问题。"
            : "承接已填写物流并已发货的订单, 重点关注签收、COD 与回款。"
        }
        badges={
          <>
            <StatusBadge
              label={isExceptionStage ? "履约异常" : "已发货 / 回款关注"}
              variant={isExceptionStage ? "danger" : "success"}
            />
            {activeSupplier ? (
              <StatusBadge
                label={`${activeSupplier.stageTaskCount} 单`}
                variant="neutral"
              />
            ) : null}
          </>
        }
      />

      {activeSupplier ? (
        <MetricStrip
          ariaLabel="当前 supplier 摘要"
          metrics={buildSupplierMetrics(activeSupplier)}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={
            isExceptionStage
              ? "当前 supplier 暂无履约异常"
              : "当前 supplier 暂无已发货记录"
          }
          description="尝试切换 supplier、切换阶段, 或清空搜索条件。"
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => {
              const identity = getExecutionIdentity(item);
              const isCod = Number(item.codAmount) > 0;
              const codRecord = getLatestCodRecord(item);
              const focusMeta = getCollectionFocusMeta(item);
              const exceptionBadges = getExceptionBadgeItems(item);
              const receiverName =
                item.salesOrder?.receiverNameSnapshot || item.customer.name;
              const canFinalizeOutcome = canFinalizeShippingOutcome(item);
              const commercialContext = getOrderCommercialContext(item);
              const progressPhase = deriveOrderProgressPhase(item);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-xl border border-border/60 bg-card p-4 shadow-sm",
                    isExceptionStage &&
                      "border-rose-200/70 dark:border-rose-500/30",
                  )}
                >
                  <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          label={getShippingFulfillmentStatusLabel(
                            item.shippingStatus,
                          )}
                          variant={getShippingFulfillmentStatusVariant(
                            item.shippingStatus,
                          )}
                        />
                        <StatusBadge
                          label={focusMeta.label}
                          variant={focusMeta.variant}
                        />
                        <StatusBadge
                          label={isCod ? "COD" : "非 COD"}
                          variant={isCod ? "warning" : "neutral"}
                        />
                        {exceptionBadges.length > 0 ? (
                          <CompactBadgeGroup
                            items={exceptionBadges}
                            maxVisible={3}
                            size="sm"
                            overflowTone="danger"
                          />
                        ) : null}
                      </div>

                      {item.logisticsExceptionMessage ? (
                        <div className="rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-1.5 text-[12px] leading-5 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                          {item.logisticsExceptionMessage}
                        </div>
                      ) : null}

                      <div>
                        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {identity.tradeNo
                            ? `父单 ${identity.tradeNo}`
                            : "缺少父单锚点"}
                        </div>
                        <h4 className="mt-0.5 text-[15px] font-semibold text-foreground">
                          {identity.subOrderNo}
                        </h4>
                        <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                          {receiverName}
                        </div>
                        <CustomerOwnerHint item={item} />
                      </div>

                      <OrderProgressTrack currentPhase={progressPhase} />

                      <div className="grid gap-2 text-[12.5px] text-muted-foreground sm:grid-cols-2">
                        <div>承运商：{item.shippingProvider || "未填写"}</div>
                        <div>物流单号：{item.trackingNumber || "未填写"}</div>
                        <div>
                          发货时间：
                          {item.shippedAt
                            ? formatDateTime(item.shippedAt)
                            : "未发货"}
                        </div>
                        <div>
                          支付方案：
                          {item.salesOrder
                            ? getSalesOrderPaymentSchemeLabel(
                                item.salesOrder.paymentScheme,
                              )
                            : "未知"}
                        </div>
                        <div className="sm:col-span-2">
                          <CommercialCell item={item} />
                        </div>
                        <div className="sm:col-span-2 text-[11px]">
                          {getShippingPackagesSummary(item)}
                        </div>
                        {commercialContext.remarkLines.length > 0 ? (
                          <div className="sm:col-span-2 space-y-0.5 text-[11px]">
                            {commercialContext.remarkLines.map((remark) => (
                              <div
                                key={`${remark.label}:${remark.value}`}
                                className="line-clamp-2"
                              >
                                {remark.label}：{remark.value}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <LogisticsTracePanel
                        shippingTaskId={item.id}
                        shippingProvider={
                          getPrimaryShippingPackageSnapshot(
                            item.shippingPackages,
                          )?.shippingProvider ?? item.shippingProvider
                        }
                        trackingNumber={
                          getPrimaryShippingPackageSnapshot(
                            item.shippingPackages,
                          )?.trackingNumber ?? item.trackingNumber
                        }
                        title="查看物流轨迹"
                      />
                      {canFinalizeOutcome ? (
                        <OutcomeFinalizeForms
                          item={item}
                          currentHref={currentHref}
                          updateShippingAction={updateShippingAction}
                        />
                      ) : null}

                      <ShippingUpdateDetailsForm
                        item={item}
                        currentHref={currentHref}
                        isCod={isCod}
                        codRecord={codRecord}
                        updateShippingAction={updateShippingAction}
                      />

                      <Link
                        href={`/orders/${item.salesOrder?.id || item.tradeOrder?.id || item.id}`}
                        className="crm-button crm-button-secondary w-full justify-center"
                      >
                        查看详情
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 单`}
            buildHref={(pageNumber) =>
              buildPageHref(
                filters,
                { page: pageNumber },
                basePath,
                baseSearchParams,
              )
            }
          />
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Top-level: ShippingOperationsSection
// ---------------------------------------------------------------------------

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
  const stageTabsValue = PRIMARY_STAGE_ITEMS.some(
    (item) => item.value === filters.stageView,
  )
    ? filters.stageView
    : "";
  const pageBaseHref = buildPageHref(
    filters,
    { page: 1 },
    basePath,
    baseSearchParams,
  );

  const topMetrics: MetricItem[] = [
    { label: "当前阶段", value: String(currentStageCount), tone: "primary" },
    { label: "supplier 池", value: String(summary.supplierCount), tone: "neutral" },
    {
      label: "待填物流",
      value: String(summary.pendingTrackingCount),
      tone: "warning",
    },
    {
      label: "履约异常",
      value: String(summary.exceptionCount),
      tone: summary.exceptionCount > 0 ? "danger" : "neutral",
    },
  ];

  return (
    <div className="space-y-5">
      <datalist id="shipping-provider-options">
        {COMMON_LOGISTICS_PROVIDERS.map((provider) => (
          <option key={provider.code} value={provider.label} />
        ))}
      </datalist>

      <MetricStrip ariaLabel="发货执行核心指标" metrics={topMetrics} />

      <SectionCard
        title="发货执行工作面"
        density="compact"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span>
              {filters.stageView === "EXCEPTION"
                ? "当前在异常视图"
                : `当前阶段 ${currentStageCount} 单`}
            </span>
            <span>
              {activeSupplier
                ? `supplier ${activeSupplier.supplier.name}`
                : "待选择 supplier"}
            </span>
            <Link
              href={exportBatchesHref}
              className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-sm"
            >
              历史批次
            </Link>
          </div>
        }
      >
        <div className="space-y-3.5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
                { stageView: "EXCEPTION", batchViewId: "", page: 1 },
                basePath,
                baseSearchParams,
              )}
              className={cn(
                workspaceQuietActionClassName,
                filters.stageView === "EXCEPTION" &&
                  "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300",
              )}
            >
              履约异常 {summary.exceptionCount}
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
            <input
              type="hidden"
              name="supplierViewId"
              value={filters.supplierViewId}
            />
            {filters.stageView === "PENDING_TRACKING" && filters.batchViewId ? (
              <input
                type="hidden"
                name="batchViewId"
                value={filters.batchViewId}
              />
            ) : null}
            {filters.isCod ? (
              <input type="hidden" name="isCod" value={filters.isCod} />
            ) : null}

            <label className="space-y-1.5">
              <span className="crm-label">supplier 筛选</span>
              <input
                name="supplierKeyword"
                defaultValue={filters.supplierKeyword}
                className="crm-input"
                placeholder="输入 supplier 名称"
              />
            </label>

            <label className="space-y-1.5">
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
                  { keyword: "", supplierKeyword: "", page: 1 },
                  basePath,
                  baseSearchParams,
                )}
                className="crm-button crm-button-secondary"
              >
                重置
              </Link>
            </div>
          </form>
        </div>
      </SectionCard>

      {supplierSummaries.length === 0 ? (
        <EmptyState
          title="当前阶段没有可处理的供应商"
          description="尝试切换主阶段, 或清空供应商 / 订单搜索条件。"
          action={
            <Link href={pageBaseHref} className="crm-button crm-button-primary">
              回到当前工作面
            </Link>
          }
        />
      ) : (
        <>
          <SectionCard
            title="当前阶段 supplier 池"
            density="compact"
            actions={
              <p className="text-[12px] text-muted-foreground">
                共 {supplierSummaries.length} 个 supplier
              </p>
            }
          >
            <div className="grid gap-2.5 lg:grid-cols-2 2xl:grid-cols-4">
              {supplierSummaries.map((supplierSummary) => {
                const isActive =
                  supplierSummary.supplier.id === activeSupplier?.supplier.id;
                const currentBatchMeta = getBatchStatusMeta(
                  supplierSummary.currentBatch,
                );

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
                      "rounded-xl border border-border/60 bg-card p-3 transition-colors hover:border-border hover:bg-muted/30",
                      isActive &&
                        "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-medium text-foreground">
                          {supplierSummary.supplier.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          当前阶段 {supplierSummary.stageTaskCount} 单 · 最近{" "}
                          {supplierSummary.latestHistoryBatch
                            ? supplierSummary.latestHistoryBatch.exportNo
                            : "无批次"}
                        </div>
                      </div>
                      {isActive ? (
                        <StatusBadge label="当前" variant="success" />
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {supplierSummary.pendingTrackingCount > 0 ? (
                        <StatusBadge
                          label={`待填 ${supplierSummary.pendingTrackingCount}`}
                          variant="warning"
                        />
                      ) : null}
                      {supplierSummary.exceptionCount > 0 ? (
                        <StatusBadge
                          label={`异常 ${supplierSummary.exceptionCount}`}
                          variant="danger"
                        />
                      ) : null}
                      {currentBatchMeta && supplierSummary.currentBatch ? (
                        <StatusBadge
                          label={`批次 ${supplierSummary.currentBatch.exportNo}`}
                          variant={currentBatchMeta.variant}
                        />
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </SectionCard>

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
              stageView={
                filters.stageView === "EXCEPTION" ? "EXCEPTION" : "SHIPPED"
              }
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
