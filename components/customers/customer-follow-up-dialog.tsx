"use client";

import Link from "next/link";
import { useState } from "react";
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

const executionClassQuickResultMap: Partial<Record<CustomerExecutionClass, string>> = {
  B: "WECHAT_ADDED",
  D: "NOT_CONNECTED",
  E: "REFUSED_WECHAT",
};

const quietExecutionClassVariantClassNames: Record<StatusBadgeVariant, string> = {
  neutral:
    "border-[var(--crm-badge-neutral-border)] bg-[var(--crm-badge-neutral-bg)] text-[var(--crm-badge-neutral-text)]",
  info:
    "border-[rgba(111,141,255,0.18)] bg-[rgba(111,141,255,0.12)] text-[var(--color-accent-strong)]",
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
  "rounded-[1.18rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)]";

const quietActionLinkClassName =
  "inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3 text-[12px] font-medium text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] hover:shadow-[var(--color-shell-shadow-sm)]";

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
    <div className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3.5 py-2.5">
      <p className="crm-detail-label">{label}</p>
      <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--foreground)]">{value}</p>
    </div>
  );
}

export function getCustomerExecutionClassQuickResult(value: CustomerExecutionClass) {
  return executionClassQuickResultMap[value] ?? "";
}

export function CustomerFollowUpDialog({
  open,
  item,
  resultOptions,
  canCreateCallRecord,
  canCreateSalesOrder = false,
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
  initialResult?: string;
  remarkAutoFocus?: boolean;
  triggerSource?: MobileCallTriggerSource;
  onClose: () => void;
}>) {
  if (!open || !item) {
    return null;
  }

  return (
    <CustomerFollowUpDialogBody
      key={`${item.id}:${initialResult}`}
      item={item}
      resultOptions={resultOptions}
      canCreateCallRecord={canCreateCallRecord}
      canCreateSalesOrder={canCreateSalesOrder}
      initialResult={initialResult}
      remarkAutoFocus={remarkAutoFocus}
      triggerSource={triggerSource}
      onClose={onClose}
    />
  );
}

