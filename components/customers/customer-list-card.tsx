"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { FilePlus2, FileText, MoreHorizontal, Phone, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import { StatusBadge } from "@/components/shared/status-badge";
import { TagPill } from "@/components/shared/tag-pill";
import type { CallResultOption } from "@/lib/calls/metadata";
import { startMobileCallFollowUpDial } from "@/lib/calls/mobile-call-followup";
import {
  formatDateTime,
  formatRelativeDateTime,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
  getCustomerWorkStatusVariant,
} from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function getImportLabel(value: Date) {
  return formatRelativeDateTime(value);
}

function getCardProduct(item: CustomerListItem) {
  const purchasedProduct = item.latestPurchasedProduct?.trim();
  if (purchasedProduct) return purchasedProduct;

  const interestedProduct = item.latestInterestedProduct?.trim();
  if (interestedProduct) return interestedProduct;

  return "暂无商品或意向记录";
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
  emphasis = "default",
  divider = false,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  emphasis?: "default" | "highlight";
  divider?: boolean;
}>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick();
      }}
      className={cn(
        "relative inline-flex min-w-0 items-center justify-center font-medium tracking-[-0.01em] outline-none transition-[border-color,background-color,color,opacity,box-shadow,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.08)] focus-visible:ring-offset-0",
        fullWidth
          ? "h-9 w-full justify-start gap-1.5 rounded-[12px] border px-3.5 text-[13px]"
          : "h-7 gap-[5px] rounded-full px-2.5 text-[11.5px] leading-none",
        !fullWidth &&
          divider &&
          "before:absolute before:-left-px before:top-1/2 before:h-3 before:w-px before:-translate-y-1/2 before:bg-[linear-gradient(180deg,rgba(15,23,42,0),rgba(15,23,42,0.065),rgba(15,23,42,0))]",
        fullWidth
          ? disabled
            ? "cursor-not-allowed border-black/5 bg-black/[0.03] text-black/34"
            : "border-black/8 bg-white/90 text-black/76 hover:border-black/12 hover:bg-white hover:text-black/88 active:bg-[rgba(247,248,250,0.96)]"
          : disabled
            ? emphasis === "highlight"
              ? "cursor-not-allowed border border-[rgba(154,97,51,0.08)] bg-[rgba(255,255,255,0.42)] text-[rgba(84,55,31,0.34)] shadow-none"
              : "cursor-not-allowed border-transparent bg-transparent text-black/30 shadow-none"
            : emphasis === "highlight"
              ? "border border-[rgba(154,97,51,0.16)] bg-[rgba(154,97,51,0.08)] text-[rgba(84,55,31,0.96)] hover:border-[rgba(154,97,51,0.24)] hover:bg-[rgba(154,97,51,0.12)] hover:text-[rgba(84,55,31,0.98)]"
              : "border border-transparent bg-transparent text-black/64 hover:bg-[rgba(15,23,42,0.05)] hover:text-black/84 active:bg-[rgba(15,23,42,0.07)] active:text-black/86",
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
  if (!open) return null;

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
  const importedAt = normalizeDate(item.latestImportAt) ?? item.createdAt;
  const address = getCardAddress(item);
  const product = getCardProduct(item);
  const tags = item.customerTags.slice(0, 2);
  const extraTagCount = Math.max(item.customerTags.length - tags.length, 0);
  const statusChips = item.workingStatuses.slice(0, 2);
  const latestFollowUpAt = normalizeDate(item.latestFollowUpAt);

  useEffect(() => {
    if (!mobileActionsOpen) return;

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
    if (!canCreateCallRecord) return;
    setMobileActionsOpen(false);
    setCallDialogOpen(true);
  }

  function startPhoneDial() {
    if (!canCreateCallRecord) return;
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
    if (!canCreateSalesOrder) return;
    navigateTo(buildCustomerTradeOrderHref(item.id));
  }

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
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
          "group relative flex min-h-[176px] cursor-pointer flex-col overflow-hidden rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(249,247,243,0.88))] px-4 pb-4 pt-4 shadow-[0_6px_18px_rgba(15,23,42,0.03)] outline-none transition-[transform,border-color,background-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "focus-visible:ring-2 focus-visible:ring-[rgba(15,23,42,0.10)] focus-visible:ring-offset-0 md:min-h-[188px] md:px-5 md:pb-5 md:pt-5",
          "min-[960px]:hover:-translate-y-px min-[960px]:hover:border-[rgba(15,23,42,0.12)] min-[960px]:hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,247,243,0.92))] min-[960px]:hover:shadow-[0_12px_28px_rgba(15,23,42,0.06)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[20px] font-semibold leading-7 tracking-[-0.02em] text-[#101828] md:text-[22px]">
              {item.name}
            </h3>
            <p className="mt-1 text-[12px] text-black/46" title={formatDateTime(importedAt)}>
              {getImportLabel(importedAt)}
            </p>
          </div>

          <div ref={mobileMenuRef} className="relative z-20 flex shrink-0 items-start gap-2">
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

        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <p className="text-[15px] font-semibold leading-6 text-[#111827]">{item.phone}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {statusChips.length > 0
              ? statusChips.map((status) => (
                  <StatusBadge
                    key={status}
                    label={getCustomerWorkStatusLabel(status)}
                    variant={getCustomerWorkStatusVariant(status)}
                  />
                ))
              : item.status !== "ACTIVE"
                ? (
                  <StatusBadge
                    label={getCustomerStatusLabel(item.status)}
                    variant={
                      item.status === "BLACKLISTED"
                        ? "danger"
                        : item.status === "LOST"
                          ? "danger"
                          : "warning"
                    }
                  />
                )
                : null}
            {tags.map((tagLink) => (
              <TagPill
                key={tagLink.id}
                label={tagLink.tag.name}
                color={tagLink.tag.color}
                className="px-2 py-0.5 text-[10px] font-semibold shadow-none"
              />
            ))}
            {extraTagCount > 0 ? (
              <span className="text-[11px] text-black/42">+{extraTagCount}</span>
            ) : null}
          </div>

          <p
            title={address}
            className="mt-2 line-clamp-2 text-[12.5px] leading-6 text-[#667085]"
          >
            {address}
          </p>

          <div className="mt-auto flex flex-col gap-2 pt-4 min-[640px]:flex-row min-[640px]:items-end min-[640px]:justify-between">
            <p
              title={product}
              className="min-w-0 line-clamp-2 text-[12.5px] font-medium leading-6 text-[#475467]"
            >
              {product}
            </p>
            <p
              className="text-[11px] text-black/46 min-[640px]:shrink-0"
              title={latestFollowUpAt ? formatDateTime(latestFollowUpAt) : "暂无跟进"}
            >
              {latestFollowUpAt ? `跟进 ${formatRelativeDateTime(latestFollowUpAt)}` : "待跟进"}
            </p>
          </div>
        </div>

        <div className="mt-3 hidden min-[960px]:flex min-h-[2.75rem] items-end justify-end">
          <div className="pointer-events-none flex max-w-full translate-y-[4px] flex-wrap items-center justify-end gap-1 rounded-[16px] border border-[rgba(15,23,42,0.06)] bg-[rgba(255,255,255,0.94)] px-1.5 py-1 opacity-0 shadow-[0_10px_20px_rgba(15,23,42,0.08)] transition-[opacity,transform] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
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
                divider
              />
              <CustomerActionButton
                icon={FilePlus2}
                label="创建成交主单"
                onClick={openCreateTradeOrder}
                disabled={!canCreateSalesOrder}
                emphasis="highlight"
                divider
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
