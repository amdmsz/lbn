import Link from "next/link";
import { SalesOrderForm } from "@/components/sales-orders/sales-order-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
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
  getShippingReportStatusVariant,
  salesOrderPaymentSchemeOptions,
  salesOrderReviewStatusOptions,
} from "@/lib/fulfillment/metadata";
import type { SalesOrderFilters } from "@/lib/sales-orders/queries";

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
};

type SupplierOption = {
  id: string;
  name: string;
};

type SkuOption = {
  id: string;
  skuCode: string;
  skuName: string;
  specText: string;
  unit: string;
  defaultUnitPrice: string;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: string;
  product: {
    id: string;
    name: string;
    supplier: {
      id: string;
      name: string;
    };
  };
};

type SalesOrderItem = {
  id: string;
  orderNo: string;
  tradeOrderId: string | null;
  subOrderNo: string | null;
  reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  paymentScheme:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  listAmount: string;
  dealAmount: string;
  discountAmount: string;
  finalAmount: string;
  depositAmount: string;
  collectedAmount: string;
  remainingAmount: string;
  codAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
  receiverNameSnapshot: string;
  receiverPhoneSnapshot: string;
  createdAt: Date;
  customer: {
    id: string;
    name: string;
    phone: string;
    owner: {
      id: string;
      name: string;
      username: string;
    } | null;
  };
  supplier: {
    id: string;
    name: string;
  };
  tradeOrder: {
    id: string;
    tradeNo: string;
  } | null;
  items: Array<{
    id: string;
    productNameSnapshot: string;
    skuNameSnapshot: string;
    specSnapshot: string;
    qty: number;
    listPriceSnapshot: string;
    dealPriceSnapshot: string;
  }>;
  giftItems: Array<{
    id: string;
    giftName: string;
    qty: number;
  }>;
  shippingTask: {
    id: string;
    reportStatus: "PENDING" | "REPORTED";
    shippingStatus:
      | "PENDING"
      | "READY_TO_SHIP"
      | "SHIPPED"
      | "DELIVERED"
      | "COMPLETED"
      | "CANCELED";
    trackingNumber: string | null;
  } | null;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function buildPageHref(filters: SalesOrderFilters, page: number) {
  const params = new URLSearchParams();

  if (filters.keyword) {
    params.set("keyword", filters.keyword);
  }

  if (filters.supplierId) {
    params.set("supplierId", filters.supplierId);
  }

  if (filters.reviewStatus) {
    params.set("reviewStatus", filters.reviewStatus);
  }

  if (filters.paymentScheme) {
    params.set("paymentScheme", filters.paymentScheme);
  }

  if (filters.createCustomerId) {
    params.set("createCustomerId", filters.createCustomerId);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/orders?${query}` : "/orders";
}

export function SalesOrdersSection({
  items,
  filters,
  createCustomer,
  suppliers,
  skuOptions,
  pagination,
  canCreate,
  canReview,
  saveAction,
  reviewAction,
}: Readonly<{
  items: SalesOrderItem[];
  filters: SalesOrderFilters;
  createCustomer: CustomerOption | null;
  suppliers: SupplierOption[];
  skuOptions: SkuOption[];
  pagination: PaginationData;
  canCreate: boolean;
  canReview: boolean;
  saveAction: (formData: FormData) => Promise<void>;
  reviewAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-6">
      <div className="crm-filter-panel">
        <form
          method="get"
          className="crm-filter-grid xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]"
        >
          {filters.createCustomerId ? (
            <input type="hidden" name="createCustomerId" value={filters.createCustomerId} />
          ) : null}

          <label className="space-y-2">
            <span className="crm-label">订单检索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className="crm-input"
              placeholder="订单号 / 客户姓名 / 手机号 / 当前负责人"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">供货商</span>
            <select name="supplierId" defaultValue={filters.supplierId} className="crm-select">
              <option value="">全部供货商</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">审核状态</span>
            <select name="reviewStatus" defaultValue={filters.reviewStatus} className="crm-select">
              <option value="">全部状态</option>
              {salesOrderReviewStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">收款方案</span>
            <select name="paymentScheme" defaultValue={filters.paymentScheme} className="crm-select">
              <option value="">全部方案</option>
              {salesOrderPaymentSchemeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              筛选
            </button>
            <Link href="/orders" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>
      </div>

      {canCreate ? (
        <section className="crm-section-card">
          <SalesOrderForm
            saveAction={saveAction}
            skuOptions={skuOptions}
            paymentSchemeOptions={salesOrderPaymentSchemeOptions}
            fixedCustomer={createCustomer}
            submitLabel="提交审核"
            helperText={
              createCustomer
                ? `当前从客户详情页为 ${createCustomer.name} 发起下单。订单中心只查询订单本身，不再混入未成交客户。`
                : "订单中心可直接建单，但客户必须远程搜索，避免在大量客户中全量下拉。"
            }
            redirectTo={buildPageHref(filters, pagination.page)}
          />
        </section>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-black/60">
            <span>
              共 {pagination.totalCount} 条销售订单，当前第 {pagination.page} / {pagination.totalPages} 页
            </span>
          </div>

          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>订单 / 客户</th>
                  <th>商品与成交</th>
                  <th>审核 / 收款方案</th>
                  <th>金额摘要</th>
                  <th>发货摘要</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-medium text-black/80">
                        {item.tradeOrder?.tradeNo
                          ? `${item.tradeOrder.tradeNo} / ${item.subOrderNo || item.orderNo}`
                          : item.orderNo}
                      </div>
                      <div className="mt-1 text-xs text-black/45">
                        {item.customer.name} / {item.customer.phone}
                      </div>
                      {item.tradeOrder?.tradeNo ? (
                        <div className="mt-1 text-xs text-black/45">
                          主单：{item.tradeOrder.tradeNo} / 子单：{item.subOrderNo || item.orderNo}
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs text-black/45">
                        当前负责人：
                        {item.customer.owner?.name || item.customer.owner?.username || "未分配"}
                      </div>
                      <div className="mt-1 text-xs text-black/45">
                        供货商：{item.supplier.name}
                      </div>
                      <div className="mt-1 text-xs text-black/45">
                        创建时间：{formatDateTime(item.createdAt)}
                      </div>
                    </td>
                    <td className="text-black/80">
                      <div className="space-y-2">
                        <div className="text-xs text-black/55">
                          {item.items.map((orderItem) => (
                            <div key={orderItem.id}>
                              {orderItem.productNameSnapshot} / {orderItem.skuNameSnapshot} /{" "}
                              {orderItem.specSnapshot} / {orderItem.qty} 件 / 原价{" "}
                              {formatCurrency(orderItem.listPriceSnapshot)} / 成交{" "}
                              {formatCurrency(orderItem.dealPriceSnapshot)}
                            </div>
                          ))}
                        </div>
                        {item.giftItems.length > 0 ? (
                          <div className="text-xs text-black/45">
                            随单赠品：
                            {item.giftItems
                              .map((gift) => `${gift.giftName} x ${gift.qty}`)
                              .join("，")}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <StatusBadge
                          label={getSalesOrderReviewStatusLabel(item.reviewStatus)}
                          variant={getSalesOrderReviewStatusVariant(item.reviewStatus)}
                        />
                        <StatusBadge
                          label={getSalesOrderPaymentSchemeLabel(item.paymentScheme)}
                          variant={getSalesOrderPaymentSchemeVariant(item.paymentScheme)}
                        />
                        <div className="text-xs text-black/45">
                          收件人：{item.receiverNameSnapshot} / {item.receiverPhoneSnapshot}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2 text-xs text-black/55">
                        <div>原价小计：{formatCurrency(item.listAmount)}</div>
                        <div>成交小计：{formatCurrency(item.dealAmount)}</div>
                        <div>优惠金额：{formatCurrency(item.discountAmount)}</div>
                        <div>已收金额：{formatCurrency(item.collectedAmount)}</div>
                        <div>待收金额：{formatCurrency(item.remainingAmount)}</div>
                        <div>代收金额：{formatCurrency(item.codAmount)}</div>
                        <div>
                          保价：{item.insuranceRequired ? "是" : "否"} /{" "}
                          {formatCurrency(item.insuranceAmount)}
                        </div>
                      </div>
                    </td>
                    <td>
                      {item.shippingTask ? (
                        <div className="space-y-2">
                          <StatusBadge
                            label={getShippingReportStatusLabel(item.shippingTask.reportStatus)}
                            variant={getShippingReportStatusVariant(item.shippingTask.reportStatus)}
                          />
                          <StatusBadge
                            label={getShippingFulfillmentStatusLabel(item.shippingTask.shippingStatus)}
                            variant={getShippingFulfillmentStatusVariant(item.shippingTask.shippingStatus)}
                          />
                          <div className="text-xs text-black/45">
                            物流单号：{item.shippingTask.trackingNumber || "未回填"}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm leading-7 text-black/55">
                          订单审核通过后自动进入发货池。
                        </div>
                      )}
                    </td>
                    <td className="min-w-[260px]">
                      <div className="space-y-3">
                        <Link href={`/orders/${item.id}`} className="crm-button crm-button-secondary w-full">
                          查看订单详情
                        </Link>

                        {canReview && item.reviewStatus === "PENDING_REVIEW" ? (
                          <div className="space-y-3 rounded-2xl border border-black/8 bg-white/70 p-3">
                            <form action={reviewAction}>
                              <input type="hidden" name="salesOrderId" value={item.id} />
                              <input type="hidden" name="reviewStatus" value="APPROVED" />
                              <input type="hidden" name="redirectTo" value="/orders" />
                              <button type="submit" className="crm-button crm-button-primary w-full">
                                审核通过
                              </button>
                            </form>

                            <form action={reviewAction} className="space-y-2">
                              <input type="hidden" name="salesOrderId" value={item.id} />
                              <input type="hidden" name="reviewStatus" value="REJECTED" />
                              <input type="hidden" name="redirectTo" value="/orders" />
                              <textarea
                                name="rejectReason"
                                rows={2}
                                required
                                placeholder="填写驳回原因"
                                className="crm-textarea"
                              />
                              <button type="submit" className="crm-button crm-button-secondary w-full">
                                驳回订单
                              </button>
                            </form>
                          </div>
                        ) : item.reviewStatus === "REJECTED" ? (
                          <div className="text-sm leading-7 text-black/55">
                            该订单已驳回，可进入详情页修改并重新提交。
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`本页显示 ${(pagination.page - 1) * pagination.pageSize + 1} - ${Math.min(
              pagination.page * pagination.pageSize,
              pagination.totalCount,
            )} 条销售订单，共 ${pagination.totalCount} 条`}
            buildHref={(pageNumber) => buildPageHref(filters, pageNumber)}
          />
        </div>
      ) : (
        <EmptyState
          title="暂无销售订单"
          description="当前筛选条件下没有匹配的 SalesOrder。订单中心现在只查询订单记录本身，不再展示无订购客户。"
        />
      )}
    </div>
  );
}
