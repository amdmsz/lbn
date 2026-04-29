"use client";

import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ExternalLink,
  FilePlus2,
  FileText,
  MoreHorizontal,
  Phone,
  SquarePen,
  Trash2,
} from "lucide-react";
import {
  CustomerFollowUpDialog,
  getCustomerExecutionClassQuickResult,
} from "@/components/customers/customer-follow-up-dialog";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import {
  CustomerRecycleInlineEntry,
  type MoveCustomerToRecycleBinAction,
} from "@/components/customers/customer-recycle-entry";
import { StatusBadge } from "@/components/shared/status-badge";
import type { CallResultOption } from "@/lib/calls/metadata";
import { startMobileCallFollowUpDial } from "@/lib/calls/mobile-call-followup";
import {
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
  formatDateTime,
  formatRelativeDateTime,
  formatRegion,
  getCustomerStatusLabel,
  getCustomerWorkStatusLabel,
  getCustomerWorkStatusVariant,
} from "@/lib/customers/metadata";
import { getCustomerOwnershipModeLabel } from "@/lib/customers/public-pool-metadata";
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
        "inline-flex min-w-0 items-center justify-center font-medium outline-none transition-[border-color,background-color,color,opacity,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[rgba(122,154,255,0.16)]",
        fullWidth
          ? "h-9 w-full justify-start gap-2 rounded-[12px] border px-3 text-[13px] sm:px-3.5"
          : "h-7 gap-1 rounded-[8px] border px-2 text-[10.5px] sm:h-7.5 sm:gap-1.5 sm:rounded-[9px] sm:px-2.5 sm:text-[11px]",
        disabled
          ? "cursor-not-allowed border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)] opacity-55"
          : "border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[var(--foreground)] hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] hover:shadow-[var(--color-shell-shadow-sm)]",
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,5,10,0.62)] px-4 py-8 backdrop-blur-[14px] lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[1.3rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border-soft)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
              <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                {description}
              </p>
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
    <div className="mb-4 rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3 text-sm leading-6 text-[var(--color-sidebar-muted)]">
      <p className="font-medium text-[var(--foreground)]">{name}</p>
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
  outboundCallEnabled = false,
  moveToRecycleBinAction,
  selectable = false,
  selected = false,
  focused = false,
  onToggleSelected,
  onFocusCustomer,
}: Readonly<{
  item: CustomerListItem;
  callResultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  outboundCallEnabled?: boolean;
  moveToRecycleBinAction?: MoveCustomerToRecycleBinAction;
  selectable?: boolean;
  selected?: boolean;
  focused?: boolean;
  onToggleSelected?: () => void;
  onFocusCustomer?: () => void;
}>) {
  const router = useRouter();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [callHistoryDialogOpen, setCallHistoryDialogOpen] = useState(false);
  const [followUpDialogOpen, setFollowUpDialogOpen] = useState(false);
  const [followUpInitialResult, setFollowUpInitialResult] = useState("");
  const [followUpRemarkAutoFocus, setFollowUpRemarkAutoFocus] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const detailHref = `/customers/${item.id}`;
  const popupDetailHref = `${detailHref}?mode=popup`;
  const latestFollowUpAt = normalizeDate(item.latestFollowUpAt);
  const latestTradeAt = normalizeDate(item.latestTradeAt);
  const address = getCardAddress(item);
  const hasLifetimeTrade = Number(item.lifetimeTradeAmount) > 0.009;
  const recentInterest = getRecentInterest(item);
  const phoneText = item.phone?.trim() || "暂无电话";
  const canDialFromCard = canCreateCallRecord && phoneText !== "暂无电话";
  const recycleEntryProps = {
    customerId: item.id,
    customerName: item.name,
    phone: phoneText,
    statusLabel: getCustomerStatusLabel(item.status),
    ownershipLabel: getCustomerOwnershipModeLabel(item.ownershipMode),
    ownerLabel: getOwnerLabel(item),
    lastEffectiveFollowUpAt: item.lastEffectiveFollowUpAt,
    approvedTradeOrderCount: item.approvedTradeOrderCount,
    linkedLeadCount: item._count.leads,
    initialGuard: item.recycleGuard,
    initialFinalizePreview: item.recycleFinalizePreview,
    moveToRecycleBinAction,
  };

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
    onFocusCustomer?.();
    setMobileActionsOpen(false);
    router.push(href);
  }

  function openDetailInNewWindow() {
    onFocusCustomer?.();
    setMobileActionsOpen(false);
    window.open(popupDetailHref, "_blank", "noopener,noreferrer");
  }

  function openCallDialog() {
    if (!canCreateCallRecord) {
      return;
    }

    onFocusCustomer?.();
    setMobileActionsOpen(false);
    setCallDialogOpen(true);
  }

  function startPhoneDial() {
    if (!canCreateCallRecord) {
      return;
    }

    onFocusCustomer?.();
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

  function openFollowUpDialog(options: {
    initialResult?: string;
    remarkAutoFocus?: boolean;
  } = {}) {
    onFocusCustomer?.();
    setMobileActionsOpen(false);
    setFollowUpInitialResult(
      options.initialResult ??
        (item.newImported && item.pendingFirstCall
          ? ""
          : item.callRecords[0]?.resultCode ?? getCustomerExecutionClassQuickResult(item.executionClass)),
    );
    setFollowUpRemarkAutoFocus(options.remarkAutoFocus ?? false);
    setFollowUpDialogOpen(true);
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
        id={`customer-row-${item.id}`}
        role="link"
        tabIndex={0}
        aria-label={`进入 ${item.name} 详情页`}
        onClick={() => navigateTo(detailHref)}
        onKeyDown={handleCardKeyDown}
        className={cn(
          "group relative flex cursor-pointer flex-col overflow-hidden rounded-[18px] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] outline-none transition-[border-color,background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          "focus-visible:ring-2 focus-visible:ring-[rgba(122,154,255,0.16)] focus-visible:ring-offset-0",
          "min-[960px]:hover:-translate-y-px min-[960px]:hover:border-[rgba(122,154,255,0.16)] min-[960px]:hover:bg-[var(--color-shell-hover)] min-[960px]:hover:shadow-[var(--color-shell-shadow-md)]",
          focused &&
            "scroll-mt-28 border-[rgba(79,125,247,0.32)] bg-[linear-gradient(180deg,rgba(248,250,255,0.98),rgba(255,255,255,0.96))] shadow-[inset_3px_0_0_var(--color-accent),var(--color-shell-shadow-md)]",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {selectable ? (
              <div className="flex shrink-0 items-center pt-0.5" onClick={stopCardNavigation}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelected?.()}
                  aria-label={`选择客户 ${item.name}`}
                  className="h-4 w-4 rounded border border-[var(--color-border)] bg-[var(--color-shell-surface)] text-[var(--color-accent)] focus:ring-[rgba(122,154,255,0.16)]"
                />
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[18px] font-semibold leading-5 tracking-[-0.03em] text-[var(--foreground)]">
                  {item.name}
                </h3>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    openFollowUpDialog({
                      initialResult:
                        (item.newImported && item.pendingFirstCall
                          ? ""
                          : getCustomerExecutionClassQuickResult(item.executionClass)) ||
                        item.callRecords[0]?.resultCode ||
                        "",
                    });
                  }}
                  className="rounded-full outline-none transition-transform duration-150 hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-[rgba(122,154,255,0.16)]"
                >
                  <StatusBadge
                    label={getCustomerExecutionDisplayLongLabel({
                      executionClass: item.executionClass,
                      newImported: item.newImported,
                      pendingFirstCall: item.pendingFirstCall,
                    })}
                    variant={getCustomerExecutionDisplayVariant({
                      executionClass: item.executionClass,
                      newImported: item.newImported,
                      pendingFirstCall: item.pendingFirstCall,
                    })}
                  />
                </button>
              </div>

              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="font-mono text-xl font-bold leading-none tracking-tight text-[var(--foreground)] tabular-nums">
                  {phoneText}
                </p>
                {canDialFromCard ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      startPhoneDial();
                    }}
                    className="inline-flex h-8 w-fit items-center gap-1.5 rounded-full border border-[rgba(79,125,247,0.18)] bg-[var(--foreground)] px-3 text-[12px] font-semibold text-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[rgba(79,125,247,0.3)] hover:bg-[var(--foreground)]/92"
                  >
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>拨打并录音</span>
                  </button>
                ) : null}
              </div>

              <div className="mt-2.5 flex items-start gap-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                <span className="shrink-0 font-medium text-[var(--color-sidebar-muted)]">
                  最近意向
                </span>
                <p
                  title={recentInterest}
                  className="min-w-0 truncate font-normal text-[var(--color-sidebar-muted)]"
                >
                  {recentInterest}
                </p>
              </div>
            </div>
          </div>

          <div ref={mobileMenuRef} className="relative z-20 flex shrink-0 items-start gap-2">
            <div className="rounded-[14px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 py-2 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                累计成交
              </p>
              <p
                className={cn(
                  "mt-1 text-[0.95rem] font-semibold leading-none tracking-[-0.04em] text-[var(--foreground)]",
                  !hasLifetimeTrade && "text-[var(--color-sidebar-muted)]",
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-[11px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[var(--color-sidebar-muted)] transition hover:border-[rgba(122,154,255,0.16)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] min-[960px]:hidden"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            <div
              className={cn(
                "absolute right-0 top-10 z-30 w-[11rem] rounded-[14px] border border-[var(--color-border-soft)] bg-[var(--color-panel-strong)] p-1.5 shadow-[var(--color-shell-shadow-md)] min-[960px]:hidden",
                mobileActionsOpen ? "block" : "hidden",
              )}
              onClick={stopCardNavigation}
            >
              <div className="space-y-1">
                <CustomerActionButton
                  icon={ExternalLink}
                  label="新窗口详情"
                  onClick={openDetailInNewWindow}
                  fullWidth
                />
                <CustomerActionButton
                  icon={Phone}
                  label="拨打并录音"
                  onClick={startPhoneDial}
                  disabled={!canDialFromCard}
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
                  label="订单"
                  onClick={openCreateTradeOrder}
                  disabled={!canCreateSalesOrder}
                  fullWidth
                />
                {moveToRecycleBinAction ? (
                  <CustomerRecycleInlineEntry
                    {...recycleEntryProps}
                    moveToRecycleBinAction={moveToRecycleBinAction}
                    renderTrigger={({ canMoveToRecycleBin, openDialog }) => (
                      canMoveToRecycleBin ? (
                        <CustomerActionButton
                          icon={Trash2}
                          label="移入回收站"
                          onClick={() => {
                            setMobileActionsOpen(false);
                            openDialog();
                          }}
                          fullWidth
                        />
                      ) : null
                    )}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {item.workingStatuses.slice(0, 2).map((status) => (
            <StatusBadge
              key={status}
              label={getCustomerWorkStatusLabel(status)}
              variant={getCustomerWorkStatusVariant(status)}
            />
          ))}
          {item.workingStatuses.length === 0 ? (
            <StatusBadge label={getCustomerStatusLabel(item.status)} variant="neutral" />
          ) : null}
          <StatusBadge label={getOwnerLabel(item)} variant="neutral" />
        </div>

        <div className="mt-2.5 space-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
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
          <div className="flex items-center gap-1 rounded-[11px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-strong)] p-1 shadow-[var(--color-shell-shadow-sm)] opacity-0 backdrop-blur-[8px] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:pointer-events-auto group-hover:-translate-y-0.5 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:-translate-y-0.5 group-focus-within:opacity-100">
            <CustomerActionButton
              icon={ExternalLink}
              label="新开"
              onClick={openDetailInNewWindow}
            />
            <CustomerActionButton
              icon={SquarePen}
              label="记录通话"
              onClick={openCallDialog}
              disabled={!canCreateCallRecord}
            />
            <CustomerActionButton icon={FileText} label="历史" onClick={openCallHistoryDialog} />
            {canCreateSalesOrder ? (
              <CustomerActionButton
                icon={FilePlus2}
                label="订单"
                onClick={openCreateTradeOrder}
                disabled={!canCreateSalesOrder}
              />
            ) : null}
            {moveToRecycleBinAction ? (
              <CustomerRecycleInlineEntry
                {...recycleEntryProps}
                moveToRecycleBinAction={moveToRecycleBinAction}
                renderTrigger={({ canMoveToRecycleBin, openDialog }) => (
                  canMoveToRecycleBin ? (
                    <CustomerActionButton
                      icon={Trash2}
                      label="移入回收站"
                      onClick={openDialog}
                    />
                  ) : null
                )}
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

      <CustomerFollowUpDialog
        open={followUpDialogOpen}
        item={item}
        resultOptions={callResultOptions}
        canCreateCallRecord={canCreateCallRecord}
        canCreateSalesOrder={canCreateSalesOrder}
        outboundCallEnabled={outboundCallEnabled}
        initialResult={followUpInitialResult}
        remarkAutoFocus={followUpRemarkAutoFocus}
        triggerSource="card"
        onClose={() => setFollowUpDialogOpen(false)}
      />
    </>
  );
}
