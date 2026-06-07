"use client";

/**
 * 收款记录主组件 — Wave 5 Phase 2-F 视觉重构.
 *
 * 设计目标:
 * - 上层 MetricStrip 汇总核心指标 (总额 / 待确认 / 已确认 / 渠道分布).
 * - 4 列紧凑表格 [来源 / 金额 / 状态 / 操作] 行高 ~60px, 一屏 8-10 条.
 * - 详情 + 审核 form 走右侧 Sheet, 不再在行内嵌套.
 * - 流水号 / 备注 / 计划进度轨道全部进 Sheet.
 * - 6 列筛选改成 Popover 折叠, 默认只显关键词 + 筛选触发按钮.
 *
 * 严格不动: trade-order-detail-section, customer/, shipping/, recycle-bin/, leads/.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronDown,
  Filter as FilterIcon,
  X as XIcon,
} from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import MetricStrip, {
  type MetricItem,
} from "@/components/shared/metric-strip";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Sheet } from "@/components/shared/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import OrderProgressTrack, {
  type OrderProgressPhase,
} from "@/components/trade-orders/order-progress-track";
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
import { cn } from "@/lib/utils";

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

const filterLabelClass =
  "text-xs font-semibold uppercase tracking-widest text-muted-foreground";

const filterControlClass =
  "w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

const ghostButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground";

const tableHeaderCellClass =
  "border-b border-border/40 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground first:pl-5 last:pr-5";

const tableCellClass =
  "border-b border-border/40 px-4 py-2 align-middle first:pl-5 last:pr-5";

const auditSelectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

const auditTextareaClass =
  "w-full resize-none rounded-md border border-border/60 bg-background p-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20";

const auditSubmitClass =
  "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

// 计划状态 → 订单流程节点的轻量映射, 复用 OrderProgressTrack 走视觉一致.
const planStatusToPhase: Record<
  PaymentRecordItem["paymentPlan"]["status"],
  OrderProgressPhase
> = {
  PENDING: "DRAFT",
  SUBMITTED: "PENDING_REVIEW",
  PARTIALLY_COLLECTED: "APPROVED",
  COLLECTED: "COLLECTED",
  CANCELED: "CANCELED",
};

function countActiveFilters(filters: PaymentRecordFilters) {
  let count = 0;
  if (filters.sourceType) count += 1;
  if (filters.status) count += 1;
  if (filters.channel) count += 1;
  if (filters.occurredFrom) count += 1;
  if (filters.occurredTo) count += 1;
  return count;
}

function describeSource(item: PaymentRecordItem) {
  if (item.salesOrder) {
    return `订单 ${item.salesOrder.orderNo}`;
  }
  if (item.giftRecord) {
    return item.giftRecord.giftName;
  }
  return "-";
}

function PaymentRecordDetailPanel({
  item,
  filters,
  pagination,
  canConfirmPaymentRecord,
  reviewPaymentRecordAction,
  onClose,
}: Readonly<{
  item: PaymentRecordItem;
  filters: PaymentRecordFilters;
  pagination: PaginationData;
  canConfirmPaymentRecord: boolean;
  reviewPaymentRecordAction: (formData: FormData) => Promise<void>;
  onClose: () => void;
}>) {
  const canReview = canConfirmPaymentRecord && item.status === "SUBMITTED";
  const sourceLabel = getPaymentSourceLabel(item.sourceType);

  return (
    <div className="space-y-5 px-5 py-5 sm:px-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={getPaymentRecordStatusLabel(item.status)}
            variant={getPaymentRecordStatusVariant(item.status)}
          />
          <span className="text-xs text-muted-foreground">{sourceLabel}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold text-foreground">
            {formatCurrency(item.amount)}
          </span>
          <span className="text-xs text-muted-foreground">
            {getPaymentRecordChannelLabel(item.channel)}
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          收款时间 {formatDateTime(item.occurredAt)} · 提交于{" "}
          {formatDateTime(item.createdAt)}
        </div>
      </header>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          支付计划进度
        </h3>
        <OrderProgressTrack
          currentPhase={planStatusToPhase[item.paymentPlan.status]}
        />
        <div className="flex flex-wrap gap-2 pt-1">
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
          <span className="inline-flex items-center rounded-full border border-border/50 bg-muted/30 px-2 py-[0.22rem] text-[10px] font-medium text-muted-foreground">
            {getPaymentCollectionChannelLabel(item.paymentPlan.collectionChannel)}
          </span>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          {getPaymentPlanProgressSummary(item.paymentPlan)}
        </p>
      </section>

      <section className="grid gap-3 rounded-lg border border-border/50 bg-card p-4 sm:grid-cols-2">
        <DetailField label="来源" value={describeSource(item)} />
        <DetailField
          label="客户"
          value={
            item.customer
              ? `${item.customer.name} / ${item.customer.phone}`
              : "无客户"
          }
        />
        <DetailField
          label="负责人"
          value={item.owner?.name || item.owner?.username || "未指派"}
        />
        <DetailField
          label="提交人"
          value={item.submittedBy.name || item.submittedBy.username}
        />
        <DetailField
          label="确认人"
          value={
            item.confirmedBy?.name || item.confirmedBy?.username || "待确认"
          }
        />
        <DetailField
          label="流水号"
          value={item.referenceNo || "无"}
          mono
        />
        {item.shippingTask ? (
          <DetailField
            label="发货"
            value={`${item.shippingTask.shippingStatus} · ${
              item.shippingTask.trackingNumber || "未回填单号"
            }`}
            className="sm:col-span-2"
          />
        ) : null}
        <DetailField
          label="备注"
          value={item.remark || "无"}
          className="sm:col-span-2"
        />
        {item.salesOrder ? (
          <div className="sm:col-span-2">
            <Link
              href={`/orders/${item.salesOrder.id}`}
              className="crm-text-link text-xs"
            >
              查看订单详情 →
            </Link>
          </div>
        ) : null}
      </section>

      {canReview ? (
        <section className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
          <h3 className="text-sm font-semibold text-foreground">审核</h3>
          <form
            action={async (formData) => {
              await reviewPaymentRecordAction(formData);
              onClose();
            }}
            className="space-y-3"
          >
            <input type="hidden" name="paymentRecordId" value={item.id} />
            <input
              type="hidden"
              name="redirectTo"
              value={buildPageHref(filters, pagination.page)}
            />
            <label className="block space-y-1">
              <span className={filterLabelClass}>审核结果</span>
              <select
                name="status"
                defaultValue="CONFIRMED"
                className={auditSelectClass}
              >
                <option value="CONFIRMED">确认通过</option>
                <option value="REJECTED">驳回</option>
              </select>
            </label>
            <label className="block space-y-1">
              <span className={filterLabelClass}>审核备注</span>
              <textarea
                name="remark"
                rows={4}
                placeholder="填写审核备注"
                className={auditTextareaClass}
              />
            </label>
            <div className="flex justify-end">
              <button type="submit" className={auditSubmitClass}>
                保存审核结果
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono,
  className,
}: Readonly<{
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}>) {
  return (
    <div className={cn("min-w-0 space-y-0.5", className)}>
      <div className={filterLabelClass}>{label}</div>
      <div
        className={cn(
          "truncate text-sm text-foreground",
          mono ? "font-mono" : "",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FiltersPopover({
  filters,
  activeCount,
}: Readonly<{
  filters: PaymentRecordFilters;
  activeCount: number;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(ghostButtonClass, open ? "border-primary/40 text-primary" : "")}
      >
        <FilterIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>筛选</span>
        {activeCount > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            open ? "rotate-180" : "",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="关闭筛选"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-full z-40 mt-2 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-border/60 bg-card p-4 shadow-lg">
            <div className="flex items-center justify-between pb-3">
              <span className="text-sm font-semibold text-foreground">
                高级筛选
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              >
                <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className={filterLabelClass}>来源</span>
                <select
                  name="sourceType"
                  form="payment-records-filters-form"
                  defaultValue={filters.sourceType}
                  className={filterControlClass}
                >
                  <option value="">全部来源</option>
                  {paymentSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className={filterLabelClass}>状态</span>
                <select
                  name="status"
                  form="payment-records-filters-form"
                  defaultValue={filters.status}
                  className={filterControlClass}
                >
                  <option value="">全部状态</option>
                  {paymentRecordStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className={filterLabelClass}>渠道</span>
                <select
                  name="channel"
                  form="payment-records-filters-form"
                  defaultValue={filters.channel}
                  className={filterControlClass}
                >
                  <option value="">全部渠道</option>
                  {paymentRecordChannelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className={filterLabelClass}>开始日期</span>
                <input
                  type="date"
                  name="occurredFrom"
                  form="payment-records-filters-form"
                  defaultValue={filters.occurredFrom}
                  className={filterControlClass}
                />
              </label>

              <label className="space-y-1">
                <span className={filterLabelClass}>结束日期</span>
                <input
                  type="date"
                  name="occurredTo"
                  form="payment-records-filters-form"
                  defaultValue={filters.occurredTo}
                  className={filterControlClass}
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Link
                href="/payment-records"
                className={ghostButtonClass}
              >
                重置
              </Link>
              <button
                type="submit"
                form="payment-records-filters-form"
                className={primaryButtonClass}
              >
                应用
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function buildMetrics(items: PaymentRecordItem[]): MetricItem[] {
  let confirmedAmount = 0;
  let pendingCount = 0;
  let confirmedCount = 0;
  const channels = new Set<string>();

  for (const item of items) {
    channels.add(item.channel);
    if (item.status === "SUBMITTED") {
      pendingCount += 1;
    }
    if (item.status === "CONFIRMED") {
      confirmedCount += 1;
      const amount = Number(item.amount);
      if (Number.isFinite(amount)) {
        confirmedAmount += amount;
      }
    }
  }

  return [
    {
      label: "本页已确认金额",
      value: formatCurrency(confirmedAmount.toFixed(2)),
      tone: "success",
    },
    {
      label: "待确认",
      value: `${pendingCount} 条`,
      tone: pendingCount > 0 ? "warning" : "neutral",
      mini: "bar",
      ringValue: pendingCount,
      ringMax: Math.max(items.length, 1),
    },
    {
      label: "已确认",
      value: `${confirmedCount} 条`,
      tone: "success",
      mini: "bar",
      ringValue: confirmedCount,
      ringMax: Math.max(items.length, 1),
    },
    {
      label: "渠道覆盖",
      value: `${channels.size} 种`,
      tone: "neutral",
    },
  ];
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
  const [openId, setOpenId] = useState<string | null>(null);
  const activeItem = useMemo(
    () => items.find((item) => item.id === openId) ?? null,
    [items, openId],
  );
  const activeFilterCount = countActiveFilters(filters);
  const metrics = useMemo(() => buildMetrics(items), [items]);

  return (
    <div className="space-y-5">
      <MetricStrip metrics={metrics} ariaLabel="收款记录核心指标" />

      <form
        id="payment-records-filters-form"
        method="get"
        className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm sm:flex-row sm:items-center"
      >
        <input
          name="keyword"
          defaultValue={filters.keyword}
          className={cn(filterControlClass, "sm:flex-1")}
          placeholder="搜索订单号 / 礼品 / 客户 / 手机号 / 负责人 / 流水号"
        />
        <div className="flex items-center gap-2">
          <button type="submit" className={primaryButtonClass}>
            搜索
          </button>
          <FiltersPopover filters={filters} activeCount={activeFilterCount} />
        </div>
      </form>

      {items.length > 0 ? (
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            共 {pagination.totalCount} 条收款记录，当前第 {pagination.page} /{" "}
            {pagination.totalPages} 页
          </div>

          <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
            <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                <thead className="bg-transparent">
                  <tr>
                    <th className={tableHeaderCellClass}>来源</th>
                    <th className={cn(tableHeaderCellClass, "text-right")}>
                      金额
                    </th>
                    <th className={tableHeaderCellClass}>状态</th>
                    <th
                      className={cn(
                        tableHeaderCellClass,
                        "w-[180px] text-right",
                      )}
                    >
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isPending =
                      canConfirmPaymentRecord && item.status === "SUBMITTED";
                    return (
                      <tr key={item.id}>
                        <td className={tableCellClass}>
                          <div className="flex flex-col">
                            <span className="truncate text-sm font-medium text-foreground">
                              {describeSource(item)}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {getPaymentSourceLabel(item.sourceType)} ·{" "}
                              {item.customer?.name || "无客户"}
                              {item.owner?.name
                                ? ` · ${item.owner.name}`
                                : ""}
                            </span>
                          </div>
                        </td>
                        <td className={cn(tableCellClass, "text-right")}>
                          <div className="flex flex-col items-end">
                            <span className="font-mono text-sm font-semibold text-foreground">
                              {formatCurrency(item.amount)}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {getPaymentRecordChannelLabel(item.channel)}
                            </span>
                          </div>
                        </td>
                        <td className={tableCellClass}>
                          <div className="flex flex-col gap-1">
                            <StatusBadge
                              label={getPaymentRecordStatusLabel(item.status)}
                              variant={getPaymentRecordStatusVariant(
                                item.status,
                              )}
                            />
                            <span className="truncate text-[11px] text-muted-foreground">
                              计划:{" "}
                              {getPaymentPlanStatusLabel(
                                item.paymentPlan.status,
                              )}
                            </span>
                          </div>
                        </td>
                        <td className={cn(tableCellClass, "text-right")}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenId(item.id)}
                              className={cn(
                                ghostButtonClass,
                                "px-3 py-1.5 text-xs",
                                isPending
                                  ? "border-primary/40 text-primary hover:text-primary"
                                  : "",
                              )}
                            >
                              {isPending ? "审核" : "详情"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            summary={`本页显示 ${
              (pagination.page - 1) * pagination.pageSize + 1
            } - ${Math.min(
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

      <Sheet
        open={Boolean(activeItem)}
        onClose={() => setOpenId(null)}
        title="收款记录详情"
        description={
          activeItem
            ? `${getPaymentSourceLabel(activeItem.sourceType)} · ${formatCurrency(
                activeItem.amount,
              )}`
            : undefined
        }
      >
        {activeItem ? (
          <PaymentRecordDetailPanel
            item={activeItem}
            filters={filters}
            pagination={pagination}
            canConfirmPaymentRecord={canConfirmPaymentRecord}
            reviewPaymentRecordAction={reviewPaymentRecordAction}
            onClose={() => setOpenId(null)}
          />
        ) : null}
      </Sheet>
    </div>
  );
}
