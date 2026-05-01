"use client";

import type { MouseEvent, MouseEventHandler } from "react";
import { Clock3, PhoneCall, X } from "lucide-react";
import { CustomerCallRecordForm } from "@/components/customers/customer-call-record-form";
import type { MobileCallFollowUpScope } from "@/hooks/use-mobile-call-followup";
import { useMobileCallFollowUp } from "@/hooks/use-mobile-call-followup";
import type { CallResultOption } from "@/lib/calls/metadata";
import {
  startMobileCallFollowUpDial,
  type MobileCallTriggerSource,
} from "@/lib/calls/mobile-call-followup";
import { formatDateTime } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

export function CustomerMobileDialButton({
  customerId,
  customerName,
  phone,
  triggerSource,
  label = "拨打",
  className,
  disabled = false,
  onClick,
}: Readonly<{
  customerId: string;
  customerName: string;
  phone: string;
  triggerSource: MobileCallTriggerSource;
  label?: string;
  className?: string;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}>) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);

    if (event.defaultPrevented || disabled) {
      return;
    }

    startMobileCallFollowUpDial({
      customerId,
      customerName,
      phone,
      triggerSource,
    });
  }

  return (
    <button
      type="button"
      aria-label={`${label}：${customerName}`}
      disabled={disabled}
      onClick={handleClick}
      className={className}
    >
      <span className="inline-flex items-center gap-1.5">
        <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </span>
    </button>
  );
}

function getRecordingStatusLabel(input: {
  recordingStatus: string | null;
  uploadStatus: string | null;
  nativeFailureMessage: string | null;
}) {
  if (
    input.recordingStatus === "READY" ||
    input.recordingStatus === "PROCESSING" ||
    input.recordingStatus === "UPLOADED" ||
    input.uploadStatus === "READY"
  ) {
    return "录音已上传";
  }

  if (input.recordingStatus === "UPLOADING" || input.uploadStatus === "UPLOADING") {
    return "录音上传中";
  }

  if (input.recordingStatus === "RECORDING") {
    return "录音中";
  }

  if (input.recordingStatus === "FAILED") {
    return input.nativeFailureMessage ? `录音失败：${input.nativeFailureMessage}` : "录音失败";
  }

  if (
    input.recordingStatus === "UNSUPPORTED" ||
    input.uploadStatus === "UNSUPPORTED"
  ) {
    return input.nativeFailureMessage ?? "本机录音不支持";
  }

  if (input.recordingStatus === "STARTED") {
    return "录音待上传";
  }

  return null;
}

export function MobileCallFollowUpSheet({
  scope,
  resultOptions,
}: Readonly<{
  scope: MobileCallFollowUpScope;
  resultOptions: CallResultOption[];
}>) {
  const {
    pendingCall,
    sheetOpen,
    showManualResumeEntry,
    openSheet,
    dismissPendingCall,
    snoozePendingCall,
    completePendingCall,
  } = useMobileCallFollowUp(scope);

  if (!pendingCall) {
    return null;
  }

  const recordingStatusLabel = getRecordingStatusLabel({
    recordingStatus: pendingCall.recordingStatus,
    uploadStatus: pendingCall.uploadStatus,
    nativeFailureMessage: pendingCall.nativeFailureMessage,
  });

  return (
    <>
      {sheetOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            aria-label="关闭通话补记"
            onClick={snoozePendingCall}
            className="absolute inset-0 bg-black/28 backdrop-blur-[10px]"
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 pb-5 pt-4 shadow-[var(--color-shell-shadow-lg)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[var(--color-border-soft)]" />

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)]">
                  通话补记
                </p>
                <h3 className="mt-2 text-[1.02rem] font-semibold text-[var(--foreground)]">
                  补记本次通话
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
                  已发起拨打。回页补记结果与备注即可。
                </p>
              </div>

              <button
                type="button"
                aria-label="稍后补记"
                onClick={snoozePendingCall}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] text-[var(--color-sidebar-muted)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] hover:border-[rgba(79,125,247,0.16)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-[20px] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3.5">
              <div className="flex items-center gap-2 text-[12px] text-[var(--color-sidebar-muted)]">
                <PhoneCall className="h-3.5 w-3.5" />
                <span>刚刚拨打</span>
              </div>
              <p className="mt-2 text-[15px] font-semibold text-[var(--foreground)]">
                {pendingCall.customerName}
              </p>
              <p className="mt-1 text-[13px] text-[var(--foreground)]/76">{pendingCall.phone}</p>
              <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--color-sidebar-muted)]">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{formatDateTime(new Date(pendingCall.createdAt))}</span>
              </div>
              {recordingStatusLabel ? (
                <p className="mt-2 text-[12px] text-[var(--color-sidebar-muted)]">
                  {recordingStatusLabel}
                </p>
              ) : null}
            </div>

            <CustomerCallRecordForm
              customerId={pendingCall.customerId}
              resultOptions={resultOptions}
              variant="mobile-followup"
              className="mt-4"
              submitLabel="保存本次通话"
              pendingLabel="保存中..."
              defaultDurationSeconds={pendingCall.durationSeconds ?? 0}
              defaultCallTime={pendingCall.createdAt}
              mobileCallRecordId={pendingCall.callRecordId}
              remarkAutoFocus
              onSuccess={completePendingCall}
              onCancel={dismissPendingCall}
              onLater={snoozePendingCall}
            />
          </div>
        </div>
      ) : null}

      {showManualResumeEntry ? (
        <button
          type="button"
          onClick={openSheet}
          className={cn(
            "fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full border border-[rgba(79,125,247,0.16)] bg-[var(--color-shell-surface-strong)] px-4 py-3 text-[13px] font-medium text-[var(--foreground)] shadow-[var(--color-shell-shadow-md)] md:hidden",
          )}
        >
          <PhoneCall className="h-4 w-4" />
          <span>补记刚才通话</span>
        </button>
      ) : null}
    </>
  );
}
