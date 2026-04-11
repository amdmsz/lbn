import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
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

const DESKTOP_COLUMNS =
  "xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1.05fr)_minmax(0,1.1fr)]";

const tradeStatusMeta: Record<
  TradeOrderItem["tradeStatus"],
  { label: string; variant: StatusBadgeVariant }
> = {
  DRAFT: { label: "草稿", variant: "neutral" },
  PENDING_REVIEW: { label: "待审核", variant: "warning" },
  APPROVED: { label: "已审核", variant: "success" },
  REJECTED: { label: "已驳回", variant: "danger" },
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
    return buildFulfillmentShippingHref({
      keyword: item.tradeNo,
      stageView: "PENDING_REPORT",
    });
  }

  if (summary.pendingTrackingSubOrderCount > 0) {
    return buildFulfillmentShippingHref({
      keyword: item.tradeNo,
      stageView: "PENDING_TRACKING",
    });
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

function getOwnerLabel(item: TradeOrderItem) {
  return item.customer.owner?.name || item.customer.owner?.username || "未分配";
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
  const subOrderCount = item.executionSummary?.totalSubOrderCount ?? item.salesOrders.length;
  const continueEditHref =
    canCreate && (item.tradeStatus === "DRAFT" || item.tradeStatus === "REJECTED")
      ? `/customers/${item.customer.id}?tab=orders&createTradeOrder=1&tradeOrderId=${item.id}`
      : null;
  const latestBatchLabel = item.latestExportBatch
    ? item.latestExportBatch.exportNo
    : "暂无批次";

  const fulfillmentSummary = [
    {
      label: "待报单",
      count: item.executionSummary?.pendingReportSubOrderCount ?? 0,
      variant: "neutral" as const,
    },
    {
      label: "待物流",
      count: item.executionSummary?.pendingTrackingSubOrderCount ?? 0,
      variant: "warning" as const,
    },
    {
      label: "已发货",
      count: item.executionSummary?.shippedSubOrderCount ?? 0,
      variant: "success" as const,
    },
    {
      label: "异常",
      count: item.executionSummary?.exceptionSubOrderCount ?? 0,
      variant:
        (item.executionSummary?.exceptionSubOrderCount ?? 0) > 0
          ? ("danger" as const)
          : ("neutral" as const),
    },
  ];

  return (
    <article className="overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.94)] shadow-[0_8px_20px_rgba(18,24,31,0.04)]">
      <div className="flex flex-col gap-3 border-b border-black/7 bg-[rgba(251,252,253,0.94)] px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold tracking-tight text-black/86">
              {item.tradeNo}
            </h3>
            <StatusBadge
              label={tradeStatusMeta[item.tradeStatus].label}
              variant={tradeStatusMeta[item.tradeStatus].variant}
            />
            <StatusBadge label={`子单 ${subOrderCount}`} variant="neutral" />
            {(item.executionSummary?.exceptionSubOrderCount ?? 0) > 0 ? (
              <StatusBadge
                label={`异常 ${item.executionSummary?.exceptionSubOrderCount ?? 0}`}
                variant="danger"
              />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-black/50">
            <span>客户 {item.customer.name}</span>
            <span>销售 {getOwnerLabel(item)}</span>
            <span>下单 {formatDateTime(item.createdAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="rounded-[0.9rem] border border-black/7 bg-[rgba(247,248,250,0.76)] px-3 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
              成交金额
            </p>
            <p className="mt-1 text-[1.02rem] font-semibold tracking-tight text-black/86">
              {formatCurrency(item.finalAmount)}
            </p>
            <p className="text-xs text-black/52">
              待收 {formatCurrency(item.remainingAmount)}
            </p>
          </div>

          <Link
            href={`/orders/${item.id}`}
            className="inline-flex min-h-0 items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/76 transition hover:border-black/18 hover:bg-[rgba(247,248,250,0.96)]"
          >
            查看详情
          </Link>

          {canReview ? (
            <Link
              href={shippingHref}
              className="inline-flex min-h-0 items-center rounded-full border border-[rgba(54,95,135,0.14)] bg-[rgba(244,248,252,0.92)] px-3 py-1.5 text-xs font-medium text-[var(--color-info)] transition hover:border-[rgba(54,95,135,0.22)] hover:bg-white"
            >
              发货执行
            </Link>
          ) : null}

          <details className="relative">
            <summary className="inline-flex cursor-pointer list-none items-center rounded-full border border-black/10 bg-[rgba(247,248,250,0.82)] px-3 py-1.5 text-xs font-medium text-black/62 transition hover:border-black/18 hover:bg-white">
              更多
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-40 rounded-[0.9rem] border border-black/8 bg-white/96 p-1.5 shadow-[0_12px_28px_rgba(18,24,31,0.10)]">
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
        </div>
      </div>

      <div
        className={cn(
          "grid gap-px bg-black/6 md:grid-cols-2 xl:grid-cols-none xl:grid",
          DESKTOP_COLUMNS,
        )}
      >
        <div className="bg-white/98 px-4 py-3">
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
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-black/50">
              <span>SKU {item.items.length}</span>
              <span>件数 {totalQty}</span>
              <span>最近批次 {latestBatchLabel}</span>
            </div>
            {product.rest > 0 ? (
              <div className="text-xs text-black/48">其余 {product.rest} 项商品已收起</div>
            ) : null}
          </div>
        </div>

        <div className="bg-white/98 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={getSalesOrderPaymentSchemeLabel(item.paymentScheme)}
              variant={getSalesOrderPaymentSchemeVariant(item.paymentScheme)}
            />
            <StatusBadge label={`已收 ${formatCurrency(item.collectedAmount)}`} variant="neutral" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {fulfillmentSummary.map((entry) => (
              <div
                key={entry.label}
                className="rounded-[0.78rem] border border-black/8 bg-[rgba(247,248,250,0.86)] px-2.5 py-2"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/42">
                  {entry.label}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-semibold text-black/82">{entry.count}</span>
                  <StatusBadge label={entry.label} variant={entry.variant} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/98 px-4 py-3">
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
      </div>

      {canReview && item.tradeStatus === "PENDING_REVIEW" ? (
        <details className="border-t border-black/7 bg-[rgba(247,248,250,0.72)]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
                Review
              </p>
              <p className="text-sm text-black/64">待审核父单，展开后处理通过或驳回。</p>
            </div>
            <span className="inline-flex min-h-0 items-center rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-black/62">
              展开审核
            </span>
          </summary>

          <div className="grid gap-3 px-4 pb-4 lg:grid-cols-2">
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
        </details>
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
      <SectionCard
        eyebrow="Parent-Order Workbench"
        title="父单工作池"
        description="按焦点切换和筛选条组织当前父单池。先确定审核与履约关注范围，再进入更轻的父单总览列表。"
        density="compact"
        actions={
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge
              label={`待审核 ${summary.focusCounts.pendingReview}`}
              variant={summary.focusCounts.pendingReview > 0 ? "warning" : "neutral"}
            />
            <StatusBadge
              label={`已审核 ${summary.focusCounts.approved}`}
              variant="success"
            />
            <StatusBadge
              label={`异常 ${summary.focusCounts.exception}`}
              variant={summary.focusCounts.exception > 0 ? "danger" : "neutral"}
            />
          </div>
        }
      >
        <div className="space-y-4">
          <RecordTabs activeValue={activeFocusView} items={tabs} />

          <form
            method="get"
            className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_11rem_11rem_11rem_11rem_auto]"
          >
            {Object.entries(baseSearchParams ?? {}).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
            <input type="hidden" name="focusView" value={activeFocusView} />

            <label className="space-y-1.5 xl:col-span-2">
              <span className="crm-label">父单搜索</span>
              <input
                name="keyword"
                defaultValue={filters.keyword}
                className="crm-input"
                placeholder="tradeNo / subOrderNo / supplier / 收件人 / 手机"
              />
            </label>

            <label className="space-y-1.5">
              <span className="crm-label">客户搜索</span>
              <input
                name="customerKeyword"
                defaultValue={filters.customerKeyword}
                className="crm-input"
                placeholder="客户名 / 手机"
              />
            </label>

            <label className="space-y-1.5">
              <span className="crm-label">审核状态</span>
              <select name="statusView" defaultValue={filters.statusView} className="crm-select">
                <option value="">全部审核状态</option>
                <option value="DRAFT">草稿</option>
                <option value="PENDING_REVIEW">待审核</option>
                <option value="APPROVED">已审核</option>
                <option value="REJECTED">已驳回</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="crm-label">supplier 数</span>
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
            </label>

            <label className="space-y-1.5">
              <span className="crm-label">排序</span>
              <select name="sortBy" defaultValue={filters.sortBy} className="crm-select">
                <option value="UPDATED_DESC">最近更新</option>
                <option value="UPDATED_ASC">最早更新</option>
                <option value="CREATED_DESC">最新创建</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="crm-label">supplier</span>
              <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
                <option value="">全部 supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

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
      </SectionCard>

      {items.length > 0 ? (
        <SectionCard
          eyebrow="Parent-Order List"
          title="父单总览"
          description="把状态、金额、履约摘要、物流与动作拆成更稳定的扫描节奏，次级动作与审核面板渐进展开。"
          density="compact"
          actions={
            <div className="flex flex-wrap gap-2 text-xs text-black/52">
              <span>共 {pagination.totalCount} 张父单</span>
              <span>审核 {filters.statusView || "全部"}</span>
              <span>supplier 数 {filters.supplierCount || "全部"}</span>
              <span>排序 {filters.sortBy}</span>
            </div>
          }
        >
          <div className="space-y-3.5">
            <div
              className={cn(
                "hidden gap-px overflow-hidden rounded-[0.92rem] border border-black/8 bg-black/7 xl:grid",
                DESKTOP_COLUMNS,
              )}
            >
              {["父单与商品", "履约摘要", "收件与物流"].map((label) => (
                <div
                  key={label}
                  className="bg-[rgba(247,248,250,0.9)] px-4 py-2 text-[11px] font-semibold tracking-[0.08em] text-black/44"
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
        </SectionCard>
      ) : (
        <EmptyState
          title="暂无成交父单"
          description="当前筛选条件下没有记录。"
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
