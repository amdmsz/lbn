"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ErrorState({
  eyebrow,
  title,
  description,
  detail,
  action,
  className,
  density = "compact",
}: Readonly<{
  eyebrow?: string;
  title: string;
  description: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
  density?: "default" | "compact";
}>) {
  const isCompact = density === "compact";

  return (
    <div
      className={cn(
        "crm-error-state border border-[rgba(154,68,55,0.18)] bg-[linear-gradient(180deg,rgba(252,246,245,0.92),rgba(255,255,255,0.9))]",
        isCompact ? "min-h-[9.5rem] px-5 py-5" : "",
        className,
      )}
    >
      <div className={cn(isCompact ? "space-y-2.5" : "space-y-3")}>
        {eyebrow ? (
          <p className={cn("crm-eyebrow text-[var(--color-danger)]", isCompact ? "text-[10px]" : "")}>
            {eyebrow}
          </p>
        ) : null}
        <h2 className={cn("crm-error-state-title", isCompact ? "text-[0.94rem]" : "")}>{title}</h2>
        <p className={cn("crm-error-state-copy", isCompact ? "text-[13px] leading-5" : "")}>{description}</p>
        {detail ? (
          <p className={cn("text-[var(--color-danger)]", isCompact ? "text-[13px] leading-5" : "text-sm leading-7")}>{detail}</p>
        ) : null}
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </div>
  );
}
