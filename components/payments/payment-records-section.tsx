import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import {
  getPaymentCollectionChannelLabel,
  getPaymentPlanProgressSummary,
  getPaymentPlanStageLabel,
  getPaymentPlanStageVariant,
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
  paymentSourceOptions,
} from "@/lib/payments/metadata";
import type { PaymentRecordFilters } from "@/lib/payments/queries";

type PaymentRecordItem = {
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
    submittedAmount: string;
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
  owner: {
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

function buildPageHref(filters: PaymentRecordFilters, page: number) {
  const params = new URLSearchParams();

  if (filters.keyword) {
    params.set("keyword", filters.keyword);
  }

  if (filters.sourceType) {
    params.set("sourceType", filters.sourceType);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.channel) {
    params.set("channel", filters.channel);
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
  return query ? `/payment-records?${query}` : "/payment-records";
}

export function PaymentRecordsSection({
  items,
  filters,
  pagination,
  canConfirmPaymentRecord,
  reviewPaymentRecordAction,
}: Readonly<{
  items: PaymentRecordItem[];
  filters: PaymentRecordFilters;
  pagination: PaginationData;
  canConfirmPaymentRecord: boolean;
  reviewPaymentRecordAction: (formData: FormData) => Promise<void>;
}>) {
  return (
    <div className="space-y-6">
      <div className="crm-filter-panel">
        <form
          method="get"
          className="crm-filter-grid xl:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))_auto]"
        >
          <label className="space-y-2">
            <span className="crm-label">搜索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className="crm-input"
              placeholder="订单号 / 礼品 / 客户 / 手机号 / 负责人 / 流水号"
            />
          </label>

          <label className="space-y-2">
            <span className="crm-label">来源</span>
            <select name="sourceType" defaultValue={filters.sourceType} className="crm-select">
              <option value="">全部来源</option>
              {paymentSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="crm-label">状态</span>
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
            <span className="crm-label">渠道</span>
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
            <Link href="/payment-records" className="crm-button crm-button-secondary">
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
          </div>

          <div className="crm-table-shell">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>来源</th>
                  <th>客户与负责人</th>
                  <th>计划</th>
                  <th>记录</th>
                  <th>审核</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="font-medium text-black/80">
                        {getPaymentSourceLabel(item.sourceType)}
                      </div>
                      <div className="mt-1 text-xs text-black/45">
                        {item.salesOrder ? `订单 ${item.salesOrder.orderNo}` : item.giftRecord?.giftName}
                      </div>
                      {item.salesOrder ? (
                        <Link href={`/orders/${item.salesOrder.id}`} className="crm-text-link text-xs">
                          查看订单
                        </Link>
                      ) : null}
                    </td>
                    <td>
                      <div className="space-y-1 text-sm text-black/70">
                        <div>
                          {item.customer?.name || "无客户"} / {item.customer?.phone || "-"}
                        </div>
                        <div className="text-xs text-black/45">
                          负责人：{item.owner?.name || item.owner?.username || "未指派"}
                        </div>
                        <div className="text-xs text-black/45">
                          提交人：{item.submittedBy.name || item.submittedBy.username}
                        </div>
                        {item.shippingTask ? (
                          <div className="text-xs text-black/45">
                            发货：{item.shippingTask.shippingStatus} /{" "}
                            {item.shippingTask.trackingNumber || "未回填单号"}
                          </div>
                        ) : null}
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
                            label={getPaymentPlanStageLabel(item.paymentPlan.stageType)}
                            variant={getPaymentPlanStageVariant(item.paymentPlan.stageType)}
                          />
                          <StatusBadge
                            label={getPaymentPlanStatusLabel(item.paymentPlan.status)}
                            variant={getPaymentPlanStatusVariant(item.paymentPlan.status)}
                          />
                        </div>
                        <div className="text-xs text-black/45">
                          {getPaymentCollectionChannelLabel(item.paymentPlan.collectionChannel)}
                        </div>
                        <div className="text-xs text-black/45">
                          {getPaymentPlanProgressSummary(item.paymentPlan)}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="space-y-2">
                        <StatusBadge
                          label={getPaymentRecordStatusLabel(item.status)}
                          variant={getPaymentRecordStatusVariant(item.status)}
                        />
                        <div className="text-xs text-black/45">
                          {getPaymentRecordChannelLabel(item.channel)}
                        </div>
                        <div className="text-xs text-black/45">
                          金额：{formatCurrency(item.amount)}
                        </div>
                        <div className="text-xs text-black/45">
                          收款时间：{formatDateTime(item.occurredAt)}
                        </div>
                        <div className="text-xs text-black/45">
                          流水号：{item.referenceNo || "无"}
                        </div>
                        <div className="text-xs text-black/45">备注：{item.remark || "无"}</div>
                      </div>
                    </td>
                    <td className="min-w-[260px]">
                      {canConfirmPaymentRecord && item.status === "SUBMITTED" ? (
                        <form action={reviewPaymentRecordAction} className="space-y-3">
                          <input type="hidden" name="paymentRecordId" value={item.id} />
                          <input
                            type="hidden"
                            name="redirectTo"
                            value={buildPageHref(filters, pagination.page)}
                          />
                          <select name="status" defaultValue="CONFIRMED" className="crm-select">
                            <option value="CONFIRMED">确认通过</option>
                            <option value="REJECTED">驳回</option>
                          </select>
                          <textarea
                            name="remark"
                            rows={2}
                            placeholder="填写审核备注"
                            className="crm-textarea"
                          />
                          <button type="submit" className="crm-button crm-button-secondary w-full">
                            保存审核结果
                          </button>
                        </form>
                      ) : (
                        <div className="space-y-2 text-sm leading-7 text-black/55">
                          <div>
                            确认人：{item.confirmedBy?.name || item.confirmedBy?.username || "待确认"}
                          </div>
                          <div>创建时间：{formatDateTime(item.createdAt)}</div>
                        </div>
                      )}
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
          title="暂无收款记录"
          description="当前筛选条件下没有匹配的收款记录。"
        />
      )}
    </div>
  );
}
