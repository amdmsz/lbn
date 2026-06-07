"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type CollapsibleSectionProps = Readonly<{
  title: string;
  description?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}>;

export default function CollapsibleSection({
  title,
  description,
  badge,
  defaultOpen = false,
  children,
  className,
  contentClassName,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);

  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-sm transition-colors",
        "dark:border-border dark:bg-card",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left",
          "transition-colors hover:bg-muted/40 focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {title}
            </h3>
            {badge ? <span className="shrink-0">{badge}</span> : null}
          </div>
          {description ? (
            <p className="truncate text-xs text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </button>
      {open ? (
        <div className={cn("mt-3 border-t border-border pt-3", contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
