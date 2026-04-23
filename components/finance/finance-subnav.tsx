import Link from "next/link";
import { cn } from "@/lib/utils";

type FinanceTabKey = "payments" | "reconciliation" | "exceptions";

const financeTabs: Array<{
  key: FinanceTabKey;
  href: string;
  label: string;
}> = [
  {
    key: "payments",
    href: "/finance/payments",
    label: "收款",
  },
  {
    key: "reconciliation",
    href: "/finance/reconciliation",
    label: "对账",
  },
  {
    key: "exceptions",
    href: "/finance/exceptions",
    label: "异常",
  },
];

export function FinanceSubnav({
  active,
}: Readonly<{
  active: FinanceTabKey;
}>) {
  return (
    <nav className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-1.5 py-1.5 shadow-[var(--color-shell-shadow-sm)]">
      <div className="flex flex-wrap items-center gap-1">
        {financeTabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={cn(
              "inline-flex min-h-9 items-center rounded-[0.82rem] border px-3.5 py-2 text-[13px] font-medium transition-[border-color,background-color,box-shadow,color,transform] duration-150 motion-safe:hover:-translate-y-[1px]",
              active === tab.key
                ? "border-[var(--color-accent-soft)] bg-[var(--color-accent)]/8 text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
                : "border-transparent bg-transparent text-[var(--color-sidebar-muted)] hover:border-[var(--color-border-soft)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
