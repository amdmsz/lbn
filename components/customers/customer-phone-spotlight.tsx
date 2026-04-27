"use client";

import { CustomerMobileDialButton } from "@/components/customers/mobile-call-followup-sheet";
import { CustomerOutboundCallButton } from "@/components/customers/customer-outbound-call-button";
import type { MobileCallTriggerSource } from "@/lib/calls/mobile-call-followup";
import { cn } from "@/lib/utils";

type CustomerPhoneSpotlightVariant = "table" | "dialog";

export function CustomerPhoneSpotlight({
  customerId,
  customerName,
  phone,
  triggerSource,
  variant = "table",
  className,
  onFocusCustomer,
  outboundCallEnabled = false,
}: Readonly<{
  customerId: string;
  customerName: string;
  phone: string;
  triggerSource: MobileCallTriggerSource;
  variant?: CustomerPhoneSpotlightVariant;
  className?: string;
  onFocusCustomer?: () => void;
  outboundCallEnabled?: boolean;
}>) {
  const normalizedPhone = phone.trim();
  const hasPhone = normalizedPhone.length > 0 && normalizedPhone !== "暂无电话";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2",
        variant === "dialog"
          ? "justify-between rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3"
          : "justify-between rounded-[0.9rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-2.5 py-2",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          title={hasPhone ? normalizedPhone : undefined}
          className={cn(
            "truncate font-semibold tabular-nums text-[var(--foreground)]",
            variant === "dialog"
              ? "text-[1.22rem] leading-none tracking-[0.08em] md:text-[1.38rem]"
              : "text-[15px] leading-none tracking-[0.06em]",
          )}
        >
          {hasPhone ? normalizedPhone : "暂无电话"}
        </p>
      </div>

      {hasPhone ? (
        <div className="flex shrink-0 items-center gap-2">
          {outboundCallEnabled ? (
            <CustomerOutboundCallButton
              customerId={customerId}
              customerName={customerName}
              label={variant === "dialog" ? "CRM 外呼" : "外呼"}
              className={cn(
                variant === "dialog"
                  ? "h-10 border-[rgba(79,125,247,0.22)] bg-[var(--foreground)] px-4 text-[12px] text-[var(--color-panel)] hover:border-[rgba(79,125,247,0.34)] hover:bg-[var(--foreground)]/92"
                  : "h-7 border-[var(--color-border-soft)] bg-[var(--color-shell-surface-strong)] px-2.5 text-[11px] text-[var(--foreground)]",
              )}
            />
          ) : (
            <CustomerMobileDialButton
              customerId={customerId}
              customerName={customerName}
              phone={normalizedPhone}
              triggerSource={triggerSource}
              onClick={onFocusCustomer}
              label={variant === "dialog" ? "拨打并录音" : "拨打"}
              className={cn(
                "inline-flex items-center justify-center rounded-full border font-medium shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] md:hidden",
                variant === "dialog"
                  ? "h-10 border-[rgba(79,125,247,0.22)] bg-[var(--foreground)] px-4 text-[12px] text-[var(--color-panel)] hover:border-[rgba(79,125,247,0.34)] hover:bg-[var(--foreground)]/92"
                  : "h-7 border-[var(--color-border-soft)] bg-[var(--color-shell-surface-strong)] px-2.5 text-[11px] text-[var(--foreground)]",
              )}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
