"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { updateCustomerRemarkAction } from "@/app/(dashboard)/customers/actions";
import {
  CalendarClock,
  ExternalLink,
  MapPin,
  Package,
  Pencil,
  Phone,
  ReceiptText,
  UserRound,
  X,
} from "lucide-react";
import { Sheet } from "@/components/shared/sheet";
import {
  formatDateTime,
  formatRegion,
  formatRelativeDateTime,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
} from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { cn } from "@/lib/utils";

type CustomerSheetOrder = {
  id: string;
  orderNo: string;
  subOrderNo: string | null;
  tradeOrderId: string | null;
  tradeNo: string | null;
  reviewStatusLabel: string;
  paymentModeLabel: string;
  finalAmount: string;
  supplierName: string | null;
  createdAt: string;
  shippingStatus: string | null;
  trackingNumber: string | null;
};

type OrderLoadState =
  | { status: "idle"; orders: CustomerSheetOrder[] }
  | { status: "loading"; orders: CustomerSheetOrder[] }
  | { status: "ready"; orders: CustomerSheetOrder[] }
  | { status: "error"; orders: CustomerSheetOrder[]; message: string };

function getCustomerInitial(item: CustomerListItem) {
  const name = item.name.trim();
  if (!name) return "?";
  return Array.from(name)[0]?.toUpperCase() ?? "?";
}

function getCustomerAddress(item: CustomerListItem) {
  const region = formatRegion(item.province, item.city, item.district);
  const detail = item.address?.trim();

  if (detail) {
    return region !== "未填写" ? `${region} / ${detail}` : detail;
  }

  return region;
}

function getOwnerLabel(item: CustomerListItem) {
  return item.owner
    ? `${item.owner.name} (@${item.owner.username})`
    : "未分配负责人";
}

function getPrimarySignal(item: CustomerListItem) {
  return (
    item.latestPurchasedProduct ??
    item.latestInterestedProduct ??
    "暂无商品信号"
  );
}

function getSignalMeta(item: CustomerListItem) {
  if (item.latestPurchasedProduct) {
    return "最近购买";
  }

  if (item.latestInterestedProduct) {
    return "导入意向";
  }

  return "未记录商品字段";
}

function getProgressLabel(item: CustomerListItem) {
  if (item.workingStatuses.length === 0) {
    return getCustomerStatusLabel(item.status);
  }

  return item.workingStatuses
    .map((status) => getCustomerWorkStatusLabel(status))
    .join(" / ");
}

function toDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatOptionalDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  return date ? formatDateTime(date) : "暂无";
}

function formatOptionalRelativeDate(value: Date | string | null | undefined) {
  const date = toDate(value);
  return date ? formatRelativeDateTime(date) : "暂无";
}

function SkeletonLine({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function MetricTile({
  label,
  value,
  icon,
}: Readonly<{
  label: string;
  value: string;
  icon: ReactNode;
}>) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="truncate text-lg font-semibold leading-6 text-foreground">
        {value}
      </p>
    </div>
  );
}

