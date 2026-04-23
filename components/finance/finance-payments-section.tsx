import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { FiltersPanel } from "@/components/shared/filters-panel";
import { PaginationControls } from "@/components/shared/pagination-controls";
import {
  PageSummaryStrip,
  type PageSummaryStripItem,
} from "@/components/shared/page-summary-strip";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import type { FinancePaymentsFilters } from "@/lib/finance/queries";
import {
  getPaymentCollectionChannelLabel,
  getPaymentPlanStageLabel,
  getPaymentPlanStatusLabel,
  getPaymentPlanStatusVariant,
  getPaymentPlanSubjectLabel,
  getPaymentRecordChannelLabel,
  getPaymentRecordStatusLabel,
  getPaymentRecordStatusVariant,
  getPaymentSourceLabel,
  paymentRecordChannelOptions,
  paymentRecordStatusOptions,
} from "@/lib/payments/metadata";
import { cn } from "@/lib/utils";

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
    status:
      | "PENDING"
      | "SUBMITTED"
      | "PARTIALLY_COLLECTED"
      | "COLLECTED"
      | "CANCELED";
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

function toSummaryItems(cards: FinanceCard[]): PageSummaryStripItem[] {
  return cards.map((card, index) => ({
    key: `${card.label}-${index}`,
    label: card.label,
    value: card.value,
    note: card.note,
    href: card.href,
    emphasis: "default",
  }));
}

const inlineFieldClassName =
  "group flex h-9 min-w-0 items-center gap-2 rounded-[12px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 transition-[border-color,background-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-sm)] focus-within:border-[var(--color-accent-soft)] focus-within:bg-[var(--color-shell-hover)] focus-within:shadow-[var(--color-shell-shadow-sm)]";

function InlineSelectControl({
  label,
  name,
  defaultValue,
  children,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}>) {
  return (
    <label className={inlineFieldClassName}>
      <span className="shrink-0 text-[12px] font-medium text-[var(--color-sidebar-muted)]">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="crm-select h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 pr-5 text-[13px] text-[var(--foreground)] shadow-none outline-none focus:ring-0"
      >
        {children}
      </select>
    </label>
  );
}

