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
        "rounded-xl border border-border/60 bg-card p-6 transition-colors",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "-m-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md p-2 text-left",
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
            {/* title: 收敛到 title 18px, 14px 太小且和 body 撞档 */}
            <h3 className="truncate text-[1.0625rem] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h3>
            {badge ? <span className="shrink-0">{badge}</span> : null}
          </div>
          {description ? (
            <p className="truncate text-[0.8125rem] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </button>
      {open ? (
        <div className={cn("mt-4 border-t border-border/60 pt-4", contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
