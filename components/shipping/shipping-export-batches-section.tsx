import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  buildFulfillmentShippingHref,
  buildFulfillmentTradeOrdersHref,
} from "@/lib/fulfillment/navigation";
import type { getShippingExportBatchesPageData } from "@/lib/shipping/queries";

type BatchData = Awaited<ReturnType<typeof getShippingExportBatchesPageData>>;
type ExportBatchItem = BatchData["items"][number];
type BatchFilters = BatchData["filters"];
type PaginationData = BatchData["pagination"];

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
        label: "文件可下载",
        variant: "success",
        note: "冻结快照已生成文件，可直接下载或再次重生成。",
      };
    case "MISSING_FILE":
      return {
        label: "待重生成",
        variant: "warning",
        note: "快照已冻结，但文件缺失或生成失败，应从这里重生成。",
      };
    case "LEGACY":
    default:
      return {
        label: "历史批次",
        variant: "neutral",
        note: "旧批次尚未回填 ShippingExportLine，本轮仅保留兼容回看。",
      };
  }
}

function getPrimaryShippingHref(item: ExportBatchItem) {
  const keyword = item.sourceTradeOrders.length === 1 ? item.sourceTradeOrders[0]?.tradeNo : "";

  if (item.fileState === "MISSING_FILE") {
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
  if (items.length === 0) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-black/8 bg-[rgba(249,250,252,0.72)] px-4 py-3.5 text-sm leading-7 text-black/62">
          批次记录承接冻结快照、文件下载、重生成和历史审计。它不是第一执行入口，新批次仍应回到发货执行按 supplier 工作池创建。
        </div>
        <EmptyState
          title="暂无报单批次"
          description="当前筛选条件下没有批次记录。请先回到发货执行生成 supplier 批次，之后再来这里回看冻结结果。"
          action={
            <Link href={backHref} className="crm-button crm-button-primary">
              {backLabel}
            </Link>
          }
        />
      </div>
    );
  }

  const pageStart = (pagination.page - 1) * pagination.pageSize + 1;
  const pageEnd = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-black/8 bg-[rgba(249,250,252,0.72)] px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-black/82">冻结结果与审计回看</div>
            <div className="text-xs leading-6 text-black/55">
              批次记录负责保存当时导出了什么、文件是否可下载、是否需要重生成，以及这些批次来自哪些父单与 supplier。
            </div>
          </div>
          <Link href={backHref} className="crm-text-link">
            {backLabel}
          </Link>
        </div>
      </div>

      <div className="crm-filter-panel">
        <form method="get" className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_14rem_auto]">
          {Object.entries(baseSearchParams ?? {}).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          {filters.supplierId ? (
            <input type="hidden" name="supplierId" value={filters.supplierId} />
          ) : null}
          <label className="space-y-2">
            <span className="crm-label">搜索批次 / 父单 / 子单 / 供货商</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className="crm-input"
              placeholder="batchNo / tradeNo / subOrderNo / 供货商"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">文件状态</span>
            <select name="fileView" defaultValue={filters.fileView} className="crm-select">
              <option value="">全部状态</option>
              <option value="READY">文件可下载</option>
              <option value="MISSING_FILE">待重生成</option>
              <option value="LEGACY">历史批次</option>
            </select>
          </label>

          <div className="crm-filter-actions">
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-black/60">
        <span>
          共 {pagination.totalCount} 个批次，当前第 {pagination.page} / {pagination.totalPages} 页
        </span>
        <span>当前列表优先服务冻结快照回看、文件下载与审计联动。</span>
      </div>

      <div className="grid gap-4">
        {items.map((item) => {
          const fileState = getFileStateMeta(item.fileState);
          const shippingHref = getPrimaryShippingHref(item);

          return (
            <div key={item.id} className="crm-card-muted p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-medium text-black/82">{item.exportNo}</div>
                    <StatusBadge label={fileState.label} variant={fileState.variant} />
                  </div>
                  <div className="text-xs text-black/48">
                    供货商：{item.supplier.name} / 导出时间：{formatDateTime(item.exportedAt)}
                  </div>
                </div>
                <div className="text-right text-xs text-black/48">
                  <div>导出人：{item.exportedBy?.name || item.exportedBy?.username || "系统"}</div>
                  <div>{fileState.note}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-6">
                <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                  文件名：{item.fileName}
                </div>
                <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                  冻结行：{item._count.lines}
                </div>
                <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                  子单数：{item.subOrderCount}
                </div>
                <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                  父单数：{item.tradeOrderCount}
                </div>
                <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                  待物流：{item.stageSummary.pendingTrackingCount}
                </div>
                <div className="rounded-2xl border border-black/8 bg-white/70 p-4 text-sm text-black/70">
                  已发货：{item.stageSummary.shippedCount}
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                    来源父单
                  </p>
                  {item.sourceTradeOrders.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.sourceTradeOrders.map((tradeOrder) => (
                        <Link
                          key={`${item.id}-${tradeOrder.id}`}
                          href={buildFulfillmentTradeOrdersHref({ keyword: tradeOrder.tradeNo })}
                          className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.85)] px-3 py-1.5 text-xs text-black/62 transition hover:border-black/14 hover:bg-white"
                        >
                          {tradeOrder.tradeNo}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 text-sm text-black/52">
                      当前批次尚未回填 ShippingExportLine，暂时没有父单来源快照。
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-black/8 bg-white/72 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                    域内联动
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={shippingHref} className="crm-button crm-button-secondary">
                      回到发货执行
                    </Link>
                    {item.stageSummary.pendingTrackingCount > 0 ? (
                      <Link
                        href={buildFulfillmentShippingHref({
                          supplierViewId: item.supplier.id,
                          stageView: "PENDING_TRACKING",
                          keyword:
                            item.sourceTradeOrders.length === 1
                              ? item.sourceTradeOrders[0]?.tradeNo
                              : "",
                        })}
                        className="crm-button crm-button-secondary"
                      >
                        看待物流
                      </Link>
                    ) : null}
                    {item.stageSummary.shippedCount > 0 ? (
                      <Link
                        href={buildFulfillmentShippingHref({
                          supplierViewId: item.supplier.id,
                          stageView: "SHIPPED",
                          keyword:
                            item.sourceTradeOrders.length === 1
                              ? item.sourceTradeOrders[0]?.tradeNo
                              : "",
                        })}
                        className="crm-button crm-button-secondary"
                      >
                        看已发货
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 bg-white/72 px-4 py-3 text-sm text-black/65">
                <div className="space-y-1">
                  <div>
                    文件：
                    {item.fileUrl ? (
                      <a href={item.fileUrl} className="ml-1 crm-text-link">
                        下载
                      </a>
                    ) : (
                      <span className="ml-1 text-black/45">尚未生成</span>
                    )}
                  </div>
                  <div className="text-xs text-black/45">
                    {item.fileState === "READY"
                      ? "当前批次已冻结并完成文件生成。"
                      : item.fileState === "MISSING_FILE"
                        ? "当前批次已冻结快照，但文件缺失，可在此重生成。"
                        : "当前批次属于历史兼容记录，后续 backfill 前不支持重生成。"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManageReporting && item.fileState !== "LEGACY" ? (
                    <form action={regenerateFileAction}>
                      <input type="hidden" name="exportBatchId" value={item.id} />
                      <input
                        type="hidden"
                        name="redirectTo"
                        value={buildPageHref(filters, { page: pagination.page }, basePath, baseSearchParams)}
                      />
                      <button type="submit" className="crm-button crm-button-secondary">
                        {item.fileUrl ? "重生成文件" : "生成文件"}
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              {item.remark ? (
                <div className="mt-4 text-sm leading-7 text-black/60">备注：{item.remark}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        summary={`当前显示 ${pageStart} - ${pageEnd} / 共 ${pagination.totalCount} 个批次`}
        buildHref={(pageNumber) =>
          buildPageHref(filters, { page: pageNumber }, basePath, baseSearchParams)
        }
      />
    </div>
  );
}
