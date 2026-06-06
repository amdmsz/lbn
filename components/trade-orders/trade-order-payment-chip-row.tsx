"use client";

import {
  CheckCircle2,
  Coins,
  CreditCard,
  Hourglass,
  Truck,
  type LucideIcon,
} from "lucide-react";

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

const SCHEME_ICONS: Record<PaymentSchemeOption["value"], LucideIcon> = {
  FULL_PREPAID: CreditCard,
  DEPOSIT_PLUS_BALANCE: Hourglass,
  FULL_COD: Truck,
  DEPOSIT_PLUS_COD: Coins,
};

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {schemes.map((option) => {
          const active = option.value === paymentScheme;
          const Icon = active ? CheckCircle2 : SCHEME_ICONS[option.value];
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onPaymentSchemeChange(option.value)}
              title={option.description}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-[border-color,background-color,color]",
                active
                  ? "border-primary/40 bg-primary/8 text-primary"
                  : "border-border/60 bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground",
              )}
              aria-pressed={active}
            >
              <Icon
                className={cn(
                  "h-3.5 w-3.5",
                  active ? "text-primary" : "text-muted-foreground/80",
                )}
                aria-hidden="true"
              />
              {option.label}
            </button>
          );
        })}
      </div>

      {depositActive ? (
        <label className="block max-w-xs">
          <span className="crm-label">定金金额</span>
          <input
            name="depositAmount"
            type="number"
            min="0"
            step="0.01"
            value={depositAmount}
            onChange={(event) => onDepositAmountChange(event.target.value)}
            className="crm-input"
            placeholder="0.00"
          />
        </label>
      ) : (
        <input
          type="hidden"
          name="depositAmount"
          value="0"
          readOnly
        />
      )}
    </div>
  );
}
