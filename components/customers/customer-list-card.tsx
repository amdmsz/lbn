"use client";

import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FilePlus2, FileText, MoreHorizontal, Phone, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import type { CallResultOption } from "@/lib/calls/metadata";
import { startMobileCallFollowUpDial } from "@/lib/calls/mobile-call-followup";
import { formatDateTime, formatRelativeDateTime } from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { cn } from "@/lib/utils";

type DynamicInfoItem = {
  key: string;
  text: string;
  title?: string;
};

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function getDynamicInfoItems(
  item: CustomerListItem,
  importedAt: Date,
  latestFollowUpAt: Date | null,
  latestTradeAt: Date | null,
): DynamicInfoItem[] {
  const items: DynamicInfoItem[] = [];
  const purchasedProduct = item.latestPurchasedProduct?.trim();
  const interestedProduct = item.latestInterestedProduct?.trim();

  if (purchasedProduct) {
    items.push({
      key: "purchased-product",
      text: `最近成交 · ${purchasedProduct}`,
      title: purchasedProduct,
    });
  }

  if (latestTradeAt) {
    items.push({
      key: "trade-time",
      text: `最近成交 ${formatRelativeDateTime(latestTradeAt)}`,
      title: formatDateTime(latestTradeAt),
    });
  }

  if (latestFollowUpAt) {
    items.push({
      key: "follow-up",
      text: `最近跟进 ${formatRelativeDateTime(latestFollowUpAt)}`,
      title: formatDateTime(latestFollowUpAt),
    });
  }

  if (interestedProduct && interestedProduct !== purchasedProduct) {
    items.push({
      key: "interest-product",
      text: `最近意向 · ${interestedProduct}`,
      title: interestedProduct,
    });
  }

  items.push({
    key: "imported-at",
    text: `导入 ${formatRelativeDateTime(importedAt)}`,
    title: formatDateTime(importedAt),
  });

  return items;
}

function getCardAddress(item: CustomerListItem) {
  const region = [item.province, item.city, item.district].filter(Boolean).join(" ");
  const detail = item.address?.trim();
  const parts = [region, detail].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "未填写地址";
}

function buildCustomerTradeOrderHref(customerId: string) {
  return `/customers/${customerId}?tab=orders&createTradeOrder=1`;
}

function CustomerActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  fullWidth = false,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) {
          onClick();
        }
      }}
      className={cn(
        "inline-flex min-w-0 items-center justify-center font-medium tracking-[-0.01em] outline-none transition-[border-color,background-color,color,opacity,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.08)] focus-visible:ring-offset-0",
        fullWidth
          ? "h-9 w-full justify-start gap-2 rounded-[13px] border px-3.5 text-[13px]"
          : "h-9 gap-1.5 rounded-full border border-transparent px-3.5 text-[12px]",
        disabled
          ? "cursor-not-allowed border-black/5 bg-black/[0.03] text-black/32"
          : fullWidth
            ? "border-black/8 bg-white/94 text-black/76 hover:border-black/12 hover:bg-white hover:text-black/88"
            : "bg-transparent text-black/72 hover:border-[rgba(15,23,42,0.05)] hover:bg-[rgba(255,255,255,0.72)] hover:text-black/88",
      )}
    >
      <Icon className={cn("shrink-0", fullWidth ? "h-[14px] w-[14px]" : "h-[13px] w-[13px]")} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function CustomerModal({
  open,
  title,
  description,
  onClose,
  children,
}: Readonly<{
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}>) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="crm-card flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-black/6 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-black/84">{title}</h3>
              <p className="text-sm leading-6 text-black/58">{description}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-ghost min-h-0 px-3 py-2 text-sm"
            >
              关闭
            </button>
          </div>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function CustomerIdentity({
  name,
  phone,
}: Readonly<{
  name: string;
  phone: string;
}>) {
  return (
    <div className="mb-4 rounded-[0.9rem] border border-black/7 bg-[rgba(255,255,255,0.82)] px-4 py-3 text-sm leading-6 text-black/62">
      <p className="font-medium text-black/78">{name}</p>
      <p>{phone}</p>
    </div>
  );
}

