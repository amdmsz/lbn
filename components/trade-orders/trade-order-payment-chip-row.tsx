"use client";

import { CheckCircle2, CreditCard } from "lucide-react";

import { cn } from "@/lib/utils";

export type PaymentSchemeOption = {
  value:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  label: string;
  description: string;
};

export type PaymentChipRowProps = Readonly<{
  schemes: PaymentSchemeOption[];
  paymentScheme: PaymentSchemeOption["value"];
  onPaymentSchemeChange: (value: PaymentSchemeOption["value"]) => void;
  depositAmount: string;
  onDepositAmountChange: (value: string) => void;
}>;

function isDepositScheme(value: PaymentSchemeOption["value"]) {
  return value === "DEPOSIT_PLUS_BALANCE" || value === "DEPOSIT_PLUS_COD";
}

export default function TradeOrderPaymentChipRow({
  schemes,
  paymentScheme,
  onPaymentSchemeChange,
  depositAmount,
  onDepositAmountChange,
}: PaymentChipRowProps) {
  const depositActive = isDepositScheme(paymentScheme);
  const depositFieldValue = depositActive ? depositAmount : "0";

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {schemes.map((option) => {
          const active = option.value === paymentScheme;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onPaymentSchemeChange(option.value)}
              className={cn(
                "min-h-[5.4rem] rounded-xl border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow,transform]",
                active
                  ? "border-primary/35 bg-primary/8 shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                  : "border-border/55 bg-[var(--color-shell-surface-soft)] hover:border-primary/25 hover:bg-white",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">
                  {option.label}
                </span>
                {active ? (
                  <CheckCircle2
                    className="h-4 w-4 text-primary"
                    aria-hidden="true"
                  />
                ) : (
                  <CreditCard
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                {option.description}
              </p>
            </button>
          );
        })}
      </div>

      <label className="block">
        <span className="crm-label">定金金额</span>
        <input
          name="depositAmount"
          type="number"
          min="0"
          step="0.01"
          value={depositFieldValue}
          onChange={(event) => onDepositAmountChange(event.target.value)}
          disabled={!depositActive}
          className="crm-input disabled:cursor-not-allowed disabled:bg-foreground/5"
          placeholder="0.00"
        />
      </label>
    </div>
  );
}
