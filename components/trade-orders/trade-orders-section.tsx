import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { RecordTabs } from "@/components/shared/record-tabs";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { TradeOrderLogisticsCell } from "@/components/trade-orders/trade-order-logistics-cell";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  formatCurrency,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderPaymentSchemeVariant,
} from "@/lib/fulfillment/metadata";
import {
  buildFulfillmentBatchesHref,
  buildFulfillmentShippingHref,
} from "@/lib/fulfillment/navigation";
import type { getTradeOrdersPageData, TradeOrderFilters } from "@/lib/trade-orders/queries";
import { cn } from "@/lib/utils";

type TradeOrdersData = Awaited<ReturnType<typeof getTradeOrdersPageData>>;
type TradeOrderItem = TradeOrdersData["items"][number];

const GRID_CLASS =
  "xl:grid-cols-[minmax(0,2.7fr)_minmax(0,0.95fr)_minmax(0,0.72fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.14fr)_minmax(148px,0.82fr)]";

const tradeStatusMeta: Record<
  TradeOrderItem["tradeStatus"],
  { label: string; variant: StatusBadgeVariant }
> = {
  DRAFT: { label: "草稿", variant: "neutral" },
  PENDING_REVIEW: { label: "待审核", variant: "warning" },
  APPROVED: { label: "已审核", variant: "success" },
  REJECTED: { label: "已拒绝", variant: "danger" },
  CANCELED: { label: "已取消", variant: "neutral" },
};

