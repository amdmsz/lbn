import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricCard } from "@/components/shared/metric-card";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  getPaymentCollectionChannelLabel,
  getPaymentPlanStageLabel,
  getPaymentPlanStatusLabel,
  getPaymentPlanStatusVariant,
  getPaymentPlanSubjectLabel,
  getPaymentPlanSubjectVariant,
  getPaymentRecordChannelLabel,
  getPaymentRecordStatusLabel,
  getPaymentRecordStatusVariant,
  getPaymentSourceLabel,
  paymentRecordChannelOptions,
  paymentRecordStatusOptions,
} from "@/lib/payments/metadata";
import type { FinancePaymentsFilters } from "@/lib/finance/queries";

type FinanceCard = {
  label: string;
  value: string;
  note: string;
  href?: string;
};

type SalesOption = {
  id: string;
  name: string;
  username: string;
};

type FinancePaymentsItem = {
  id: string;
  sourceType: "SALES_ORDER" | "GIFT_RECORD";
  amount: string;
  channel:
    | "ORDER_FORM_DECLARED"
    | "BANK_TRANSFER"
    | "WECHAT_TRANSFER"
    | "ALIPAY_TRANSFER"
    | "COD"
    | "CASH"
    | "OTHER";
  status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
  occurredAt: Date;
  referenceNo: string | null;
  remark: string | null;
  createdAt: Date;
  paymentPlan: {
    id: string;
    subjectType: "GOODS" | "FREIGHT";
    stageType: "FULL" | "DEPOSIT" | "BALANCE";
    collectionChannel: "PREPAID" | "COD";
    plannedAmount: string;
    confirmedAmount: string;
    remainingAmount: string;
    status: "PENDING" | "SUBMITTED" | "PARTIALLY_COLLECTED" | "COLLECTED" | "CANCELED";
  };
  salesOrder: {
    id: string;
    orderNo: string;
  } | null;
  giftRecord: {
    id: string;
    giftName: string;
  } | null;
  customer: {
    id: string;
    name: string;
    phone: string;
  } | null;
  salesOwner: {
    id: string;
    name: string;
    username: string;
  } | null;
  shippingTask: {
    id: string;
    shippingStatus: string;
    trackingNumber: string | null;
  } | null;
  submittedBy: {
    id: string;
    name: string;
    username: string;
  };
  confirmedBy: {
    id: string;
    name: string;
    username: string;
  } | null;
};

type PaginationData = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

