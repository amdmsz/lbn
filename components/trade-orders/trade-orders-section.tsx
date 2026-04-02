import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  formatCurrency,
  getSalesOrderPaymentSchemeLabel,
  getSalesOrderPaymentSchemeVariant,
  getSalesOrderReviewStatusLabel,
  getSalesOrderReviewStatusVariant,
  getShippingFulfillmentStatusLabel,
  getShippingFulfillmentStatusVariant,
  getShippingReportStatusLabel,
} from "@/lib/fulfillment/metadata";
import type { getTradeOrdersPageData, TradeOrderFilters } from "@/lib/trade-orders/queries";

type TradeOrdersData = Awaited<ReturnType<typeof getTradeOrdersPageData>>;
type TradeOrderListItem = TradeOrdersData["items"][number];

function buildPageHref(
  filters: TradeOrderFilters,
  overrides: Partial<TradeOrderFilters> = {},
) {
  const next = {
    ...filters,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.keyword) {
    params.set("keyword", next.keyword);
  }

  if (next.customerKeyword) {
    params.set("customerKeyword", next.customerKeyword);
  }

  if (next.supplierId) {
    params.set("supplierId", next.supplierId);
  }

  if (next.statusView) {
    params.set("statusView", next.statusView);
  }

  if (next.supplierCount) {
    params.set("supplierCount", next.supplierCount);
  }

  if (next.sortBy !== "UPDATED_DESC") {
    params.set("sortBy", next.sortBy);
  }

  if (next.page > 1) {
    params.set("page", String(next.page));
  }

  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

function getTradeStatusLabel(
  value: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED",
) {
  switch (value) {
    case "DRAFT":
      return "草稿";
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已拒绝";
    case "CANCELED":
      return "已取消";
    default:
      return value;
  }
}

function getTradeStatusVariant(
  value: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED",
): StatusBadgeVariant {
  switch (value) {
    case "PENDING_REVIEW":
      return "warning";
    case "APPROVED":
      return "success";
    case "REJECTED":
      return "danger";
    case "DRAFT":
    case "CANCELED":
    default:
      return "neutral";
  }
}

function getStatusViewLabel(value: TradeOrderFilters["statusView"]) {
  switch (value) {
    case "DRAFT":
      return "草稿";
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已拒绝";
    default:
      return "全部状态";
  }
}

function getSupplierCountLabel(value: TradeOrderFilters["supplierCount"]) {
  switch (value) {
    case "1":
      return "1 个 supplier";
    case "2":
      return "2 个 supplier";
    case "3_PLUS":
      return "3 个及以上 supplier";
    default:
      return "全部 supplier 数";
  }
}

function getSortLabel(value: TradeOrderFilters["sortBy"]) {
  switch (value) {
    case "UPDATED_ASC":
      return "最早更新";
    case "CREATED_DESC":
      return "最新创建";
    case "UPDATED_DESC":
    default:
      return "最近更新";
  }
}

function buildCustomerTradeOrderHref(customerId: string, tradeOrderId?: string) {
  const params = new URLSearchParams();
  params.set("tab", "orders");
  params.set("createTradeOrder", "1");

  if (tradeOrderId) {
    params.set("tradeOrderId", tradeOrderId);
  }

  return `/customers/${customerId}?${params.toString()}`;
}

function TradeOrderCard({
  item,
  canCreate,
  canReview,
  redirectTo,
  reviewAction,
}: Readonly<{
  item: TradeOrderListItem;
  canCreate: boolean;
  canReview: boolean;
  redirectTo: string;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
  const canContinueEdit =
    canCreate && (item.tradeStatus === "DRAFT" || item.tradeStatus === "REJECTED");
  const plannedSupplierCount = item.components.length;
  const supplierSummary = item.components.map((component) => component.supplierNameSnapshot);

  return (
    <article className="overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.9)] shadow-[0_10px_22px_rgba(18,24,31,0.04)]">
      <div className="border-b border-black/7 bg-[rgba(247,248,250,0.72)] px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/42">
                交易父单
              </p>
              <StatusBadge
                label={getTradeStatusLabel(item.tradeStatus)}
                variant={getTradeStatusVariant(item.tradeStatus)}
              />
              <StatusBadge
                label={getSalesOrderPaymentSchemeLabel(item.paymentScheme)}
                variant={getSalesOrderPaymentSchemeVariant(item.paymentScheme)}
              />
            </div>
            <h3 className="text-base font-semibold tracking-tight text-black/86">{item.tradeNo}</h3>
            <p className="text-sm text-black/58">
              {item.customer.name} / {item.customer.phone}
            </p>
          </div>
          <div className="text-right text-xs leading-5 text-black/48">
            <div>创建时间：{formatDateTime(item.createdAt)}</div>
            <div>最近更新：{formatDateTime(item.updatedAt)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
              客户与拆单范围
            </p>
            <div className="mt-2 space-y-1.5 text-sm leading-6 text-black/68">
              <div>负责人：{item.customer.owner?.name || item.customer.owner?.username || "未分配"}</div>
              <div>收件人：{item.receiverNameSnapshot}</div>
              <div>联系电话：{item.receiverPhoneSnapshot}</div>
              <div>SKU 行数：{item.items.length}</div>
              <div>supplier 数：{plannedSupplierCount}</div>
            </div>
            {supplierSummary.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {supplierSummary.map((supplierName) => (
                  <span
                    key={`${item.id}-${supplierName}`}
                    className="rounded-full border border-black/8 bg-white/76 px-3 py-1 text-[11px] text-black/60"
                  >
                    {supplierName}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.72)] px-3.5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
              金额摘要
            </p>
            <div className="mt-2 space-y-1.5 text-sm leading-6 text-black/68">
              <div>成交金额：{formatCurrency(item.finalAmount)}</div>
              <div>已录金额：{formatCurrency(item.collectedAmount)}</div>
              <div>待收金额：{formatCurrency(item.remainingAmount)}</div>
              <div>定金：{formatCurrency(item.depositAmount)}</div>
              <div>COD：{formatCurrency(item.codAmount)}</div>
            </div>
          </div>
        </div>

        <div className="rounded-[0.95rem] border border-black/7 bg-white/72 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                商品明细
              </p>
              <p className="mt-1 text-xs text-black/52">
                当前阶段只承接多 SKU 直售写路径，父单列表这里直接展示成交行快照与拆单结果。
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.items.map((tradeItem) => (
              <div
                key={tradeItem.id}
                className="rounded-full border border-black/8 bg-[rgba(247,248,250,0.85)] px-3 py-1.5 text-xs text-black/62"
              >
                {tradeItem.titleSnapshot || tradeItem.productNameSnapshot || "SKU"} × {tradeItem.qty}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[0.95rem] border border-black/7 bg-white/72 px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                供应商子单
              </p>
              <p className="mt-1 text-xs text-black/52">
                新入口统一优先父单。旧子单详情保留兼容访问，但已经降为执行层次级入口。
              </p>
            </div>
          </div>
          {item.salesOrders.length > 0 ? (
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {item.salesOrders.map((salesOrder) => (
                <div
                  key={salesOrder.id}
                  className="rounded-[0.95rem] border border-black/8 bg-[rgba(249,250,252,0.74)] px-3.5 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-black/82">
                        {item.tradeNo} / {salesOrder.subOrderNo || salesOrder.orderNo}
                      </div>
                      <div className="text-xs text-black/48">{salesOrder.supplier.name}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        label={getSalesOrderReviewStatusLabel(salesOrder.reviewStatus)}
                        variant={getSalesOrderReviewStatusVariant(salesOrder.reviewStatus)}
                      />
                      {salesOrder.shippingTask ? (
                        <StatusBadge
                          label={getShippingFulfillmentStatusLabel(
                            salesOrder.shippingTask.shippingStatus,
                          )}
                          variant={getShippingFulfillmentStatusVariant(
                            salesOrder.shippingTask.shippingStatus,
                          )}
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1.5 text-xs leading-5 text-black/58">
                    <div>子单金额：{formatCurrency(salesOrder.finalAmount)}</div>
                    <div>待收金额：{formatCurrency(salesOrder.remainingAmount)}</div>
                    <div>COD：{formatCurrency(salesOrder.codAmount)}</div>
                    <div>
                      发货摘要：
                      {salesOrder.shippingTask
                        ? `${getShippingReportStatusLabel(
                            salesOrder.shippingTask.reportStatus,
                          )} / ${getShippingFulfillmentStatusLabel(
                            salesOrder.shippingTask.shippingStatus,
                          )}`
                        : "待父单审核通过"}
                    </div>
                  </div>
                  <div className="mt-3">
                    <Link href={`/orders/${salesOrder.id}`} className="crm-text-link text-xs">
                      打开供应商子单详情
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-[0.95rem] border border-dashed border-black/10 bg-[rgba(249,250,252,0.64)] px-4 py-3 text-sm leading-6 text-black/55">
              当前仍是草稿或尚未提交审核，系统已根据 SKU 的 supplier 生成拆单预期，但还未物化
              SalesOrder 子单。
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Link href={`/orders/${item.id}`} className="crm-button crm-button-primary">
              打开父单详情
            </Link>
            {canContinueEdit ? (
              <Link
                href={buildCustomerTradeOrderHref(item.customer.id, item.id)}
                className="crm-button crm-button-secondary"
              >
                回到客户详情继续编辑
              </Link>
            ) : null}
          </div>

          {canReview && item.tradeStatus === "PENDING_REVIEW" ? (
            <div className="grid gap-3 md:grid-cols-2">
              <form
                action={reviewAction}
                className="rounded-[0.95rem] border border-black/8 bg-white/74 px-3.5 py-3"
              >
                <input type="hidden" name="tradeOrderId" value={item.id} />
                <input type="hidden" name="reviewStatus" value="APPROVED" />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <p className="text-xs leading-5 text-black/55">
                  审核通过后才统一初始化 supplier 子单的 shipping / payment artifacts。
                </p>
                <button type="submit" className="crm-button crm-button-primary mt-3 w-full">
                  审核通过
                </button>
              </form>

              <form
                action={reviewAction}
                className="rounded-[0.95rem] border border-black/8 bg-white/74 px-3.5 py-3"
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
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function TradeOrdersSection({
  items,
  filters,
  suppliers,
  pagination,
  canCreate,
  canReview,
  reviewAction,
}: Readonly<{
  items: TradeOrdersData["items"];
  filters: TradeOrdersData["filters"];
  suppliers: TradeOrdersData["suppliers"];
  pagination: TradeOrdersData["pagination"];
  canCreate: boolean;
  canReview: boolean;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
  const currentPageHref = buildPageHref(filters, { page: pagination.page });

  return (
    <div className="space-y-6">
      <div className="crm-filter-panel">
        <form method="get" className="grid gap-3 xl:grid-cols-6">
          <label className="space-y-2 xl:col-span-2">
            <span className="crm-label">父单 / 子单 / supplier 检索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className="crm-input"
              placeholder="tradeNo / subOrderNo / supplier / 收件人 / 手机号"
            />
          </label>

          <label className="space-y-2 xl:col-span-1">
            <span className="crm-label">客户</span>
            <input
              name="customerKeyword"
              defaultValue={filters.customerKeyword}
              className="crm-input"
              placeholder="客户名 / 客户手机号"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">状态视图</span>
            <select name="statusView" defaultValue={filters.statusView} className="crm-select">
              <option value="">全部状态</option>
              <option value="DRAFT">草稿</option>
              <option value="PENDING_REVIEW">待审核</option>
              <option value="APPROVED">已审核</option>
              <option value="REJECTED">已拒绝</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">supplier 数</span>
            <select name="supplierCount" defaultValue={filters.supplierCount} className="crm-select">
              <option value="">全部 supplier 数</option>
              <option value="1">1 个 supplier</option>
              <option value="2">2 个 supplier</option>
              <option value="3_PLUS">3 个及以上 supplier</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">更新时间</span>
            <select name="sortBy" defaultValue={filters.sortBy} className="crm-select">
              <option value="UPDATED_DESC">最近更新</option>
              <option value="UPDATED_ASC">最早更新</option>
              <option value="CREATED_DESC">最新创建</option>
            </select>
          </label>

          <label className="space-y-2 xl:col-span-2">
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

          <div className="crm-filter-actions xl:col-span-4 xl:justify-end">
            <button type="submit" className="crm-button crm-button-primary">
              应用筛选
            </button>
            <Link href="/orders" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>
      </div>

      {filters.statusView === "DRAFT" ? (
        <div className="rounded-[0.95rem] border border-[#F59E0B]/20 bg-[rgba(255,248,235,0.92)] px-4 py-3.5 text-sm text-black/68">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium text-black/82">草稿视图</div>
              <div className="text-xs leading-5 text-black/56">
                这里优先看尚未提审或被驳回后仍需继续编辑的父单。销售可直接回到客户详情继续修改。
              </div>
            </div>
            {canCreate ? (
              <Link href="/customers" className="crm-button crm-button-secondary">
                返回客户中心继续建单
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-black/60">
            <div>
              共 {pagination.totalCount} 张父单，当前第 {pagination.page} / {pagination.totalPages} 页
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-black/52">
              <span>状态：{getStatusViewLabel(filters.statusView)}</span>
              <span>supplier 数：{getSupplierCountLabel(filters.supplierCount)}</span>
              <span>排序：{getSortLabel(filters.sortBy)}</span>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <TradeOrderCard
                key={item.id}
                item={item}
                canCreate={canCreate}
                canReview={canReview}
                redirectTo={currentPageHref}
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
            buildHref={(pageNumber) => buildPageHref(filters, { page: pageNumber })}
          />
        </div>
      ) : (
        <EmptyState
          title="暂无成交父单"
          description="当前筛选条件下没有匹配的 TradeOrder。新建单入口仍在客户详情，这里负责父单列表、审核协同和 supplier 子单关系回看。"
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