function buildPageHref(
  filters: TradeOrderFilters,
  overrides: Partial<TradeOrderFilters> = {},
  basePath = "/orders",
  baseSearchParams?: Record<string, string>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams(baseSearchParams);
  const entries: Array<[string, string]> = [
    ["keyword", next.keyword],
    ["customerKeyword", next.customerKeyword],
    ["supplierId", next.supplierId],
    ["statusView", next.statusView],
    ["focusView", next.focusView],
    ["supplierCount", next.supplierCount],
  ];

  for (const [key, value] of entries) {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  if (next.sortBy !== "UPDATED_DESC") {
    params.set("sortBy", next.sortBy);
  } else {
    params.delete("sortBy");
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  } else {
    params.delete("page");
  }

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

function getActiveFocusView(filters: TradeOrderFilters) {
  if (filters.focusView) {
    return filters.focusView;
  }

  if (filters.statusView === "PENDING_REVIEW" || filters.statusView === "APPROVED") {
    return filters.statusView;
  }

  return "";
}

function getShippingHref(item: TradeOrderItem) {
  const summary = item.executionSummary;
  if (!summary) {
    return buildFulfillmentShippingHref({ keyword: item.tradeNo });
  }

  if (summary.exceptionSubOrderCount > 0) {
    return buildFulfillmentShippingHref({ keyword: item.tradeNo, stageView: "EXCEPTION" });
  }

  if (summary.pendingReportSubOrderCount > 0) {
    return buildFulfillmentShippingHref({ keyword: item.tradeNo, stageView: "PENDING_REPORT" });
  }

  if (summary.pendingTrackingSubOrderCount > 0) {
    return buildFulfillmentShippingHref({ keyword: item.tradeNo, stageView: "PENDING_TRACKING" });
  }

  return buildFulfillmentShippingHref({ keyword: item.tradeNo, stageView: "SHIPPED" });
}

function getBatchHref(item: TradeOrderItem) {
  return buildFulfillmentBatchesHref({
    keyword: item.latestExportBatch?.exportNo || item.tradeNo,
  });
}

function getTraceTarget(item: TradeOrderItem) {
  const tracked = item.salesOrders.filter(
    (salesOrder) => salesOrder.shippingTask?.trackingNumber?.trim(),
  );

  if (tracked.length === 1 && tracked[0].shippingTask) {
    return tracked[0].shippingTask;
  }

  if (item.salesOrders.length === 1 && item.salesOrders[0].shippingTask) {
    return item.salesOrders[0].shippingTask;
  }

  return null;
}

function getProductSummary(item: TradeOrderItem) {
  const shown = item.items.slice(0, 2);
  const rest = item.items.length - shown.length;

  return {
    lines: shown.map((tradeItem) => ({
      id: tradeItem.id,
      label:
        tradeItem.titleSnapshot ||
        tradeItem.productNameSnapshot ||
        tradeItem.skuNameSnapshot ||
        "未命名商品",
      qty: tradeItem.qty,
      type: tradeItem.itemType,
    })),
    rest,
  };
}

function TradeOrderRow({
  item,
  redirectTo,
  canCreate,
  canReview,
  reviewAction,
}: Readonly<{
  item: TradeOrderItem;
  redirectTo: string;
  canCreate: boolean;
  canReview: boolean;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
  const product = getProductSummary(item);
  const traceTarget = getTraceTarget(item);
  const shippingHref = getShippingHref(item);
  const batchHref = getBatchHref(item);
  const totalQty = item.items.reduce((sum, tradeItem) => sum + tradeItem.qty, 0);
  const continueEditHref =
    canCreate && (item.tradeStatus === "DRAFT" || item.tradeStatus === "REJECTED")
      ? `/customers/${item.customer.id}?tab=orders&createTradeOrder=1&tradeOrderId=${item.id}`
      : null;

  const fulfillmentSummary = [
    ["待报单", item.executionSummary?.pendingReportSubOrderCount ?? 0],
    ["待物流", item.executionSummary?.pendingTrackingSubOrderCount ?? 0],
    ["已发货", item.executionSummary?.shippedSubOrderCount ?? 0],
    ["异常", item.executionSummary?.exceptionSubOrderCount ?? 0],
  ] as const;

  return (
    <article className="overflow-hidden rounded-[0.96rem] border border-black/7 bg-white/94 shadow-[0_8px_20px_rgba(18,24,31,0.04)]">
      <div className="border-b border-black/7 bg-[rgba(247,248,250,0.78)] px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-black/86">
              {item.tradeNo}
            </h3>
            <StatusBadge
              label={tradeStatusMeta[item.tradeStatus].label}
              variant={tradeStatusMeta[item.tradeStatus].variant}
            />
            {item.executionSummary ? (
              <StatusBadge
                label={`子单 ${item.executionSummary.totalSubOrderCount}`}
                variant="neutral"
              />
            ) : null}
          </div>
          <div className="text-xs text-black/48">
            下单 {formatDateTime(item.createdAt)} · 客户 {item.customer.name} · 销售{" "}
            {item.customer.owner?.name || item.customer.owner?.username || "未分配"}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "grid gap-px bg-black/7 md:grid-cols-2 xl:grid-cols-none xl:grid",
          GRID_CLASS,
        )}
      >
        <div className="bg-white/98 px-3 py-2.5">
          <div className="space-y-2">
            {product.lines.map((line) => (
              <div key={line.id} className="flex items-start gap-2">
                <span className="mt-0.5 rounded-full border border-black/8 bg-[rgba(247,248,250,0.88)] px-2 py-0.5 text-[10px] text-black/58">
                  {line.type === "GIFT" ? "赠品" : line.type === "BUNDLE" ? "套餐" : "商品"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-black/84">{line.label}</div>
                  <div className="text-xs text-black/50">x {line.qty}</div>
                </div>
              </div>
            ))}
            {product.rest > 0 ? (
              <div className="text-xs text-black/50">等 {product.rest} 件商品</div>
            ) : null}
          </div>
        </div>

        <div className="bg-white/98 px-3 py-2.5 text-sm text-black/80">
          <div className="font-semibold">{formatCurrency(item.finalAmount)}</div>
          <div className="mt-1 text-xs text-black/56">
            SKU {item.items.length} · 件数 {totalQty}
          </div>
          <div className="text-xs text-black/48">已录 {formatCurrency(item.collectedAmount)}</div>
        </div>

        <div className="bg-white/98 px-3 py-2.5">
          <StatusBadge
            label={(item.executionSummary?.exceptionSubOrderCount ?? 0) > 0 ? "异常跟进" : "暂无售后"}
            variant={(item.executionSummary?.exceptionSubOrderCount ?? 0) > 0 ? "warning" : "neutral"}
          />
          <div className="mt-1 text-xs text-black/52">
            {(item.executionSummary?.exceptionSubOrderCount ?? 0) > 0
              ? `${item.executionSummary?.exceptionSubOrderCount ?? 0} 个子单需关注`
              : "默认不展开解释"}
          </div>
        </div>

        <div className="bg-white/98 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={tradeStatusMeta[item.tradeStatus].label}
              variant={tradeStatusMeta[item.tradeStatus].variant}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] leading-4">
            {fulfillmentSummary.map(([label, count]) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-[0.72rem] border border-black/8 bg-[rgba(247,248,250,0.88)] px-2 py-1 text-black/60"
              >
                <span>{label}</span>
                <span className="font-semibold text-black/74">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/98 px-3 py-2.5">
          <StatusBadge
            label={getSalesOrderPaymentSchemeLabel(item.paymentScheme)}
            variant={getSalesOrderPaymentSchemeVariant(item.paymentScheme)}
          />
          <div className="mt-1 text-xs text-black/56">
            待收 {formatCurrency(item.remainingAmount)}
          </div>
        </div>

        <div className="bg-white/98 px-3 py-2.5">
          <TradeOrderLogisticsCell
            receiverName={item.receiverNameSnapshot}
            receiverPhone={item.receiverPhoneSnapshot}
            receiverAddress={item.receiverAddressSnapshot}
            shippingTaskId={traceTarget?.id}
            shippingProvider={traceTarget?.shippingProvider}
            trackingNumber={traceTarget?.trackingNumber}
            shippingStatus={traceTarget?.shippingStatus}
          />
        </div>

        <div className="flex h-full items-center justify-center bg-white/98 px-3 py-2.5">
          <div className="flex w-full max-w-[8.5rem] flex-col items-center gap-2">
            <Link
              href={`/orders/${item.id}`}
              className="inline-flex min-h-0 items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/76 transition hover:border-black/18 hover:bg-[rgba(247,248,250,0.96)]"
            >
              查看详情
            </Link>

            {canReview ? (
              <>
                <Link
                  href={shippingHref}
                  className="inline-flex min-h-0 items-center rounded-full border border-[rgba(54,95,135,0.14)] bg-[rgba(244,248,252,0.92)] px-3 py-1.5 text-xs font-medium text-[var(--color-info)] transition hover:border-[rgba(54,95,135,0.22)] hover:bg-white"
                >
                  去发货执行
                </Link>

                <details className="relative">
                  <summary className="inline-flex cursor-pointer list-none items-center rounded-full border border-black/10 bg-[rgba(247,248,250,0.82)] px-3 py-1.5 text-xs font-medium text-black/62 transition hover:border-black/18 hover:bg-white">
                    更多
                  </summary>
                  <div className="absolute right-0 z-20 mt-2 w-36 rounded-[0.9rem] border border-black/8 bg-white/96 p-1.5 shadow-[0_12px_28px_rgba(18,24,31,0.10)]">
                    <Link
                      href={batchHref}
                      className="block rounded-[0.75rem] px-3 py-2 text-sm text-black/72 hover:bg-[rgba(247,248,250,0.9)]"
                    >
                      查看批次
                    </Link>
                    {continueEditHref ? (
                      <Link
                        href={continueEditHref}
                        className="block rounded-[0.75rem] px-3 py-2 text-sm text-black/72 hover:bg-[rgba(247,248,250,0.9)]"
                      >
                        继续编辑
                      </Link>
                    ) : null}
                  </div>
                </details>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {canReview && item.tradeStatus === "PENDING_REVIEW" ? (
        <div className="border-t border-black/7 bg-[rgba(247,248,250,0.72)] px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <form
              action={reviewAction}
              className="rounded-[0.95rem] border border-black/8 bg-white/86 px-3.5 py-3"
            >
              <input type="hidden" name="tradeOrderId" value={item.id} />
              <input type="hidden" name="reviewStatus" value="APPROVED" />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <p className="text-xs leading-5 text-black/55">
                审核通过后，父单会进入正式履约与收款执行阶段。
              </p>
              <button type="submit" className="crm-button crm-button-primary mt-3 w-full">
                审核通过
              </button>
            </form>

            <form
              action={reviewAction}
              className="rounded-[0.95rem] border border-black/8 bg-white/86 px-3.5 py-3"
            >
              <input type="hidden" name="tradeOrderId" value={item.id} />
              <input type="hidden" name="reviewStatus" value="REJECTED" />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <textarea
                name="rejectReason"
                rows={3}
                required
                placeholder="填写驳回原因"
                className="crm-textarea"
              />
              <button type="submit" className="crm-button crm-button-secondary mt-3 w-full">
                驳回父单
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function TradeOrdersSection({
  summary,
  items,
  filters,
  suppliers,
  pagination,
  canCreate,
  canReview,
  reviewAction,
  basePath = "/orders",
  baseSearchParams,
}: Readonly<{
  summary: TradeOrdersData["summary"];
  items: TradeOrdersData["items"];
  filters: TradeOrdersData["filters"];
  suppliers: TradeOrdersData["suppliers"];
  pagination: TradeOrdersData["pagination"];
  canCreate: boolean;
  canReview: boolean;
  reviewAction: (formData: FormData) => Promise<void>;
  basePath?: string;
  baseSearchParams?: Record<string, string>;
}>) {
  const activeFocusView = getActiveFocusView(filters);
  const currentPageHref = buildPageHref(
    filters,
    { page: pagination.page },
    basePath,
    baseSearchParams,
  );

  const tabs: Array<{
    value: string;
    label: string;
    count: number;
    href: string;
  }> = [
    { value: "", label: "全部", count: summary.focusCounts.all },
    { value: "PENDING_REVIEW", label: "待审核", count: summary.focusCounts.pendingReview },
    { value: "APPROVED", label: "已审核", count: summary.focusCounts.approved },
    { value: "PENDING_REPORT", label: "待报单", count: summary.focusCounts.pendingReport },
    { value: "PENDING_TRACKING", label: "待物流", count: summary.focusCounts.pendingTracking },
    { value: "SHIPPED", label: "已发货", count: summary.focusCounts.shipped },
    { value: "EXCEPTION", label: "异常", count: summary.focusCounts.exception },
  ].map(({ value, label, count }) => ({
    value,
    label,
    count,
    href: buildPageHref(
      filters,
      {
        focusView: value as TradeOrderFilters["focusView"],
        statusView:
          value === "PENDING_REVIEW" || value === "APPROVED"
            ? (value as TradeOrderFilters["statusView"])
            : "",
        page: 1,
      },
      basePath,
      baseSearchParams,
    ),
  }));

  return (
    <div className="space-y-5">
      <RecordTabs activeValue={activeFocusView} items={tabs} />

      <div className="crm-filter-panel">
        <form
          method="get"
          className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_10rem_10rem_10rem_10rem_auto]"
        >
          {Object.entries(baseSearchParams ?? {}).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <input type="hidden" name="focusView" value={activeFocusView} />
          <input
            name="keyword"
            defaultValue={filters.keyword}
            className="crm-input xl:col-span-2"
            placeholder="tradeNo / subOrderNo / supplier / 收件人 / 手机"
          />
          <input
            name="customerKeyword"
            defaultValue={filters.customerKeyword}
            className="crm-input"
            placeholder="客户名 / 手机"
          />
          <select name="statusView" defaultValue={filters.statusView} className="crm-select">
            <option value="">全部审核态</option>
            <option value="DRAFT">草稿</option>
            <option value="PENDING_REVIEW">待审核</option>
            <option value="APPROVED">已审核</option>
            <option value="REJECTED">已拒绝</option>
          </select>
          <select
            name="supplierCount"
            defaultValue={filters.supplierCount}
            className="crm-select"
          >
            <option value="">全部 supplier 数</option>
            <option value="1">1 个 supplier</option>
            <option value="2">2 个 supplier</option>
            <option value="3_PLUS">3 个以上 supplier</option>
          </select>
          <select name="sortBy" defaultValue={filters.sortBy} className="crm-select">
            <option value="UPDATED_DESC">最近更新</option>
            <option value="UPDATED_ASC">最早更新</option>
            <option value="CREATED_DESC">最新创建</option>
          </select>
          <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
            <option value="">全部 supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <div className="crm-filter-actions xl:col-span-full xl:justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              应用筛选
            </button>
            <Link
              href={buildPageHref(
                {
                  keyword: "",
                  customerKeyword: "",
                  supplierId: "",
                  statusView: "",
                  focusView: "",
                  supplierCount: "",
                  sortBy: "UPDATED_DESC",
                  page: 1,
                },
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

      {items.length > 0 ? (
        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-black/60">
            <div>
              共 {pagination.totalCount} 张父单，当前第 {pagination.page} / {pagination.totalPages} 页
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-black/52">
              <span>审核态：{filters.statusView || "全部"}</span>
              <span>supplier 数：{filters.supplierCount || "全部"}</span>
              <span>排序：{filters.sortBy}</span>
            </div>
          </div>

          <div
            className={cn(
              "hidden gap-px overflow-hidden rounded-[0.92rem] border border-black/8 bg-black/7 xl:grid",
              GRID_CLASS,
            )}
          >
            {[
              "商品信息",
              "金额 / 数量",
              "售后 / 异常",
              "订单状态",
              "支付方式",
              "收货信息",
              "操作",
            ].map((label) => (
              <div
                key={label}
                className="bg-[rgba(247,248,250,0.9)] px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-black/44"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="space-y-2.5">
            {items.map((item) => (
              <TradeOrderRow
                key={item.id}
                item={item}
                redirectTo={currentPageHref}
                canCreate={canCreate}
                canReview={canReview}
                reviewAction={reviewAction}
              />
            ))}
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`本页显示 ${(pagination.page - 1) * pagination.pageSize + 1} - ${Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalCount,
            )} 张父单，共 ${pagination.totalCount} 张`}
            buildHref={(pageNumber) =>
              buildPageHref(filters, { page: pageNumber }, basePath, baseSearchParams)
            }
          />
        </div>
      ) : (
        <EmptyState
          title="暂无成交父单"
          description="当前筛选条件下没有匹配的 TradeOrder。新建单入口仍在客户详情，这里负责父单扫单、审核协同和 supplier 子单关系回看。"
          action={
            canCreate ? (
              <Link href="/customers" className="crm-button crm-button-primary">
                去客户中心建单
              </Link>
            ) : null
          }
        />
      )}
    </div>
  );
}
