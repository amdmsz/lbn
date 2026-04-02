import Link from "next/link";
import { cn } from "@/lib/utils";

type FinanceTabKey = "payments" | "reconciliation" | "exceptions";

const financeTabs: Array<{
  key: FinanceTabKey;
  href: string;
  label: string;
  description: string;
}> = [
  {
    key: "payments",
    href: "/finance/payments",
    label: "收款视图",
    description: "PaymentRecord 财务收款预览",
  },
  {
    key: "reconciliation",
    href: "/finance/reconciliation",
    label: "对账预览",
    description: "PaymentPlan / PaymentRecord / CollectionTask 聚合口径",
  },
  {
    key: "exceptions",
    href: "/finance/exceptions",
    label: "异常预览",
    description: "异常订单、履约和礼品运费提示",
  },
];

export function FinanceSubnav({
  active,
}: Readonly<{
  active: FinanceTabKey;
}>) {
  return (
    <nav className="grid gap-3 md:grid-cols-3">
      {financeTabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "crm-card block p-4 transition-colors",
            active === tab.key
              ? "border-[var(--color-accent)]/45 bg-white"
              : "hover:border-[var(--color-accent)]/30 hover:bg-white/90",
          )}
        >
          <p className="crm-eyebrow">{tab.label}</p>
          <p className="mt-2 text-sm font-semibold text-black/82">{tab.description}</p>
        </Link>
      ))}
    </nav>
  );
}
