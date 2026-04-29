"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";
import { CustomerPhoneSpotlight } from "@/components/customers/customer-phone-spotlight";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";
import type { MobileCallTriggerSource } from "@/lib/calls/mobile-call-followup";
import type { CustomerExecutionClass } from "@/lib/customers/metadata";
import {
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
  formatDateTime,
  isCustomerExecutionDisplayTemporary,
} from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import { CustomerCallRecordHistory } from "@/components/customers/customer-call-record-history";
import type { CallResultOption } from "@/lib/calls/metadata";
import { cn } from "@/lib/utils";

const executionClassQuickResultMap: Partial<
  Record<CustomerExecutionClass, string>
> = {
  B: "WECHAT_ADDED",
  D: "NOT_CONNECTED",
  E: "REFUSED_WECHAT",
};

const quietExecutionClassVariantClassNames: Record<StatusBadgeVariant, string> =
  {
    neutral:
      "border-[var(--crm-badge-neutral-border)] bg-[var(--crm-badge-neutral-bg)] text-[var(--crm-badge-neutral-text)]",
    info: "border-[rgba(111,141,255,0.18)] bg-[rgba(111,141,255,0.12)] text-[var(--color-accent-strong)]",
    success:
      "border-[rgba(87,212,176,0.16)] bg-[rgba(87,212,176,0.12)] text-[var(--color-success)]",
    warning:
      "border-[rgba(240,195,106,0.18)] bg-[rgba(240,195,106,0.12)] text-[var(--color-warning)]",
    danger:
      "border-[rgba(255,148,175,0.16)] bg-[rgba(255,148,175,0.12)] text-[var(--color-danger)]",
  };

const quickClassActions = [
  { value: "D" as const, label: "D 未接通", result: "NOT_CONNECTED" },
  { value: "B" as const, label: "B 已加微信", result: "WECHAT_ADDED" },
  { value: "E" as const, label: "E 拒加", result: "REFUSED_WECHAT" },
];

const dialogSurfaceClassName =
  "rounded-[1.18rem] border border-border bg-card shadow-sm";

const quietActionLinkClassName =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[12px] font-medium text-muted-foreground transition-[border-color,background-color,color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-primary/20 hover:bg-muted hover:text-foreground hover:shadow-sm";

function buildCustomerTradeOrderHref(customerId: string) {
  return `/customers/${customerId}?tab=orders&createTradeOrder=1`;
}

function QuietExecutionClassBadge({
  label,
  variant,
}: Readonly<{
  label: string;
  variant: StatusBadgeVariant;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-[0.32rem] text-[11px] font-medium tracking-[0.04em]",
        quietExecutionClassVariantClassNames[variant],
      )}
    >
      {label}
    </span>
  );
}

function DialogMetaBlock({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-3 shadow-sm">
      <p className="crm-detail-label text-[10px]">{label}</p>
      <p className="mt-1 text-sm font-medium leading-5 text-foreground">
        {value}
      </p>
    </div>
  );
}

export function getCustomerExecutionClassQuickResult(
  value: CustomerExecutionClass,
) {
  return executionClassQuickResultMap[value] ?? "";
}

export function CustomerFollowUpDialog({
  open,
  item,
  resultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
  outboundCallEnabled = false,
  initialResult = "",
  remarkAutoFocus = false,
  triggerSource = "table",
  onClose,
}: Readonly<{
  open: boolean;
  item: CustomerListItem | null;
  resultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder?: boolean;
  outboundCallEnabled?: boolean;
  initialResult?: string;
  remarkAutoFocus?: boolean;
  triggerSource?: MobileCallTriggerSource;
  onClose: () => void;
}>) {
  if (!open || !item) {
    return null;
  }

  const dialog = (
    <CustomerFollowUpDialogBody
      key={`${item.id}:${initialResult}`}
      item={item}
      resultOptions={resultOptions}
      canCreateCallRecord={canCreateCallRecord}
      canCreateSalesOrder={canCreateSalesOrder}
      outboundCallEnabled={outboundCallEnabled}
      initialResult={initialResult}
      remarkAutoFocus={remarkAutoFocus}
      triggerSource={triggerSource}
      onClose={onClose}
    />
  );

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(dialog, document.body);
}

