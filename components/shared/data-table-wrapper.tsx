import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTableWrapper({
  title,
  description,
  toolbar,
  children,
  emptyState,
  density = "compact",
  className,
  contentClassName,
  eyebrow = "数据工作区",
}: Readonly<{
  title: string;
  description?: string;
  toolbar?: ReactNode;
  children?: ReactNode;
  emptyState?: ReactNode;
  density?: "default" | "compact";
  className?: string;
  contentClassName?: string;
  eyebrow?: string;
}>) {
  const isCompact = density === "compact";

  return (
    <section
      className={cn(
        isCompact
          ? "overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.86)] shadow-[0_10px_22px_rgba(18,24,31,0.04)]"
          : "crm-card overflow-hidden border border-black/7 bg-[rgba(255,255,255,0.92)] shadow-[0_18px_36px_rgba(18,24,31,0.05)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col border-b border-black/8 lg:flex-row lg:justify-between",
          isCompact
            ? "gap-2.5 bg-[rgba(247,248,250,0.66)] px-4 py-3 md:px-5 md:py-3.5 lg:items-center"
            : "gap-3 bg-[rgba(247,248,250,0.72)] px-5 py-4 lg:items-center",
        )}
      >
        <div className="crm-section-heading">
          <p className={cn("crm-eyebrow", isCompact ? "text-black/40" : "")}>{eyebrow}</p>
          <h2
            className={cn(
              "crm-section-title",
              isCompact ? "text-[0.95rem] text-black/84" : "",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p
              className={cn(
                "crm-section-copy",
                isCompact ? "text-[12.5px] leading-5 text-black/54 md:text-[13px]" : "",
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

      <div className={cn(isCompact ? "p-3.5 md:p-4" : "p-4 md:p-5", contentClassName)}>
        {children ? (
          children
        ) : (
          <div className="crm-empty-state text-sm leading-7 text-black/55">
            {emptyState ?? "暂无数据。"}
          </div>
        )}
      </div>
    </section>
  );
}