function stopCardNavigation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function CustomerListCard({
  item,
  callResultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
}: Readonly<{
  item: CustomerListItem;
  callResultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
}>) {
  const router = useRouter();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callHistoryDialogOpen, setCallHistoryDialogOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [dynamicIndex, setDynamicIndex] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);

  const detailHref = `/customers/${item.id}`;
  const importedAt = normalizeDate(item.latestImportAt) ?? item.createdAt;
  const latestFollowUpAt = normalizeDate(item.latestFollowUpAt);
  const latestTradeAt = normalizeDate(item.latestTradeAt);
  const address = getCardAddress(item);
  const hasLifetimeTrade = Number(item.lifetimeTradeAmount) > 0.009;
  const dynamicInfoItems = getDynamicInfoItems(
    item,
    importedAt,
    latestFollowUpAt,
    latestTradeAt,
  );
  const safeDynamicIndex =
    dynamicInfoItems.length > 0 ? dynamicIndex % dynamicInfoItems.length : 0;
  const activeDynamicInfo = dynamicInfoItems[safeDynamicIndex] ?? dynamicInfoItems[0];

  useEffect(() => {
    if (dynamicInfoItems.length <= 1 || tickerPaused) {
      return undefined;
    }

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setDynamicIndex((current) => (current + 1) % dynamicInfoItems.length);
    }, 5600);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [dynamicInfoItems.length, tickerPaused]);

  useEffect(() => {
    if (!mobileActionsOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setMobileActionsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileActionsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileActionsOpen]);

  function navigateTo(href: string) {
    setMobileActionsOpen(false);
    router.push(href);
  }

  function openCallDialog() {
    if (!canCreateCallRecord) {
      return;
    }

    setMobileActionsOpen(false);
    setCallDialogOpen(true);
  }

  function startPhoneDial() {
    if (!canCreateCallRecord) {
      return;
    }

    setMobileActionsOpen(false);
    startMobileCallFollowUpDial({
      customerId: item.id,
      customerName: item.name,
      phone: item.phone,
      triggerSource: "card",
    });
  }

  function openCallHistoryDialog() {
    setMobileActionsOpen(false);
    setCallHistoryDialogOpen(true);
  }

  function openCreateTradeOrder() {
    if (!canCreateSalesOrder) {
      return;
    }

    navigateTo(buildCustomerTradeOrderHref(item.id));
  }

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateTo(detailHref);
    }
  }

  function handleFocusCapture() {
    setTickerPaused(true);
  }

  function handleBlurCapture(event: ReactFocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setTickerPaused(false);
    }
  }

  return (
    <>
      <article
        role="link"
        tabIndex={0}
        aria-label={`进入 ${item.name} 详情页`}
        onClick={() => navigateTo(detailHref)}
        onKeyDown={handleCardKeyDown}
        onMouseEnter={() => setTickerPaused(true)}
        onMouseLeave={() => setTickerPaused(false)}
        onFocusCapture={handleFocusCapture}
        onBlurCapture={handleBlurCapture}
        className={cn(
          "group relative flex min-h-[104px] cursor-pointer flex-col overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.06)] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(249,247,244,0.92))] px-3.5 pb-3 pt-3 shadow-[0_3px_10px_rgba(15,23,42,0.02)] outline-none transition-[border-color,background-color,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-[linear-gradient(90deg,rgba(15,23,42,0),rgba(15,23,42,0.08),rgba(15,23,42,0))]",
          "focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.08)] focus-visible:ring-offset-0 md:min-h-[112px] md:px-3.5 md:pb-3.5 md:pt-3.5",
          "min-[960px]:hover:-translate-y-px min-[960px]:hover:border-[rgba(15,23,42,0.09)] min-[960px]:hover:shadow-[0_10px_24px_rgba(15,23,42,0.05)]",
        )}
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1 pt-1 md:pt-1.5">
            <h3 className="truncate text-[18px] font-semibold leading-5 tracking-[-0.04em] text-[#0f172a] md:text-[19px]">
              {item.name}
            </h3>
          </div>

          <div ref={mobileMenuRef} className="relative z-20 flex shrink-0 items-start gap-1.5">
            <div className="min-w-[78px] rounded-[13px] border border-[rgba(15,23,42,0.05)] bg-[rgba(255,255,255,0.66)] px-2 py-1.5 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-[8px]">
              <p className="text-[8.5px] font-semibold tracking-[0.14em] text-black/34">
                累计成交
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[0.9rem] font-semibold leading-none tracking-[-0.045em] text-[#0f172a] tabular-nums md:text-[0.96rem]",
                  !hasLifetimeTrade && "text-black/46",
                )}
              >
                {formatCurrency(item.lifetimeTradeAmount)}
              </p>
            </div>

            <button
              type="button"
              aria-label="更多操作"
              aria-expanded={mobileActionsOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMobileActionsOpen((current) => !current);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[11px] border border-black/8 bg-white/94 text-[#64748B] transition hover:border-black/12 hover:text-[#334155] min-[960px]:hidden"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {mobileActionsOpen ? (
              <div
                className="absolute right-0 top-10 z-30 w-[11rem] rounded-[14px] border border-black/8 bg-[rgba(255,255,255,0.98)] p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.08)] min-[960px]:hidden"
                onClick={stopCardNavigation}
              >
                <div className="space-y-1">
                  <CustomerActionButton
                    icon={Phone}
                    label="拨打"
                    onClick={startPhoneDial}
                    disabled={!canCreateCallRecord}
                    fullWidth
                  />
                  <CustomerActionButton
                    icon={SquarePen}
                    label="记录通话"
                    onClick={openCallDialog}
                    disabled={!canCreateCallRecord}
                    fullWidth
                  />
                  <CustomerActionButton
                    icon={FileText}
                    label="通话记录"
                    onClick={openCallHistoryDialog}
                    fullWidth
                  />
                  <CustomerActionButton
                    icon={FilePlus2}
                    label="创建成交主单"
                    onClick={openCreateTradeOrder}
                    disabled={!canCreateSalesOrder}
                    fullWidth
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col">
          <p className="truncate text-[13.5px] font-semibold leading-5 text-[#111827]">
            {item.phone}
          </p>

          <p
            title={address}
            className="mt-1 h-[2.7rem] line-clamp-2 text-[12px] leading-[1.35rem] text-[#667085]"
          >
            {address}
          </p>

          <div className="mt-auto pt-2">
            <div className="flex min-w-0 items-center gap-2 text-[11px] leading-4 text-black/46">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-[rgba(154,97,51,0.52)]"
              />
              <p
                title={activeDynamicInfo?.title}
                className="min-w-0 flex-1 truncate whitespace-nowrap transition-opacity duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              >
                {activeDynamicInfo?.text}
              </p>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-[46%] hidden -translate-y-1/2 justify-center min-[960px]:flex">
          <div className="flex scale-[0.95] items-center gap-0.5 rounded-full border border-[rgba(255,255,255,0.76)] bg-[rgba(255,255,255,0.78)] p-1 shadow-[0_16px_30px_rgba(15,23,42,0.16)] opacity-0 backdrop-blur-[14px] transition-[opacity,transform] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:translate-y-[-2px] group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-[-2px] group-focus-within:scale-100 group-focus-within:opacity-100">
            <CustomerActionButton
              icon={Phone}
              label="通话"
              onClick={openCallDialog}
              disabled={!canCreateCallRecord}
            />
            <CustomerActionButton
              icon={FileText}
              label="通话记录"
              onClick={openCallHistoryDialog}
            />
            <CustomerActionButton
              icon={FilePlus2}
              label="创建成交主单"
              onClick={openCreateTradeOrder}
              disabled={!canCreateSalesOrder}
            />
          </div>
        </div>
      </article>

      <CustomerModal
        open={callDialogOpen}
        title="记录通话"
        description={`为 ${item.name} 记录本次通话结果、备注和下次跟进时间。`}
        onClose={() => setCallDialogOpen(false)}
      >
        <CustomerIdentity name={item.name} phone={item.phone} />
        <CustomerCallRecordForm
          customerId={item.id}
          resultOptions={callResultOptions}
          onSuccess={() => setCallDialogOpen(false)}
        />
      </CustomerModal>

      <CustomerModal
        open={callHistoryDialogOpen}
        title="通话记录"
        description={`查看 ${item.name} 最近的通话结果与跟进节奏。`}
        onClose={() => setCallHistoryDialogOpen(false)}
      >
        <CustomerIdentity name={item.name} phone={item.phone} />
        <CustomerCallRecordHistory records={item.callRecords} />
      </CustomerModal>
    </>
  );
}