function CustomerFollowUpDialogBody({
  item,
  resultOptions,
  canCreateCallRecord,
  canCreateSalesOrder,
  initialResult,
  remarkAutoFocus,
  triggerSource,
  onClose,
}: Readonly<{
  item: CustomerListItem;
  resultOptions: CallResultOption[];
  canCreateCallRecord: boolean;
  canCreateSalesOrder: boolean;
  initialResult: string;
  remarkAutoFocus: boolean;
  triggerSource: MobileCallTriggerSource;
  onClose: () => void;
}>) {
  const [presetResult, setPresetResult] = useState(initialResult);

  const phoneText = item.phone?.trim() || "暂无电话";
  const latestCallRecord = item.callRecords[0] ?? null;
  const detailHref = `/customers/${item.id}`;
  const liveHref = `${detailHref}?tab=live`;
  const orderHref = buildCustomerTradeOrderHref(item.id);
  const executionDisplayInput = {
    executionClass: item.executionClass,
    newImported: item.newImported,
    pendingFirstCall: item.pendingFirstCall,
  };
  const executionClassVariant = getCustomerExecutionDisplayVariant(executionDisplayInput);
  const executionClassLabel = getCustomerExecutionDisplayLongLabel(executionDisplayInput);
  const isTemporaryExecutionDisplay = isCustomerExecutionDisplayTemporary(executionDisplayInput);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(8,11,18,0.44)] px-4 py-6 backdrop-blur-[12px] lg:pl-[var(--dashboard-sidebar-width,0px)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`跟进 ${item.name}`}
        className="relative flex max-h-[calc(100vh-3rem)] w-full max-w-[66rem] flex-col overflow-hidden rounded-[1.55rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative border-b border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-5 py-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)]">
                跟进
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-[1.48rem] font-semibold tracking-[-0.045em] text-[var(--foreground)]">
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
              />

              <div className="grid gap-2 sm:grid-cols-2">
                <DialogMetaBlock
                  label="最近跟进"
                  value={item.latestFollowUpAt ? formatDateTime(item.latestFollowUpAt) : "暂无"}
                />
                <DialogMetaBlock label="累计通话" value={`${item._count.callRecords} 次`} />
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
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[var(--color-sidebar-muted)] transition-[border-color,background-color,color,box-shadow,transform] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)] hover:shadow-[var(--color-shell-shadow-sm)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative grid gap-4 overflow-y-auto px-5 py-4 md:px-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(19rem,0.92fr)]">
          <div className="space-y-3.5">
            <div className={cn(dialogSurfaceClassName, "px-4 py-3.5")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <p className="crm-detail-label text-[11px]">分类推进</p>
                  {isTemporaryExecutionDisplay ? (
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-2.5 py-1 text-[10px] font-medium tracking-[0.04em] text-[var(--color-sidebar-muted)]">
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
                          ? "border-[rgba(122,154,255,0.24)] bg-[rgba(111,141,255,0.12)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
                          : "border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[var(--color-sidebar-muted)] hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
                      )}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {canCreateCallRecord ? (
              <div className={cn(dialogSurfaceClassName, "px-4 py-3.5 md:px-5")}>
                <div className="mb-3">
                  <p className="crm-detail-label text-[11px]">本次跟进</p>
                </div>

                <CustomerCallRecordForm
                  customerId={item.id}
                  resultOptions={resultOptions}
                  variant="quick-note"
                  defaultResult={presetResult}
                  remarkAutoFocus={remarkAutoFocus}
                  submitLabel="保存本次跟进"
                  pendingLabel="保存中..."
                  className={cn(
                    "[&_label]:space-y-1.5",
                    "[&_.crm-label]:text-[10px] [&_.crm-label]:font-semibold [&_.crm-label]:uppercase [&_.crm-label]:tracking-[0.16em] [&_.crm-label]:text-[var(--color-sidebar-muted)]",
                    "[&_.crm-input]:min-h-[2.75rem] [&_.crm-select]:min-h-[2.75rem] [&_.crm-textarea]:min-h-[8.75rem]",
                    "[&_.crm-input]:rounded-[1.05rem] [&_.crm-select]:rounded-[1.05rem] [&_.crm-textarea]:rounded-[1.1rem]",
                    "[&_.crm-input]:border-[var(--color-border-soft)] [&_.crm-select]:border-[var(--color-border-soft)] [&_.crm-textarea]:border-[var(--color-border-soft)]",
                    "[&_.crm-input]:bg-[var(--color-shell-surface)] [&_.crm-select]:bg-[var(--color-shell-surface)] [&_.crm-textarea]:bg-[var(--color-shell-surface)]",
                    "[&_.crm-input]:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] [&_.crm-select]:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] [&_.crm-textarea]:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
                    "[&_.crm-banner]:rounded-[1rem] [&_.crm-banner]:border-[var(--color-border-soft)] [&_.crm-banner]:bg-[var(--color-shell-surface)] [&_.crm-banner]:shadow-none",
                    "[&_.crm-button-primary]:min-h-[2.6rem] [&_.crm-button-primary]:rounded-full [&_.crm-button-primary]:px-4 [&_.crm-button-primary]:text-[12px] [&_.crm-button-primary]:shadow-[0_12px_24px_rgba(79,125,247,0.16)]",
                  )}
                  onSuccess={onClose}
                />
              </div>
            ) : (
              <div className={cn(dialogSurfaceClassName, "px-4 py-3.5 text-[13px] leading-6 text-[var(--color-sidebar-muted)]")}>
                当前角色仅查看最近记录。补记请进入客户详情。
              </div>
            )}
          </div>

          <div className={cn(dialogSurfaceClassName, "flex min-h-0 flex-col px-4 py-3.5 md:px-5")}>
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

            <CustomerCallRecordHistory
              records={item.callRecords}
              className="space-y-2.5"
              cardClassName="rounded-[1.05rem] border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-3 shadow-none hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:shadow-none"
              emptyTitle="暂无跟进记录"
              emptyDescription="补记通话后会显示在这里。"
              emptyClassName="min-h-[12rem] border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] shadow-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
