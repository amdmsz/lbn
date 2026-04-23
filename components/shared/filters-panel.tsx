import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FiltersPanel({
  title,
  description,
  actions,
  children,
  density = "compact",
  headerMode = "default",
  className,
  eyebrow = "筛选区",
}: Readonly<{
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  density?: "default" | "compact";
  headerMode?: "default" | "hidden";
  className?: string;
  eyebrow?: string;
}>) {
  const isCompact = density === "compact";
  const showHeader = headerMode !== "hidden";

  return (
    <section
      className={cn(
        "crm-filter-panel overflow-visible space-y-3",
        isCompact ? "crm-animate-enter" : "",
        className,
      )}
    >
      {showHeader ? (
        <div
          className={cn(
            "flex flex-col lg:flex-row lg:justify-between",
            isCompact ? "gap-2.5 lg:items-center" : "gap-2 lg:items-start",
          )}
        >
          <div className="crm-section-heading">
            <p className={cn("crm-eyebrow", isCompact ? "text-[var(--color-sidebar-muted)]" : "")}>
              {eyebrow}
            </p>
            <h2
              className={cn(
                "crm-section-title",
                isCompact ? "text-[0.94rem] text-[var(--foreground)]" : "",
              )}
            >
              {title}
            </h2>
            {description ? (
              <p
                className={cn(
                  "crm-section-copy",
                  isCompact ? "text-[12px] leading-5 md:text-[12.5px]" : "",
                )}
              >
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className={cn("crm-toolbar-cluster", isCompact ? "gap-1.5" : "")}>
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