function InlineDateControl({
  label,
  name,
  defaultValue,
}: Readonly<{
  label: string;
  name: string;
  defaultValue: string;
}>) {
  return (
    <label className={inlineFieldClassName}>
      <span className="shrink-0 text-[12px] font-medium text-[var(--color-sidebar-muted)]">
        {label}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[13px] text-[var(--foreground)] outline-none focus:ring-0"
      />
    </label>
  );
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
    <div className="space-y-4">
      <PageSummaryStrip
        items={toSummaryItems(summaryCards)}
        className="gap-2.5 xl:grid-cols-2"
      />

      <FiltersPanel
        title="收款筛选"
        headerMode="hidden"
        className="rounded-[0.95rem] border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)]"
      >
        <form method="get" className="space-y-2.5">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(320px,1.45fr)_repeat(6,minmax(0,0.86fr))]">
            <label
              className={cn(
                "flex min-h-9 items-center gap-2 rounded-[13px] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-2.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:shadow-[var(--color-shell-shadow-md)]",
                "xl:col-span-1",
              )}
            >
              <input
                name="orderNo"
                defaultValue={filters.orderNo}
                placeholder="订单编号"
                className="h-9 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--color-sidebar-muted)] focus:ring-0"
              />
              <div className="h-4 w-px bg-[var(--color-border-soft)]" />
              <input
                name="customerKeyword"
                defaultValue={filters.customerKeyword}
                placeholder="客户 / 手机号"
                className="h-9 min-w-[8rem] flex-1 border-0 bg-transparent px-0 text-[13px] text-[var(--foreground)] outline-none placeholder:text-[var(--color-sidebar-muted)] focus:ring-0"
              />
            </label>

            <InlineSelectControl
              label="销售"
              name="salesId"
              defaultValue={filters.salesId}
            >
              <option value="">全部销售</option>
              {salesOptions.map((sales) => (
                <option key={sales.id} value={sales.id}>
                  {sales.name || sales.username}
                </option>
              ))}
            </InlineSelectControl>

            <InlineSelectControl
              label="渠道"
              name="channel"
              defaultValue={filters.channel}
            >
              <option value="">全部渠道</option>
              {paymentRecordChannelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </InlineSelectControl>

            <InlineSelectControl
              label="状态"
              name="status"
              defaultValue={filters.status}
            >
              <option value="">全部状态</option>
              {paymentRecordStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </InlineSelectControl>

            <InlineDateControl
              label="开始"
              name="occurredFrom"
              defaultValue={filters.occurredFrom}
            />
            <InlineDateControl
              label="结束"
              name="occurredTo"
              defaultValue={filters.occurredTo}
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-[var(--color-border-soft)] pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-[var(--color-sidebar-muted)]">
              {scopeLabel}
              {filters.orderNo ||
              filters.customerKeyword ||
              filters.salesId ||
              filters.channel ||
              filters.status ||
              filters.occurredFrom ||
              filters.occurredTo
                ? " · 当前已应用筛选"
                : " · 当前查看全部收款记录"}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/finance/payments"
                className="crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm"
              >
                重置
              </Link>
              <button
                type="submit"
                className="crm-button crm-button-primary min-h-0 px-3 py-2 text-sm"
              >
                应用
              </button>
            </div>
          </div>
        </form>
      </FiltersPanel>

      <SectionCard
        title="收款记录"
        description="按来源、客户、销售与时间回看收款轨迹。"
        density="compact"
        className="rounded-[1.05rem] shadow-[var(--color-shell-shadow-sm)]"
        contentClassName="p-3 md:p-4"
      >
        {items.length > 0 ? (
          <div className="space-y-4">
            <p className="text-[12px] text-[var(--color-sidebar-muted)]">
              共 {pagination.totalCount} 条收款记录，当前第 {pagination.page} /{" "}
              {pagination.totalPages} 页
            </p>

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
                        <div className="font-medium text-[var(--foreground)]">
                          {item.salesOrder?.orderNo ||
                            item.giftRecord?.giftName ||
                            getPaymentSourceLabel(item.sourceType)}
                        </div>
                        <div className="mt-1 text-xs text-[var(--color-sidebar-muted)]">
                          {getPaymentSourceLabel(item.sourceType)}
                        </div>
                        {item.salesOrder ? (
                          <Link
                            href={`/orders/${item.salesOrder.id}`}
                            className="crm-text-link text-xs"
                          >
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
                        <div className="space-y-1 text-sm text-[var(--color-sidebar-muted)]">
                          <div>{item.customer?.name || "无客户"}</div>
                          <div className="text-xs">
                            {item.customer?.phone || "-"}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-1 text-sm text-[var(--color-sidebar-muted)]">
                          <div>
                            {item.salesOwner?.name ||
                              item.salesOwner?.username ||
                              "未指派"}
                          </div>
                          <div className="text-xs">
                            提交人：
                            {item.submittedBy.name || item.submittedBy.username}
                          </div>
                          <div className="text-xs">
                            确认人：
                            {item.confirmedBy?.name ||
                              item.confirmedBy?.username ||
                              "待确认"}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <StatusBadge
                              label={getPaymentRecordStatusLabel(item.status)}
                              variant={getPaymentRecordStatusVariant(
                                item.status,
                              )}
                            />
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            金额：{formatCurrency(item.amount)}
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            渠道：{getPaymentRecordChannelLabel(item.channel)}
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            收款时间：{formatDateTime(item.occurredAt)}
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            流水号：{item.referenceNo || "无"}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-2">
                          <StatusBadge
                            label={getPaymentPlanStatusLabel(
                              item.paymentPlan.status,
                            )}
                            variant={getPaymentPlanStatusVariant(
                              item.paymentPlan.status,
                            )}
                          />
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            {getPaymentPlanSubjectLabel(
                              item.paymentPlan.subjectType,
                            )}
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            {getPaymentPlanStageLabel(
                              item.paymentPlan.stageType,
                            )}{" "}
                            /{" "}
                            {getPaymentCollectionChannelLabel(
                              item.paymentPlan.collectionChannel,
                            )}
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            计划：
                            {formatCurrency(item.paymentPlan.plannedAmount)}
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            已确认：
                            {formatCurrency(item.paymentPlan.confirmedAmount)}
                          </div>
                          <div className="text-xs text-[var(--color-sidebar-muted)]">
                            待收：
                            {formatCurrency(item.paymentPlan.remainingAmount)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="space-y-2 text-sm text-[var(--color-sidebar-muted)]">
                          <div>创建：{formatDateTime(item.createdAt)}</div>
                          <div>备注：{item.remark || "无"}</div>
                          {item.shippingTask ? (
                            <div className="text-xs">
                              发货：{item.shippingTask.shippingStatus} /{" "}
                              {item.shippingTask.trackingNumber ||
                                "未回填物流单号"}
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
      </SectionCard>
    </div>
  );
}
