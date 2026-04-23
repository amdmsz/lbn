import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterDrawer({
  title = "高级筛选",
  description,
  children,
  defaultOpen = false,
  className,
}: Readonly<{
  title?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}>) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group crm-card overflow-hidden border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)]",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
        <div className="space-y-1">
          <p className="crm-eyebrow">Advanced Filters</p>
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          {description ? <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">{description}</p> : null}
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] text-[var(--color-sidebar-muted)] transition-transform group-open:rotate-180">
          <ChevronDown className="h-4 w-4" />
        </span>
      </summary>
      <div className="border-t border-[var(--color-border-soft)] px-4 py-4">{children}</div>
    </details>
  );
}