function CustomerFollowUpDialogBody({
  item,
  resultOptions,
  canCreateCallRecord,
  canCreateSalesOrder,
  outboundCallEnabled,
  initialResult,
  remarkAutoFocus,
  triggerSource,
  onClose,
}: Readonly<{
  item: CustomerListItem;
  resultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder: boolean;
  outboundCallEnabled: boolean;
  initialResult: string;
  remarkAutoFocus: boolean;
  triggerSource: MobileCallTriggerSource;
  onClose: () => void;
}>) {
  const [presetResult, setPresetResult] = useState(initialResult);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  const phoneText = item.phone?.trim() || "暂无电话";
  const latestCallRecord = item.callRecords[0] ?? null;
  const visibleCallRecords = isHistoryExpanded
    ? item.callRecords
    : item.callRecords.slice(0, 3);
  const collapsedHistoryCount = Math.max(item.callRecords.length - 3, 0);
  const detailHref = `/customers/${item.id}`;
  const liveHref = `${detailHref}?tab=live`;
  const orderHref = buildCustomerTradeOrderHref(item.id);
  const executionDisplayInput = {
    executionClass: item.executionClass,
    newImported: item.newImported,
    pendingFirstCall: item.pendingFirstCall,
  };
  const executionClassVariant = getCustomerExecutionDisplayVariant(
    executionDisplayInput,
  );
  const executionClassLabel = getCustomerExecutionDisplayLongLabel(
    executionDisplayInput,
  );
  const isTemporaryExecutionDisplay = isCustomerExecutionDisplayTemporary(
    executionDisplayInput,
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`跟进 ${item.name}`}
        className="fixed left-[50%] top-[50%] z-50 flex h-[85vh] max-h-[85vh] w-full max-w-[1000px] translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden rounded-[1.35rem] border border-border bg-background text-foreground shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-border bg-card px-4 py-3 md:px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)]">
                跟进
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-[1.48rem] font-semibold tracking-tight text-foreground">
                  {item.name}
                </h3>
                <QuietExecutionClassBadge
                  label={executionClassLabel}
                  variant={executionClassVariant}
                />
              </div>

              <CustomerPhoneSpotlight
                customerId={item.id}
                customerName={item.name}
                phone={phoneText}
                triggerSource={triggerSource}
                variant="dialog"
                outboundCallEnabled={outboundCallEnabled && canCreateCallRecord}
                outboundCallPlacement="icon"
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <DialogMetaBlock
                  label="最近跟进"
                  value={
                    item.latestFollowUpAt
                      ? formatDateTime(item.latestFollowUpAt)
                      : "暂无"
                  }
                />
                <DialogMetaBlock
                  label="累计通话"
                  value={`${item._count.callRecords} 次`}
                />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Link href={detailHref} className={quietActionLinkClassName}>
                <span>客户详情</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-[border-color,background-color,color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-primary/20 hover:bg-muted hover:text-foreground hover:shadow-sm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative grid min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto overflow-x-hidden px-4 py-3 [scrollbar-width:none] [-ms-overflow-style:none] md:px-5 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.82fr)] lg:overflow-hidden xl:grid-cols-[minmax(0,1.05fr)_minmax(23rem,0.85fr)] [&::-webkit-scrollbar]:hidden">
          <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] lg:h-full [&::-webkit-scrollbar]:hidden">
            <div className={cn(dialogSurfaceClassName, "px-4 py-3.5")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <p className="crm-detail-label text-[11px]">分类推进</p>
                  {isTemporaryExecutionDisplay ? (
                    <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-muted-foreground">
                      首呼后进入 A-E
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={liveHref} className={quietActionLinkClassName}>
                    <span>直播邀约</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                  {canCreateSalesOrder ? (
                    <Link href={orderHref} className={quietActionLinkClassName}>
                      <span>订单</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>

              {canCreateCallRecord ? (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {quickClassActions.map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      onClick={() => setPresetResult(action.result)}
                      className={cn(
                        "inline-flex h-8 items-center rounded-full border px-3.5 text-[12px] font-medium transition-[border-color,background-color,color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px]",
                        presetResult === action.result
                          ? "border-primary/20 bg-primary/10 text-foreground shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-primary/20 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {canCreateCallRecord ? (
              <div
                className={cn(dialogSurfaceClassName, "px-4 py-3.5 md:px-5")}
              >
                <div className="mb-3">
                  <p className="crm-detail-label text-[11px]">本次跟进</p>
                </div>

                <CustomerCallRecordForm
                  customerId={item.id}
                  resultOptions={resultOptions}
                  variant="quick-note"
                  defaultResult={presetResult}
                  remarkAutoFocus={canCreateCallRecord || remarkAutoFocus}
                  submitLabel="保存本次跟进"
                  pendingLabel="保存中..."
                  className={cn(
                    "[&_label]:space-y-1.5",
                    "[&_.crm-label]:text-[10px] [&_.crm-label]:font-semibold [&_.crm-label]:uppercase [&_.crm-label]:tracking-[0.16em] [&_.crm-label]:text-muted-foreground",
                    "[&_.crm-input]:min-h-[2.55rem] [&_.crm-select]:min-h-[2.55rem] [&_.crm-textarea]:min-h-[7.25rem]",
                    "[&_.crm-input]:rounded-lg [&_.crm-select]:rounded-lg [&_.crm-textarea]:rounded-lg",
                    "[&_.crm-input]:border [&_.crm-select]:border [&_.crm-textarea]:border",
                    "[&_.crm-input]:border-border/60 [&_.crm-select]:border-border/60 [&_.crm-textarea]:border-border/60",
                    "[&_.crm-input]:bg-background [&_.crm-select]:bg-background [&_.crm-textarea]:bg-background",
                    "[&_.crm-input]:shadow-sm [&_.crm-select]:shadow-sm [&_.crm-textarea]:shadow-sm",
                    "[&_.crm-input:hover]:bg-background [&_.crm-select:hover]:bg-background [&_.crm-textarea:hover]:bg-background",
                    "[&_.crm-input:focus]:border-primary [&_.crm-select:focus]:border-primary [&_.crm-textarea:focus]:border-primary",
                    "[&_.crm-input:focus]:ring-1 [&_.crm-select:focus]:ring-1 [&_.crm-textarea:focus]:ring-1",
                    "[&_.crm-input:focus]:ring-primary [&_.crm-select:focus]:ring-primary [&_.crm-textarea:focus]:ring-primary",
                    "[&_.crm-banner]:rounded-lg [&_.crm-banner]:border-border/60 [&_.crm-banner]:bg-background [&_.crm-banner]:shadow-none",
                  )}
                  submitButtonClassName="inline-flex w-full items-center justify-center rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  onSuccess={onClose}
                />
              </div>
            ) : (
              <div
                className={cn(
                  dialogSurfaceClassName,
                  "px-4 py-3.5 text-[13px] leading-6 text-[var(--color-sidebar-muted)]",
                )}
              >
                当前角色仅查看最近记录。补记请进入客户详情。
              </div>
            )}
          </div>

          <div
            className={cn(
              dialogSurfaceClassName,
              "flex min-h-[18rem] min-w-0 flex-col px-4 py-3.5 md:px-5 lg:h-full lg:min-h-0",
            )}
          >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="crm-detail-label text-[11px]">最近记录</p>
                <p className="text-[13px] leading-5 text-[var(--color-sidebar-muted)]">
                  {latestCallRecord
                    ? `最新结果：${latestCallRecord.resultLabel}`
                    : "当前客户还没有通话记录"}
                </p>
              </div>
              <p className="text-[12px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
                {`${item._count.callRecords} 条`}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <CustomerCallRecordHistory
                records={visibleCallRecords}
                variant="timeline"
                cardClassName="px-0"
                emptyTitle="暂无跟进记录"
                emptyDescription="补记通话后会显示在这里。"
                emptyClassName="min-h-[12rem] border-border/40 bg-background shadow-none"
              />
              {!isHistoryExpanded && collapsedHistoryCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setIsHistoryExpanded(true)}
                  className="mt-2 w-full rounded-lg border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  展开查看其余 {collapsedHistoryCount} 条记录
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
