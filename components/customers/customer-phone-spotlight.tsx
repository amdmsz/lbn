"use client";

import { Phone } from "lucide-react";
import { CustomerMobileDialButton } from "@/components/customers/mobile-call-followup-sheet";
import { CustomerOutboundCallButton } from "@/components/customers/customer-outbound-call-button";
import type { MobileCallTriggerSource } from "@/lib/calls/mobile-call-followup";
import { cn } from "@/lib/utils";

type CustomerPhoneSpotlightVariant = "table" | "dialog";
type CustomerPhoneSpotlightOutboundPlacement = "actions" | "icon";

export function CustomerPhoneSpotlight({
  customerId,
  customerName,
  phone,
  triggerSource,
  variant = "table",
  className,
  phoneClassName,
  onFocusCustomer,
  outboundCallEnabled = false,
  outboundCallPlacement = "actions",
}: Readonly<{
  customerId: string;
  customerName: string;
  phone: string;
  triggerSource: MobileCallTriggerSource;
  variant?: CustomerPhoneSpotlightVariant;
  className?: string;
  phoneClassName?: string;
  onFocusCustomer?: () => void;
  outboundCallEnabled?: boolean;
  outboundCallPlacement?: CustomerPhoneSpotlightOutboundPlacement;
}>) {
  const normalizedPhone = phone.trim();
  const hasPhone = normalizedPhone.length > 0 && normalizedPhone !== "暂无电话";
  const isDialog = variant === "dialog";
  const shouldUseOutboundIcon =
    isDialog && hasPhone && outboundCallEnabled && outboundCallPlacement === "icon";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2",
        isDialog ? "justify-between px-0 py-0" : "justify-start px-0 py-0",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {shouldUseOutboundIcon ? (
          <CustomerOutboundCallButton
            customerId={customerId}
            customerName={customerName}
            label="CRM 外呼"
            showLabel={false}
            className="h-8 w-8 border-primary/20 bg-primary/10 px-0 text-primary hover:border-primary/30 hover:bg-primary/15"
          />
        ) : isDialog ? (
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
            <Phone className="h-4 w-4" aria-hidden="true" />
          </span>
        ) : null}
        <p
          title={hasPhone ? normalizedPhone : undefined}
          className={cn(
            "truncate font-mono font-semibold tabular-nums tracking-tight text-foreground",
            isDialog
              ? "text-2xl leading-none"
              : "text-base font-bold leading-6 tracking-tight",
            phoneClassName,
          )}
        >
          {hasPhone ? normalizedPhone : "暂无电话"}
        </p>
      </div>

      {hasPhone ? (
        <div className="flex shrink-0 items-center gap-2">
          {outboundCallEnabled && !shouldUseOutboundIcon ? (
            <CustomerOutboundCallButton
              customerId={customerId}
              customerName={customerName}
              label={isDialog ? "CRM 外呼" : "外呼"}
              className={cn(
                isDialog
                  ? "h-9 border-primary/20 bg-primary px-3.5 text-[12px] text-primary-foreground hover:border-primary/30 hover:bg-primary/90"
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
              label={isDialog ? "拨打并录音" : "拨打"}
              className={cn(
                "inline-flex items-center justify-center rounded-full border font-medium shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,transform,box-shadow] duration-150 motion-safe:hover:-translate-y-[1px] md:hidden",
                isDialog
                  ? "h-9 border-primary/20 bg-primary px-3.5 text-[12px] text-primary-foreground hover:border-primary/30 hover:bg-primary/90"
                  : "h-7 border-[var(--color-border-soft)] bg-[var(--color-shell-surface-strong)] px-2.5 text-[11px] text-[var(--foreground)]",
              )}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
