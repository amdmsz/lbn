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
        "crm-empty-state border border-dashed border-black/10 bg-[linear-gradient(180deg,rgba(250,248,244,0.78),rgba(255,255,255,0.9))]",
        isCompact ? "min-h-[9.5rem] px-5 py-5" : "",
        className,
      )}
    >
      <div className={cn(isCompact ? "space-y-3" : "space-y-3.5")}>
        <div className="crm-empty-state-icon mx-auto">
          <span className="crm-empty-state-dot" />
        </div>
        <p className={cn("crm-empty-state-title", isCompact ? "text-[0.94rem]" : "")}>{title}</p>
        <p className={cn("crm-empty-state-copy", isCompact ? "text-[13px] leading-5" : "")}>{description}</p>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