function CustomerRemarksCard({
  customerId,
  remark,
}: Readonly<{
  customerId: string;
  remark: string | null;
}>) {
  const [isEditingRemarks, setIsEditingRemarks] = useState(false);
  const [remarkValue, setRemarkValue] = useState(remark?.trim() ?? "");
  const [remarkDraft, setRemarkDraft] = useState(remark?.trim() ?? "");
  const [remarkMessage, setRemarkMessage] = useState<string | null>(null);
  const [isSavingRemark, startRemarkTransition] = useTransition();
  const hasRemark = remarkValue.length > 0;

  function saveRemark() {
    const normalizedDraft = remarkDraft.trim();

    if (normalizedDraft === remarkValue) {
      setRemarkDraft(normalizedDraft);
      setIsEditingRemarks(false);
      setRemarkMessage(null);
      return;
    }

    startRemarkTransition(async () => {
      const formData = new FormData();
      formData.set("customerId", customerId);
      formData.set("remark", remarkDraft);

      const result = await updateCustomerRemarkAction(formData);

      if (result.status === "success") {
        setRemarkValue(normalizedDraft);
        setRemarkDraft(normalizedDraft);
        setIsEditingRemarks(false);
      }

      setRemarkMessage(result.message);
    });
  }

  return (
    <section className="group relative mb-6 rounded-xl border border-border bg-card p-4 shadow-sm">
      {!isEditingRemarks ? (
        <button
          type="button"
          onClick={() => {
            setRemarkDraft(remarkValue);
            setRemarkMessage(null);
            setIsEditingRemarks(true);
          }}
          aria-label="编辑客户备注"
          className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground opacity-0 transition hover:bg-muted/60 hover:text-primary group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}

      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        客户备注
      </p>

      {isEditingRemarks ? (
        <div className="space-y-2.5">
          <textarea
            value={remarkDraft}
            rows={4}
            autoFocus
            placeholder="补充客户备注..."
            onChange={(event) => {
              setRemarkDraft(event.target.value);
              setRemarkMessage(null);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                saveRemark();
              }
            }}
            className="w-full resize-none rounded-md border border-border/60 bg-background p-2 text-sm leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <span
              className={cn(
                "min-h-4 text-xs text-muted-foreground",
                remarkMessage && "text-muted-foreground",
              )}
            >
              {isSavingRemark ? "保存中..." : remarkMessage}
            </span>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemarkDraft(remarkValue);
                  setIsEditingRemarks(false);
                  setRemarkMessage(null);
                }}
                disabled={isSavingRemark}
                className="text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveRemark}
                disabled={isSavingRemark}
                className="text-xs font-medium text-primary transition hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setRemarkDraft(remarkValue);
            setRemarkMessage(null);
            setIsEditingRemarks(true);
          }}
          className={cn(
            "block w-full rounded-md pr-8 text-left text-sm leading-relaxed transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
            hasRemark
              ? "whitespace-pre-wrap text-foreground"
              : "text-muted-foreground italic",
          )}
        >
          {hasRemark ? remarkValue : "暂无备注，点击添加..."}
        </button>
      )}
    </section>
  );
}

function OrdersSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <div className="min-w-0 space-y-2">
            <SkeletonLine className="h-4 w-40" />
            <SkeletonLine className="h-3 w-56 max-w-full" />
          </div>
          <SkeletonLine className="h-7 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function OrderHistory({
  state,
}: Readonly<{
  state: OrderLoadState;
}>) {
  if (state.status === "loading") {
    return <OrdersSkeleton />;
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-border bg-muted/35 px-3 py-3 text-sm text-muted-foreground">
        {state.message}
      </div>
    );
  }

  if (state.orders.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/35 px-3 py-3 text-sm text-muted-foreground">
        暂无成交订单。完整详情页会保留后续支付与履约链路。
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {state.orders.slice(0, 6).map((order) => {
        const href = `/orders/${order.tradeOrderId ?? order.id}`;
        const primaryNo = order.tradeNo ?? order.orderNo;
        const secondaryNo = order.tradeNo
          ? [order.orderNo, order.subOrderNo].filter(Boolean).join(" / ")
          : order.subOrderNo;

        return (
          <Link
            key={order.id}
            href={href}
            className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:border-primary/20 hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-semibold text-foreground">
                  {primaryNo}
                </p>
                <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 text-[11px] font-medium text-[var(--color-success)]">
                  {order.reviewStatusLabel}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {secondaryNo ? `${secondaryNo} · ` : ""}
                {order.supplierName ?? "未记录供应商"} ·{" "}
                {order.paymentModeLabel}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatOptionalDate(order.createdAt)}
                {order.trackingNumber ? ` · ${order.trackingNumber}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(order.finalAmount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {order.shippingStatus ?? "履约未开始"}
              </p>
              <ExternalLink className="ml-auto mt-2 h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function FollowUpTimeline({
  records,
}: Readonly<{
  records: CustomerListItem["callRecords"];
}>) {
  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/35 px-3 py-3 text-sm text-muted-foreground">
        暂无跟进记录。首次通话后这里会展示最近时间线。
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {records.slice(0, 6).map((record, index, visibleRecords) => (
        <div key={record.id} className="grid grid-cols-[0.85rem_1fr] gap-2.5">
          <div className="relative flex justify-center">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            {index < visibleRecords.length - 1 ? (
              <span className="absolute top-4 h-[calc(100%+0.35rem)] w-px bg-border" />
            ) : null}
          </div>
          <div className="min-w-0 pb-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-foreground">
                {record.resultLabel}
              </p>
              <span className="text-xs text-muted-foreground">
                {formatOptionalRelativeDate(record.callTime)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {record.sales.name} (@{record.sales.username}) ·{" "}
              {formatOptionalDate(record.callTime)}
            </p>
            {record.remark?.trim() ? (
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-foreground/80">
                {record.remark.trim()}
              </p>
            ) : null}
            {record.nextFollowUpAt ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                下次跟进 {formatOptionalDate(record.nextFollowUpAt)}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CustomerDetailSheet({
  open,
  customer,
  onClose,
}: Readonly<{
  open: boolean;
  customer: CustomerListItem | null;
  onClose: () => void;
}>) {
  const [orderState, setOrderState] = useState<OrderLoadState>({
    status: "idle",
    orders: [],
  });
  const customerId = customer?.id ?? "";

  const statusLabel = useMemo(
    () => (customer ? getCustomerStatusLabel(customer.status) : ""),
    [customer],
  );

  useEffect(() => {
    if (!open || !customerId) {
      setOrderState({ status: "idle", orders: [] });
      return undefined;
    }

    const controller = new AbortController();

    setOrderState({ status: "loading", orders: [] });

    async function loadOrders() {
      try {
        const response = await fetch(`/api/customers/${customerId}/sheet`, {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("订单历史暂时不可用。");
        }

        const payload = (await response.json()) as {
          orders?: CustomerSheetOrder[];
        };
        setOrderState({
          status: "ready",
          orders: Array.isArray(payload.orders) ? payload.orders : [],
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setOrderState({
          status: "error",
          orders: [],
          message:
            error instanceof Error ? error.message : "订单历史暂时不可用。",
        });
      }
    }

    void loadOrders();

    return () => {
      controller.abort();
    };
  }, [customerId, open]);

  if (!customer) {
    return null;
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      ariaLabel={`客户快速详情：${customer.name}`}
      className="max-w-[44rem]"
      contentClassName="overflow-hidden bg-background"
    >
      <div className="flex h-full max-h-screen min-h-0 flex-col bg-background">
        <header className="shrink-0 border-b border-border bg-card px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-sm font-bold text-primary">
                {getCustomerInitial(customer)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold leading-6 text-foreground">
                    {customer.name}
                  </h2>
                  <span className="inline-flex h-5 items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 text-[11px] font-medium text-[var(--color-success)]">
                    {statusLabel}
                  </span>
                </div>
                <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    <span className="truncate font-mono">
                      {customer.phone || "暂无电话"}
                    </span>
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {getCustomerAddress(customer)}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={`/customers/${customer.id}`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/20 hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>完整详情</span>
              </Link>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-8 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-4 px-4 py-4 sm:px-5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <MetricTile
                label="累计成交"
                value={formatCurrency(customer.lifetimeTradeAmount)}
                icon={<ReceiptText className="h-3.5 w-3.5" />}
              />
              <MetricTile
                label="成交单数"
                value={`${customer.approvedTradeOrderCount} 单`}
                icon={<Package className="h-3.5 w-3.5" />}
              />
              <MetricTile
                label="最近成交"
                value={formatOptionalRelativeDate(customer.latestTradeAt)}
                icon={<CalendarClock className="h-3.5 w-3.5" />}
              />
              <MetricTile
                label="负责人"
                value={getOwnerLabel(customer)}
                icon={<UserRound className="h-3.5 w-3.5" />}
              />
            </div>

            <CustomerRemarksCard
              key={customer.id}
              customerId={customer.id}
              remark={customer.remark}
            />

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Customer Context
                  </p>
                  <h4 className="mt-0.5 text-base font-semibold text-foreground">
                    识别信息
                  </h4>
                </div>
                <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {getProgressLabel(customer)}
                </span>
              </div>

              <div className="mt-3 space-y-2.5">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {getSignalMeta(customer)}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-foreground">
                    {getPrimarySignal(customer)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {customer.customerTags.slice(0, 5).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex h-6 items-center rounded-full border border-border bg-muted/45 px-2.5 text-xs font-medium text-muted-foreground"
                    >
                      {tag.tag.name}
                    </span>
                  ))}
                  {customer.customerTags.length === 0 ? (
                    <span className="text-sm text-muted-foreground">
                      暂无客户标签
                    </span>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    TradeOrder History
                  </p>
                  <h4 className="mt-0.5 text-base font-semibold text-foreground">
                    最近成交
                  </h4>
                </div>
                <span className="text-xs text-muted-foreground">
                  {customer.approvedTradeOrderCount} approved
                </span>
              </div>
              <OrderHistory state={orderState} />
            </section>

            <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    Follow-up Timeline
                  </p>
                  <h4 className="mt-0.5 text-base font-semibold text-foreground">
                    最近跟进
                  </h4>
                </div>
                <span className="text-xs text-muted-foreground">
                  {customer._count.callRecords} calls
                </span>
              </div>
              <FollowUpTimeline records={customer.callRecords} />
            </section>
          </div>
        </div>
      </div>
    </Sheet>
  );
}
