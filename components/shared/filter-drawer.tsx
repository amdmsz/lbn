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
        "group crm-card overflow-hidden border-black/7 bg-white/92 shadow-[0_14px_32px_rgba(18,24,31,0.04)]",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
        <div className="space-y-1">
          <p className="crm-eyebrow text-black/48">Advanced Filters</p>
          <p className="text-sm font-semibold text-black/82">{title}</p>
          {description ? <p className="text-sm leading-6 text-black/54">{description}</p> : null}
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-black/8 bg-[rgba(247,248,250,0.92)] text-black/55 transition-transform group-open:rotate-180">
          <ChevronDown className="h-4 w-4" />
        </span>
      </summary>
      <div className="border-t border-black/7 px-4 py-4">{children}</div>
    </details>
  );
}
