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
          ? "relative overflow-hidden rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-4 py-2.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow] md:px-5 md:py-3"
          : "crm-card relative overflow-hidden border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-4.5 shadow-[var(--color-shell-shadow-md)] md:p-5",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col lg:flex-row lg:justify-between",
          isCompact ? "gap-2.5 lg:items-start" : "gap-5 lg:items-start",
        )}
      >
        <div
          className={cn(
            "min-w-0",
            isCompact ? "max-w-3xl space-y-1.5" : "max-w-4xl space-y-3",
          )}
        >
          {context ? <div>{context}</div> : null}
          <div
            className={cn(
              "flex flex-wrap items-center",
              isCompact ? "gap-1.5" : "gap-2",
            )}
          >
            <p
              className={cn(
                "crm-eyebrow",
                isCompact
                  ? "text-[var(--color-sidebar-muted)]"
                  : "text-[var(--color-sidebar-muted)]",
              )}
            >
              {eyebrow}
            </p>
            {showSystemLabel ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]/70" />
                <p className="text-xs text-[var(--color-sidebar-muted)]">
                  {BRAND_NAME_EN}
                </p>
              </>
            ) : null}
          </div>
          <h1
            className={cn(
              "font-semibold tracking-tight text-[var(--foreground)]",
              isCompact
                ? "text-[1.08rem] md:text-[1.28rem]"
                : "text-[1.64rem] md:text-[1.92rem]",
            )}
          >
            {title}
          </h1>
          {description ? (
            <p
              className={cn(
                isCompact
                  ? "max-w-2xl text-[11.5px] leading-[1.15rem] text-[var(--color-sidebar-muted)]"
                  : "max-w-4xl text-sm leading-6 text-[var(--color-sidebar-muted)] md:text-[0.92rem]",
              )}
            >
              {description}
            </p>
          ) : null}
          {meta ? (
            <div
              className={cn(
                "crm-toolbar-cluster",
                isCompact ? "gap-1.25 pt-0" : "pt-0.5",
              )}
            >
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            className={cn(
              "crm-header-actions w-full min-w-0 lg:w-auto lg:max-w-[24rem] lg:justify-end",
              isCompact ? "self-start" : "self-start",
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
