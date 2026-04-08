import type { ReactNode } from "react";
import { ScrollAnchor } from "@/components/shared/scroll-anchor";
import { BRAND_NAME_EN } from "@/lib/branding";
import { cn } from "@/lib/utils";

export function PageHeader({
  context,
  eyebrow = "业务工作台",
  title,
  description,
  actions,
  meta,
  density = "compact",
  showSystemLabel = false,
  className,
  anchorId = "page-top",
}: Readonly<{
  context?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  density?: "default" | "compact";
  showSystemLabel?: boolean;
  className?: string;
  anchorId?: string;
}>) {
  const isCompact = density === "compact";

  const content = (
    <header
      className={cn(
        isCompact
          ? "relative overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.86)] px-4 py-3.5 shadow-[0_10px_22px_rgba(18,24,31,0.04)] md:px-5 md:py-4"
          : "crm-card relative overflow-hidden border border-black/7 bg-[rgba(255,255,255,0.92)] p-5 shadow-[0_18px_36px_rgba(18,24,31,0.05)] md:p-6",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col lg:flex-row lg:justify-between",
          isCompact ? "gap-3.5 lg:items-start" : "gap-5 lg:items-start",
        )}
      >
        <div className={cn("min-w-0", isCompact ? "max-w-3xl space-y-2" : "max-w-4xl space-y-3")}>
          {context ? <div>{context}</div> : null}
          <div className={cn("flex flex-wrap items-center", isCompact ? "gap-1.5" : "gap-2")}>
            <p
              className={cn(
                "crm-eyebrow",
                isCompact ? "text-black/42" : "text-[var(--color-accent)]",
              )}
            >
              {eyebrow}
            </p>
            {showSystemLabel ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]/70" />
                <p className="text-xs text-black/48">{BRAND_NAME_EN}</p>
              </>
            ) : null}
          </div>
          <h1
            className={cn(
              "font-semibold tracking-tight text-black/88",
              isCompact ? "text-[1.28rem] md:text-[1.5rem]" : "text-[1.75rem] md:text-[2.15rem]",
            )}
          >
            {title}
          </h1>
          {description ? (
            <p
              className={cn(
                isCompact
                  ? "max-w-3xl text-[12.5px] leading-5 text-black/54 md:text-[13px]"
                  : "max-w-4xl text-sm leading-7 text-black/58 md:text-[0.95rem]",
              )}
            >
              {description}
            </p>
          ) : null}
          {meta ? (
            <div className={cn("crm-toolbar-cluster", isCompact ? "gap-1.5 pt-0.5" : "pt-1")}>
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            className={cn(
              "crm-header-actions w-full min-w-0 lg:w-auto lg:max-w-[24rem] lg:justify-end",
              isCompact
                ? "self-start"
                : "crm-action-surface self-start border border-black/7 bg-[rgba(247,248,250,0.82)]",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );

  return <ScrollAnchor anchorId={anchorId}>{content}</ScrollAnchor>;
}
