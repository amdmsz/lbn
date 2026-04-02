import type { ReactNode } from "react";
import { ScrollAnchor } from "@/components/shared/scroll-anchor";
import { cn } from "@/lib/utils";

export function PageHeader({
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
          ? "relative overflow-hidden rounded-[0.95rem] border border-black/7 bg-[rgba(255,255,255,0.82)] px-4 py-3 shadow-[0_10px_22px_rgba(18,24,31,0.04)] md:px-5 md:py-3.5"
          : "crm-card relative overflow-hidden border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(249,247,243,0.92))] p-5 shadow-[0_20px_44px_rgba(18,24,31,0.06)] md:p-6",
        className,
      )}
    >
      {!isCompact ? (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/25 to-transparent" />
      ) : null}
      <div
        className={cn(
          "flex flex-col lg:flex-row lg:justify-between",
          isCompact ? "gap-3 md:gap-3.5 lg:items-center" : "gap-5 lg:items-start",
        )}
      >
        <div className={cn("min-w-0", isCompact ? "max-w-3xl space-y-1.5" : "max-w-4xl space-y-3")}>
          <div className={cn("flex flex-wrap items-center", isCompact ? "gap-1.5" : "gap-2")}>
            <p className={cn("crm-eyebrow", isCompact ? "text-black/42" : "text-[var(--color-accent)]")}>
              {eyebrow}
            </p>
            {showSystemLabel ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]/70" />
                <p className="text-xs text-black/48">Liquor CRM</p>
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
                  ? "max-w-2xl text-[12.5px] leading-5 text-black/54 md:text-[13px]"
                  : "max-w-3xl text-sm leading-7 text-black/58 md:text-[0.95rem]",
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
              "crm-header-actions shrink-0",
              isCompact
                ? "self-start lg:self-center"
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
