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

const paymentFilterLabelClassName =
  "text-xs font-semibold uppercase tracking-widest text-muted-foreground";

const paymentFilterControlClassName =
  "w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const paymentPrimaryButtonClassName =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const paymentResetButtonClassName =
  "inline-flex items-center justify-center rounded-lg border border-border/60 bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground";

const paymentTableHeaderCellClassName =
  "border-b border-border/40 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-muted-foreground first:pl-5 last:pr-5";

const paymentTableCellClassName =
  "border-b border-border/40 px-4 py-4 align-top first:pl-5 last:pr-5";

const paymentAuditSelectClassName =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const paymentAuditTextareaClassName =
  "w-full resize-none rounded-md border border-border/60 bg-background p-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20";

const paymentAuditSubmitClassName =
  "mt-2 self-end rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60";

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
      <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
        <form
          method="get"
          className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(5,minmax(0,1fr))_auto] xl:items-end"
        >
          <label className="space-y-2">
            <span className={paymentFilterLabelClassName}>搜索</span>
            <input
              name="keyword"
              defaultValue={filters.keyword}
              className={paymentFilterControlClassName}
              placeholder="订单号 / 礼品 / 客户 / 手机号 / 负责人 / 流水号"
            />
          </label>

          <label className="space-y-2">
            <span className={paymentFilterLabelClassName}>来源</span>
            <select
              name="sourceType"
              defaultValue={filters.sourceType}
              className={paymentFilterControlClassName}
            >
              <option value="">全部来源</option>
              {paymentSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={paymentFilterLabelClassName}>状态</span>
            <select
              name="status"
              defaultValue={filters.status}
              className={paymentFilterControlClassName}
            >
              <option value="">全部状态</option>
              {paymentRecordStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={paymentFilterLabelClassName}>渠道</span>
            <select
              name="channel"
              defaultValue={filters.channel}
              className={paymentFilterControlClassName}
            >
              <option value="">全部渠道</option>
              {paymentRecordChannelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className={paymentFilterLabelClassName}>开始日期</span>
            <input
              type="date"
              name="occurredFrom"
              defaultValue={filters.occurredFrom}
              className={paymentFilterControlClassName}
            />
          </label>

          <label className="space-y-2">
            <span className={paymentFilterLabelClassName}>结束日期</span>
            <input
              type="date"
              name="occurredTo"
              defaultValue={filters.occurredTo}
              className={paymentFilterControlClassName}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button type="submit" className={paymentPrimaryButtonClassName}>
              筛选
            </button>
            <Link href="/payment-records" className={paymentResetButtonClassName}>
              重置
            </Link>
          </div>
        </form>
      </div>

      {items.length > 0 ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>
              共 {pagination.totalCount} 条收款记录，当前第 {pagination.page} / {pagination.totalPages} 页
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                <thead className="bg-transparent">
                  <tr>
                    <th className={paymentTableHeaderCellClassName}>来源</th>
                    <th className={paymentTableHeaderCellClassName}>客户与负责人</th>
                    <th className={paymentTableHeaderCellClassName}>计划</th>
                    <th className={paymentTableHeaderCellClassName}>记录</th>
                    <th className={paymentTableHeaderCellClassName}>审核</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-muted/30">
                      <td className={paymentTableCellClassName}>
                        <div className="font-medium text-foreground">
                          {getPaymentSourceLabel(item.sourceType)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {item.salesOrder ? `订单 ${item.salesOrder.orderNo}` : item.giftRecord?.giftName}
                        </div>
                        {item.salesOrder ? (
                          <Link href={`/orders/${item.salesOrder.id}`} className="crm-text-link text-xs">
                            查看订单
                          </Link>
                        ) : null}
                      </td>
                      <td className={paymentTableCellClassName}>
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <div className="font-medium text-foreground">
                            {item.customer?.name || "无客户"} / {item.customer?.phone || "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            负责人：{item.owner?.name || item.owner?.username || "未指派"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            提交人：{item.submittedBy.name || item.submittedBy.username}
                          </div>
                          {item.shippingTask ? (
                            <div className="text-xs text-muted-foreground">
                              发货：{item.shippingTask.shippingStatus} /{" "}
                              {item.shippingTask.trackingNumber || "未回填单号"}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className={paymentTableCellClassName}>
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
                          <div className="text-xs text-muted-foreground">
                            {getPaymentCollectionChannelLabel(item.paymentPlan.collectionChannel)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getPaymentPlanProgressSummary(item.paymentPlan)}
                          </div>
                        </div>
                      </td>
                      <td className={paymentTableCellClassName}>
                        <div className="space-y-2">
                          <StatusBadge
                            label={getPaymentRecordStatusLabel(item.status)}
                            variant={getPaymentRecordStatusVariant(item.status)}
                          />
                          <div className="text-xs text-muted-foreground">
                            {getPaymentRecordChannelLabel(item.channel)}
                          </div>
                          <div className="font-mono text-xs font-semibold text-foreground">
                            金额：{formatCurrency(item.amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            收款时间：{formatDateTime(item.occurredAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            流水号：{item.referenceNo || "无"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            备注：{item.remark || "无"}
                          </div>
                        </div>
                      </td>
                      <td className={`${paymentTableCellClassName} min-w-[280px]`}>
                        {canConfirmPaymentRecord && item.status === "SUBMITTED" ? (
                          <form action={reviewPaymentRecordAction} className="flex flex-col gap-2">
                            <input type="hidden" name="paymentRecordId" value={item.id} />
                            <input
                              type="hidden"
                              name="redirectTo"
                              value={buildPageHref(filters, pagination.page)}
                            />
                            <select
                              name="status"
                              defaultValue="CONFIRMED"
                              className={paymentAuditSelectClassName}
                            >
                              <option value="CONFIRMED">确认通过</option>
                              <option value="REJECTED">驳回</option>
                            </select>
                            <textarea
                              name="remark"
                              rows={2}
                              placeholder="填写审核备注"
                              className={paymentAuditTextareaClassName}
                            />
                            <button type="submit" className={paymentAuditSubmitClassName}>
                              保存审核结果
                            </button>
                          </form>
                        ) : (
                          <div className="space-y-2 text-sm leading-6 text-muted-foreground">
                            <div>
                              确认人：
                              {item.confirmedBy?.name || item.confirmedBy?.username || "待确认"}
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
