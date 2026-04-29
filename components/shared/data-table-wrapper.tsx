import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTableWrapper({
  title,
  description,
  toolbar,
  children,
  emptyState,
  density = "compact",
  headerMode = "default",
  className,
  contentClassName,
  eyebrow,
}: Readonly<{
  title: string;
  description?: string;
  toolbar?: ReactNode;
  children?: ReactNode;
  emptyState?: ReactNode;
  density?: "default" | "compact";
  headerMode?: "default" | "hidden";
  className?: string;
  contentClassName?: string;
  eyebrow?: string;
}>) {
  const isCompact = density === "compact";
  const showHeader = headerMode !== "hidden";

  return (
    <section
      className={cn(
        isCompact
          ? "crm-animate-enter overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-[border-color,background-color,box-shadow]"
          : "crm-card crm-animate-enter overflow-hidden border border-border/60 bg-card shadow-sm",
        className,
      )}
    >
      {showHeader ? (
        <div
          className={cn(
            "flex flex-col border-b border-[var(--color-border-soft)] lg:flex-row lg:justify-between",
            isCompact
              ? "gap-2 bg-transparent px-4 py-2.5 md:px-5 md:py-3 lg:items-center"
              : "gap-3 bg-transparent px-5 py-4 lg:items-center",
          )}
        >
          <div className="crm-section-heading">
            {eyebrow ? <p className="crm-eyebrow">{eyebrow}</p> : null}
            <h2
              className={cn(
                "crm-section-title",
                isCompact ? "text-[0.91rem] text-[var(--foreground)]" : "",
              )}
            >
              {title}
            </h2>
            {description ? (
              <p
                className={cn(
                  "crm-section-copy",
                  isCompact ? "text-[11.5px] leading-[1.1rem] md:text-[12px]" : "",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
          {toolbar ? (
            <div
              className={cn(
                "crm-toolbar-cluster w-full min-w-0 lg:w-auto lg:justify-end",
                isCompact ? "gap-1.5" : "",
              )}
            >
              {toolbar}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          isCompact ? "p-3 md:p-3.5" : "p-4 md:p-5",
          contentClassName,
        )}
      >
        {children ? (
          children
        ) : (
          <div className="crm-empty-state text-sm leading-7 text-[var(--color-sidebar-muted)]">
            {emptyState ?? "暂无数据。"}
          </div>
        )}
      </div>
    </section>
  );
}
