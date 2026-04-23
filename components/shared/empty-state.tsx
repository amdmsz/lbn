import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  className,
  density = "compact",
}: Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
  density?: "default" | "compact";
}>) {
  const isCompact = density === "compact";

  return (
    <div
      className={cn(
        "crm-empty-state border border-dashed border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] shadow-none",
        isCompact ? "min-h-[9rem] px-5 py-5" : "",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-[24rem]",
          isCompact ? "space-y-3" : "space-y-4",
        )}
      >
        <div className="crm-empty-state-icon mx-auto">
          <span className="crm-empty-state-dot" />
        </div>
        <p
          className={cn(
            "crm-empty-state-title",
            isCompact ? "text-[0.92rem] tracking-[-0.02em]" : "",
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            "crm-empty-state-copy",
            isCompact ? "text-[12.5px] leading-5" : "",
          )}
        >
          {description}
        </p>
        {action ? (
          <div className="crm-toolbar-cluster justify-center pt-0.5">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
