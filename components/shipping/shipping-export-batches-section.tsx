import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { SectionCard } from "@/components/shared/section-card";
import {
  StatusBadge,
  type StatusBadgeVariant,
} from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  buildFulfillmentShippingHref,
  buildFulfillmentTradeOrdersHref,
} from "@/lib/fulfillment/navigation";
import { buildShippingExportBatchDownloadHref } from "@/lib/shipping/download";
import type { getShippingExportBatchesPageData } from "@/lib/shipping/queries";
import { cn } from "@/lib/utils";

type BatchData = Awaited<ReturnType<typeof getShippingExportBatchesPageData>>;
type ExportBatchItem = BatchData["items"][number];
type BatchFilters = BatchData["filters"];
type PaginationData = BatchData["pagination"];

const batchResultCardClassName =
  "overflow-hidden rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)]";

const batchResultInsetClassName =
  "rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)]";

const batchQuietActionClassName =
  "inline-flex min-h-0 items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3 py-1.5 text-xs font-medium text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]";

function buildPageHref(
  filters: BatchFilters,
  overrides: Partial<BatchFilters> = {},
  basePath = "/shipping/export-batches",
  baseSearchParams?: Record<string, string>,
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams(baseSearchParams);

  if (next.keyword) {
    params.set("keyword", next.keyword);
  } else {
    params.delete("keyword");
  }

  if (next.supplierId) {
    params.set("supplierId", next.supplierId);
  } else {
    params.delete("supplierId");
  }

  if (next.fileView) {
    params.set("fileView", next.fileView);
  } else {
    params.delete("fileView");
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  } else {
    params.delete("page");
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function getFileStateMeta(fileState: ExportBatchItem["fileState"]): {
  label: string;
  variant: StatusBadgeVariant;
  note: string;
} {
  switch (fileState) {
    case "READY":
      return {
        label: "文件就绪",
        variant: "success",
        note: "冻结快照与导出文件都已可直接回看和下载。",
      };
    case "MISSING":
      return {
        label: "文件缺失",
        variant: "danger",
        note: "冻结快照仍在，但原文件路径已失效，应尽快重生成。",
      };
    case "PENDING":
      return {
        label: "待生成",
        variant: "warning",
        note: "冻结快照已写入，但导出文件尚未可用。",
      };
    case "LEGACY":
    default:
      return {
        label: "历史兼容",
        variant: "neutral",
        note: "旧批次仍可回看，但以兼容审计视角为主。",
      };
  }
}

function getFileViewLabel(fileView: string) {
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

function getBatchKeyword(item: ExportBatchItem) {
  return item.sourceTradeOrders.length === 1
    ? (item.sourceTradeOrders[0]?.tradeNo ?? "")
    : "";
}

function getPrimaryShippingHref(item: ExportBatchItem) {
  const keyword = getBatchKeyword(item);

  if (item.fileState === "MISSING" || item.fileState === "PENDING") {
    return buildFulfillmentShippingHref({
      supplierViewId: item.supplier.id,
      stageView: "EXCEPTION",
      keyword,
    });
  }

  if (item.stageSummary.pendingTrackingCount > 0) {
    return buildFulfillmentShippingHref({
      supplierViewId: item.supplier.id,
      stageView: "PENDING_TRACKING",
      keyword,
    });
  }

  return buildFulfillmentShippingHref({
    supplierViewId: item.supplier.id,
    stageView: "SHIPPED",
    keyword,
  });
}

function getPendingTrackingHref(item: ExportBatchItem) {
  return buildFulfillmentShippingHref({
    supplierViewId: item.supplier.id,
    stageView: "PENDING_TRACKING",
    keyword: getBatchKeyword(item),
  });
}

function getShippedHref(item: ExportBatchItem) {
  return buildFulfillmentShippingHref({
    supplierViewId: item.supplier.id,
    stageView: "SHIPPED",
    keyword: getBatchKeyword(item),
  });
}

function getExporterLabel(item: ExportBatchItem) {
  return item.exportedBy?.name || item.exportedBy?.username || "系统";
}

function BatchResultItem({
  item,
  canManageReporting,
  regenerateFileAction,
  redirectTo,
}: Readonly<{
  item: ExportBatchItem;
  canManageReporting: boolean;
  regenerateFileAction: (formData: FormData) => Promise<void>;
  redirectTo: string;
}>) {
  const fileState = getFileStateMeta(item.fileState);
  const shippingHref = getPrimaryShippingHref(item);
  const metrics = [
    { label: "冻结行", value: String(item._count.lines) },
    { label: "子单", value: String(item.subOrderCount) },
    { label: "父单", value: String(item.tradeOrderCount) },
    { label: "待物流", value: String(item.stageSummary.pendingTrackingCount) },
    { label: "已发货", value: String(item.stageSummary.shippedCount) },
  ];

  return (
    <article className={batchResultCardClassName}>
      <div className="flex flex-col gap-3 border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
              {item.exportNo}
            </h3>
            <StatusBadge label={fileState.label} variant={fileState.variant} />
            <span className="rounded-full border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-sidebar-muted)]">
              {item.supplier.name}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-sidebar-muted)]">
            <span>导出 {formatDateTime(item.exportedAt)}</span>
            <span>导出人 {getExporterLabel(item)}</span>
            <span>{item._count.lines} 行冻结快照</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {item.canDownload && item.fileUrl ? (
            <a
              href={buildShippingExportBatchDownloadHref(item.id)}
              className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-xs"
            >
              下载文件
            </a>
          ) : (
            <span className={batchQuietActionClassName}>文件未就绪</span>
          )}

          {canManageReporting && item.canRegenerate ? (
            <form action={regenerateFileAction}>
              <input type="hidden" name="exportBatchId" value={item.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <button
                type="submit"
                className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-xs"
              >
                {item.fileState === "READY" ? "重生成文件" : "生成文件"}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className={cn(batchResultInsetClassName, "px-3 py-2.5")}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-sidebar-muted)]">
                {metric.label}
              </div>
              <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-px bg-[var(--color-border-soft)] xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)]">
        <div className="bg-[var(--color-panel)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
            来源父单
          </p>
          {item.sourceTradeOrders.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.sourceTradeOrders.map((tradeOrder) => (
                <Link
                  key={`${item.id}-${tradeOrder.id}`}
                  href={buildFulfillmentTradeOrdersHref({
                    keyword: tradeOrder.tradeNo,
                  })}
                  className={batchQuietActionClassName}
                >
                  {tradeOrder.tradeNo}
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-sm text-[var(--color-sidebar-muted)]">
              当前批次还没有来源父单快照，保留为历史兼容回看记录。
            </div>
          )}

          {item.remark ? (
            <div className={cn(batchResultInsetClassName, "mt-3 px-3.5 py-3")}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]">
                备注
              </div>
              <div className="mt-1.5 text-sm leading-6 text-[var(--color-sidebar-muted)]">
                {item.remark}
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-[var(--color-panel)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
            文件与审计
          </p>
          <div className="mt-2 space-y-1.5 text-sm text-[var(--color-sidebar-muted)]">
            <div>文件名：{item.fileName}</div>
            <div>状态说明：{fileState.note}</div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={shippingHref}
              className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-xs"
            >
              回到发货执行
            </Link>
            {item.stageSummary.pendingTrackingCount > 0 ? (
              <Link
                href={getPendingTrackingHref(item)}
                className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-xs"
              >
                看待物流
              </Link>
            ) : null}
            {item.stageSummary.shippedCount > 0 ? (
              <Link
                href={getShippedHref(item)}
                className="crm-button crm-button-secondary min-h-0 px-3 py-1.5 text-xs"
              >
                看已发货
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ShippingExportBatchesSection({
  items,
  filters,
  pagination,
  canManageReporting,
  regenerateFileAction,
  basePath = "/shipping/export-batches",
  baseSearchParams,
  backHref = "/shipping",
  backLabel = "返回发货执行",
}: Readonly<{
  items: ExportBatchItem[];
  filters: BatchFilters;
  pagination: PaginationData;
  canManageReporting: boolean;
  regenerateFileAction: (formData: FormData) => Promise<void>;
  basePath?: string;
  baseSearchParams?: Record<string, string>;
  backHref?: string;
  backLabel?: string;
}>) {
  const readyCount = items.filter((item) => item.fileState === "READY").length;
  const pendingCount = items.filter(
    (item) => item.fileState === "MISSING" || item.fileState === "PENDING",
  ).length;
  const currentPageHref = buildPageHref(
    filters,
    { page: pagination.page },
    basePath,
    baseSearchParams,
  );
  const pageStart = (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalCount,
  );

  return (
    <div className="space-y-5">
      <SectionCard
        eyebrow="Batch Filters"
        title="结果筛选与回看"
        description="按批次号、来源父单和文件状态过滤冻结结果。保留跨视图返回语义，不把这里重新做成执行主入口。"
        density="compact"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--color-sidebar-muted)]">
            {filters.supplierId ? <span>已锁定 supplier 视角</span> : null}
            <span>当前过滤 {getFileViewLabel(filters.fileView)}</span>
            <Link href={backHref} className="crm-text-link text-sm">
              {backLabel}
            </Link>
          </div>
        }
      >
        <form
          method="get"
          className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_14rem_auto]"
        >
          {Object.entries(baseSearchParams ?? {}).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          {filters.supplierId ? (
            <input type="hidden" name="supplierId" value={filters.supplierId} />
          ) : null}

          <label className="space-y-1.5">
            <span className="crm-label">搜索批次 / 父单 / 子单 / 供应商</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className="crm-input"
              placeholder="batchNo / tradeNo / subOrderNo / supplier"
            />
          </label>

          <label className="space-y-1.5">
            <span className="crm-label">文件状态</span>
            <select
              name="fileView"
              defaultValue={filters.fileView}
              className="crm-select"
            >
              <option value="">全部状态</option>
              <option value="READY">文件就绪</option>
              <option value="MISSING">文件缺失</option>
              <option value="PENDING">待生成</option>
              <option value="LEGACY">历史兼容</option>
            </select>
          </label>

          <div className="crm-filter-actions xl:justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              应用筛选
            </button>
            <Link
              href={buildPageHref(
                { keyword: "", supplierId: "", fileView: "", page: 1 },
                {},
                basePath,
                baseSearchParams,
              )}
              className="crm-button crm-button-secondary"
            >
              重置
            </Link>
          </div>
        </form>
      </SectionCard>

      {items.length > 0 ? (
        <SectionCard
          eyebrow="Frozen Batch Results"
          title="批次结果列表"
          description="以文件状态、来源父单和审计说明为主线回看冻结结果，下载与重生成保留为清楚但次级的动作层。"
          density="compact"
          actions={
            <p className="text-[12px] text-[var(--color-sidebar-muted)]">
              当前页 {items.length} · 文件就绪 {readyCount} · 待补文件{" "}
              {pendingCount}
            </p>
          }
          contentClassName="space-y-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-sidebar-muted)]">
            <span>
              当前显示 {pageStart} - {pageEnd} / 共 {pagination.totalCount}{" "}
              个批次
            </span>
            <span>当前列表优先服务冻结快照回看、文件状态判断和审计联动。</span>
          </div>

          <div className="space-y-3">
            {items.map((item) => (
              <BatchResultItem
                key={item.id}
                item={item}
                canManageReporting={canManageReporting}
                regenerateFileAction={regenerateFileAction}
                redirectTo={currentPageHref}
              />
            ))}
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`当前显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 个批次`}
            buildHref={(pageNumber) =>
              buildPageHref(
                filters,
                { page: pageNumber },
                basePath,
                baseSearchParams,
              )
            }
          />
        </SectionCard>
      ) : (
        <EmptyState
          title="暂无报单批次"
          description="当前筛选条件下没有批次记录。请先回到发货执行创建 supplier 批次，再来这里回看冻结结果。"
          action={
            <Link href={backHref} className="crm-button crm-button-primary">
              {backLabel}
            </Link>
          }
        />
      )}
    </div>
  );
}
