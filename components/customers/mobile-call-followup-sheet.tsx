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
      disabled={disabled}
      onClick={handleClick}
      className={className}
    >
      {label}
    </button>
  );
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

  return (
    <>
      {sheetOpen ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            aria-label="关闭通话补记"
            onClick={snoozePendingCall}
            className="absolute inset-0 bg-black/32 backdrop-blur-[2px]"
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-black/8 bg-[rgba(255,255,255,0.98)] px-4 pb-5 pt-4 shadow-[0_-18px_42px_rgba(15,23,42,0.16)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-black/10" />

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/38">
                  回页补记
                </p>
                <h3 className="mt-2 text-[1.05rem] font-semibold text-black/86">
                  记录这次通话结果
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-black/56">
                  已发起拨打，回到页面后手动补记结果与备注。系统不会伪造接通或挂机状态。
                </p>
              </div>

              <button
                type="button"
                aria-label="稍后补记"
                onClick={snoozePendingCall}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-white/90 text-black/48"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-[20px] border border-black/7 bg-[rgba(247,248,250,0.82)] px-4 py-3.5">
              <div className="flex items-center gap-2 text-[12px] text-black/48">
                <PhoneCall className="h-3.5 w-3.5" />
                <span>刚刚拨打</span>
              </div>
              <p className="mt-2 text-[15px] font-semibold text-black/84">
                {pendingCall.customerName}
              </p>
              <p className="mt-1 text-[13px] text-black/58">{pendingCall.phone}</p>
              <div className="mt-2 flex items-center gap-2 text-[12px] text-black/46">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{formatDateTime(new Date(pendingCall.createdAt))}</span>
              </div>
            </div>

            <CustomerCallRecordForm
              customerId={pendingCall.customerId}
              resultOptions={resultOptions}
              variant="mobile-followup"
              className="mt-4"
              submitLabel="保存本次通话"
              pendingLabel="保存中..."
              defaultDurationSeconds={0}
              defaultCallTime={pendingCall.createdAt}
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
            "fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full border border-[rgba(154,97,51,0.18)] bg-[rgba(255,250,245,0.96)] px-4 py-3 text-[13px] font-medium text-[rgba(84,55,31,0.96)] shadow-[0_12px_24px_rgba(15,23,42,0.12)] md:hidden",
          )}
        >
          <PhoneCall className="h-4 w-4" />
          <span>补记刚才通话</span>
        </button>
      ) : null}
    </>
  );
}
