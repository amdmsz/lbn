import type { LucideIcon } from "lucide-react";
import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: { id: string; name: string; username: string } | null;
};

export type CustomerHeaderProps = Readonly<{
  customer: CustomerContext;
}>;

type Tone = "default" | "info" | "success" | "warning" | "danger";

const statusToneClassName: Record<Tone, string> = {
  default: "border-border/60 bg-card text-muted-foreground",
  info: "border-primary/15 bg-primary/5 text-primary",
  success:
    "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/18 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/15 bg-destructive/8 text-destructive",
};

function StatusPill({
  label,
  tone = "default",
  icon: Icon,
}: Readonly<{
  label: string;
  tone?: Tone;
  icon?: LucideIcon;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        statusToneClassName[tone],
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

function getOwnerLabel(customer: CustomerContext) {
  return customer.owner?.name || customer.owner?.username || "未分配";
}

export default function TradeOrderCustomerHeader({
  customer,
}: CustomerHeaderProps) {
  return (
    <div className="rounded-xl border border-border/55 bg-muted/20 px-4 py-3.5">
      <p className="crm-eyebrow">客户承接</p>
      <div className="mt-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">
              {customer.name}
            </p>
            <p className="mt-1 text-[13px] font-medium tabular-nums text-muted-foreground">
              {customer.phone}
            </p>
          </div>
          <StatusPill label={`归属 ${getOwnerLabel(customer)}`} />
        </div>
        <div className="flex items-start gap-2 border-t border-border/45 pt-3 text-[12px] leading-5 text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{customer.address || "客户档案暂未填写地址"}</span>
        </div>
      </div>
    </div>
  );
}
