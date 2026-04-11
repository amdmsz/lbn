"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FilePlus2, FileText, MoreHorizontal, Phone, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CallResultOption } from "@/lib/calls/metadata";
import { startMobileCallFollowUpDial } from "@/lib/calls/mobile-call-followup";
import {
  formatDateTime,
  formatRelativeDateTime,
  formatRegion,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
  getCustomerWorkStatusVariant,
  type CustomerWorkStatusKey,
} from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { formatCurrency } from "@/lib/fulfillment/metadata";
import { cn } from "@/lib/utils";

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function getRecentInterest(item: CustomerListItem) {
  const interestedProduct = item.latestInterestedProduct?.trim();
  return interestedProduct || "暂无最近意向";
}

function getCardAddress(item: CustomerListItem) {
  const region = formatRegion(item.province, item.city, item.district);
  const detail = item.address?.trim();
  const parts = [region !== "未填写" ? region : null, detail].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "未填写地址";
}

function getOwnerLabel(item: CustomerListItem) {
  return item.owner ? `${item.owner.name} (@${item.owner.username})` : "未分配负责人";
}

function getPrimaryWorkStatus(item: CustomerListItem): CustomerWorkStatusKey | null {
  return item.workingStatuses[0] ?? null;
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
        "inline-flex min-w-0 items-center justify-center font-medium outline-none transition-[border-color,background-color,color,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-black/8",
        fullWidth
          ? "h-9 w-full justify-start gap-2 rounded-[13px] border px-3.5 text-[13px]"
          : "h-7 gap-1.5 rounded-[9px] border px-2.5 text-[11px]",
        disabled
          ? "cursor-not-allowed border-black/5 bg-black/[0.03] text-black/32"
          : "border-black/8 bg-white/92 text-black/72 hover:border-black/12 hover:bg-white hover:text-black/84",
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

  const detailHref = `/customers/${item.id}`;
  const latestFollowUpAt = normalizeDate(item.latestFollowUpAt);
  const latestTradeAt = normalizeDate(item.latestTradeAt);
  const address = getCardAddress(item);
  const hasLifetimeTrade = Number(item.lifetimeTradeAmount) > 0.009;
  const primaryStatus = getPrimaryWorkStatus(item);
  const recentInterest = getRecentInterest(item);
  const phoneText = item.phone?.trim() || "暂无电话";

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

  return (
    <>
      <article
        role="link"
        tabIndex={0}
        aria-label={`进入 ${item.name} 详情页`}
        onClick={() => navigateTo(detailHref)}
        onKeyDown={handleCardKeyDown}
        className={cn(
          "group relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,247,244,0.92))] px-4 py-3.5 shadow-[0_6px_16px_rgba(15,23,42,0.03)] outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "focus-visible:ring-2 focus-visible:ring-black/8 focus-visible:ring-offset-0",
          "min-[960px]:hover:-translate-y-px min-[960px]:hover:border-[rgba(15,23,42,0.12)] min-[960px]:hover:bg-white min-[960px]:hover:shadow-[0_12px_24px_rgba(15,23,42,0.05)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[18px] font-semibold leading-5 tracking-[-0.03em] text-[#0f172a]">
                {item.name}
              </h3>
              <StatusBadge
                label={
                  primaryStatus
                    ? getCustomerWorkStatusLabel(primaryStatus)
                    : getCustomerStatusLabel(item.status)
                }
                variant={
                  primaryStatus ? getCustomerWorkStatusVariant(primaryStatus) : "neutral"
                }
              />
            </div>

            <p className="mt-1.5 text-[18px] font-semibold leading-none tracking-[0.02em] text-[#0f172a] tabular-nums">
              {phoneText}
            </p>

            <div className="mt-2.5 flex items-start gap-2 text-[12px] leading-5 text-black/56">
              <span className="shrink-0 font-medium text-black/38">最近意向</span>
              <p title={recentInterest} className="min-w-0 truncate font-medium text-black/76">
                {recentInterest}
              </p>
            </div>
          </div>

          <div ref={mobileMenuRef} className="relative z-20 flex shrink-0 items-start gap-2">
            <div className="rounded-[14px] border border-black/7 bg-[rgba(255,255,255,0.78)] px-3 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/34">
                累计成交
              </p>
              <p
                className={cn(
                  "mt-1 text-[0.95rem] font-semibold leading-none tracking-[-0.04em] text-[#0f172a]",
                  !hasLifetimeTrade && "text-black/44",
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
                    label="通话历史"
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

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {item.workingStatuses.slice(primaryStatus ? 1 : 0, 2).map((status) => (
            <StatusBadge
              key={status}
              label={getCustomerWorkStatusLabel(status)}
              variant={getCustomerWorkStatusVariant(status)}
            />
          ))}
          <StatusBadge label={getOwnerLabel(item)} variant="neutral" />
        </div>

        <div className="mt-2.5 space-y-1.5 text-[12px] leading-5 text-black/52">
          <p className="truncate" title={address}>
            {address}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span title={latestFollowUpAt ? formatDateTime(latestFollowUpAt) : "暂无跟进记录"}>
              {latestFollowUpAt
                ? `最近跟进 ${formatRelativeDateTime(latestFollowUpAt)}`
                : "最近跟进 暂无"}
            </span>
            <span title={latestTradeAt ? formatDateTime(latestTradeAt) : "暂无成交记录"}>
              {latestTradeAt
                ? `最近成交 ${formatRelativeDateTime(latestTradeAt)}`
                : "最近成交 暂无"}
            </span>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-4 bottom-3 hidden justify-end min-[960px]:flex">
          <div className="flex items-center gap-1 rounded-[11px] border border-white/75 bg-[rgba(255,255,255,0.82)] p-1 shadow-[0_10px_18px_rgba(15,23,42,0.08)] opacity-0 backdrop-blur-[8px] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:-translate-y-0.5 group-focus-within:opacity-100">
            <CustomerActionButton
              icon={SquarePen}
              label="记录通话"
              onClick={openCallDialog}
              disabled={!canCreateCallRecord}
            />
            <CustomerActionButton
              icon={FileText}
              label="历史"
              onClick={openCallHistoryDialog}
            />
            {canCreateSalesOrder ? (
              <CustomerActionButton
                icon={FilePlus2}
                label="成交主单"
                onClick={openCreateTradeOrder}
                disabled={!canCreateSalesOrder}
              />
            ) : null}
          </div>
        </div>
      </article>

      <CustomerModal
        open={callDialogOpen}
        title="记录通话"
        description={`为 ${item.name} 补充本次通话结果、备注和下一次跟进时间。`}
        onClose={() => setCallDialogOpen(false)}
      >
        <CustomerIdentity name={item.name} phone={phoneText} />
        <CustomerCallRecordForm
          customerId={item.id}
          resultOptions={callResultOptions}
          onSuccess={() => setCallDialogOpen(false)}
        />
      </CustomerModal>

      <CustomerModal
        open={callHistoryDialogOpen}
        title="通话历史"
        description={`查看 ${item.name} 最近的通话结果与跟进节奏。`}
        onClose={() => setCallHistoryDialogOpen(false)}
      >
        <CustomerIdentity name={item.name} phone={phoneText} />
        <CustomerCallRecordHistory records={item.callRecords} />
      </CustomerModal>
    </>
  );
}