function buildPageHref(filters: FinancePaymentsFilters, page: number) {
  const params = new URLSearchParams();

  if (filters.orderNo) {
    params.set("orderNo", filters.orderNo);
  }

  if (filters.customerKeyword) {
    params.set("customerKeyword", filters.customerKeyword);
  }

  if (filters.salesId) {
    params.set("salesId", filters.salesId);
  }

  if (filters.channel) {
    params.set("channel", filters.channel);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.occurredFrom) {
    params.set("occurredFrom", filters.occurredFrom);
  }

  if (filters.occurredTo) {
    params.set("occurredTo", filters.occurredTo);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/finance/payments?${query}` : "/finance/payments";
}

export function FinancePaymentsSection({
  scopeLabel,
  summaryCards,
  items,
  filters,
  salesOptions,
  pagination,
}: Readonly<{
  scopeLabel: string;
  summaryCards: FinanceCard[];
  items: FinancePaymentsItem[];
  filters: FinancePaymentsFilters;
  salesOptions: SalesOption[];
  pagination: PaginationData;
}>) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {summaryCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} note={card.note} href={card.href} />
        ))}
      </div>

      <div className="crm-filter-panel">
        <form
          method="get"
          className="crm-filter-grid xl:grid-cols-[repeat(3,minmax(0,1fr))_repeat(4,minmax(0,1fr))_auto]"
        >
          <label className="space-y-2">
            <span className="crm-label">订单编号</span>
            <input
              name="orderNo"
              defaultValue={filters.orderNo}
              className="crm-input"
              placeholder="按销售订单编号筛选"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">客户</span>
            <input
              name="customerKeyword"
              defaultValue={filters.customerKeyword}
              className="crm-input"
              placeholder="客户名或手机号"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">销售</span>
            <select name="salesId" defaultValue={filters.salesId} className="crm-select">
              <option value="">全部销售</option>
              {salesOptions.map((sales) => (
                <option key={sales.id} value={sales.id}>
                  {sales.name || sales.username}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">收款渠道</span>
            <select name="channel" defaultValue={filters.channel} className="crm-select">
              <option value="">全部渠道</option>
              {paymentRecordChannelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">收款状态</span>
            <select name="status" defaultValue={filters.status} className="crm-select">
              <option value="">全部状态</option>
              {paymentRecordStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">开始日期</span>
            <input
              type="date"
              name="occurredFrom"
              defaultValue={filters.occurredFrom}
              className="crm-input"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">结束日期</span>
            <input
              type="date"
              name="occurredTo"
              defaultValue={filters.occurredTo}
              className="crm-input"
            />
          </label>

          <div className="crm-filter-actions">
            <button type="submit" className="crm-button crm-button-primary">
              筛选
            </button>
            <Link href="/finance/payments" className="crm-button crm-button-secondary">
              重置
            </Link>
          </div>
        </form>
      </div>

      {items.length > 0 ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-black/60">
            <span>
              共 {pagination.totalCount} 条收款记录，当前第 {pagination.page} / {pagination.totalPages} 页
            </span>
            <StatusBadge label={scopeLabel} variant="info" />
          </div>

          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>来源</th>
                  <th>客户</th>
                  <th>销售</th>
                  <th>收款记录</th>
                  <th>计划口径</th>
                  <th>轨迹</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-medium text-black/82">
                        {item.salesOrder?.orderNo || item.giftRecord?.giftName || getPaymentSourceLabel(item.sourceType)}
                      </div>
                      <div className="mt-1 text-xs text-black/45">
                        {getPaymentSourceLabel(item.sourceType)}
                      </div>
                      {item.salesOrder ? (
                        <Link href={`/orders/${item.salesOrder.id}`} className="crm-text-link text-xs">
                          查看订单
                        </Link>
                      ) : item.customer ? (
                        <Link
                          href={`/customers/${item.customer.id}?tab=gifts`}
                          className="crm-text-link text-xs"
                        >
                          查看礼品链路
                        </Link>
                      ) : null}
                    </td>
                    <td>
                      <div className="space-y-1 text-sm text-black/70">
                        <div>{item.customer?.name || "无客户"}</div>
                        <div className="text-xs text-black/45">{item.customer?.phone || "-"}</div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-1 text-sm text-black/70">
                        <div>{item.salesOwner?.name || item.salesOwner?.username || "未指派"}</div>
                        <div className="text-xs text-black/45">
                          提交人：{item.submittedBy.name || item.submittedBy.username}
                        </div>
                        <div className="text-xs text-black/45">
                          确认人：{item.confirmedBy?.name || item.confirmedBy?.username || "待确认"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge
                            label={getPaymentRecordStatusLabel(item.status)}
                            variant={getPaymentRecordStatusVariant(item.status)}
                          />
                        </div>
                        <div className="text-xs text-black/45">
                          金额：{formatCurrency(item.amount)}
                        </div>
                        <div className="text-xs text-black/45">
                          渠道：{getPaymentRecordChannelLabel(item.channel)}
                        </div>
                        <div className="text-xs text-black/45">
                          收款时间：{formatDateTime(item.occurredAt)}
                        </div>
                        <div className="text-xs text-black/45">
                          流水号：{item.referenceNo || "无"}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge
                            label={getPaymentPlanSubjectLabel(item.paymentPlan.subjectType)}
                            variant={getPaymentPlanSubjectVariant(item.paymentPlan.subjectType)}
                          />
                          <StatusBadge
                            label={getPaymentPlanStatusLabel(item.paymentPlan.status)}
                            variant={getPaymentPlanStatusVariant(item.paymentPlan.status)}
                          />
                        </div>
                        <div className="text-xs text-black/45">
                          {getPaymentPlanStageLabel(item.paymentPlan.stageType)} /{" "}
                          {getPaymentCollectionChannelLabel(item.paymentPlan.collectionChannel)}
                        </div>
                        <div className="text-xs text-black/45">
                          计划：{formatCurrency(item.paymentPlan.plannedAmount)}
                        </div>
                        <div className="text-xs text-black/45">
                          已确认：{formatCurrency(item.paymentPlan.confirmedAmount)}
                        </div>
                        <div className="text-xs text-black/45">
                          待收：{formatCurrency(item.paymentPlan.remainingAmount)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2 text-sm text-black/60">
                        <div>创建：{formatDateTime(item.createdAt)}</div>
                        <div>备注：{item.remark || "无"}</div>
                        {item.shippingTask ? (
                          <div className="text-xs text-black/45">
                            发货：{item.shippingTask.shippingStatus} /{" "}
                            {item.shippingTask.trackingNumber || "未回填物流单号"}
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
            )} 条，共 ${pagination.totalCount} 条收款记录`}
            buildHref={(pageNumber) => buildPageHref(filters, pageNumber)}
          />
        </div>
      ) : (
        <EmptyState
          title="暂无财务收款记录"
          description="当前筛选条件下没有匹配的 PaymentRecord。你可以放宽日期、销售或订单编号条件后重试。"
        />
      )}
    </div>
  );
}
