import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageToolbar({
  eyebrow = "Command Bar",
  title,
  description,
  primary,
  secondary,
  density = "compact",
  className,
}: Readonly<{
  eyebrow?: string;
  title?: string;
  description?: string;
  primary?: ReactNode;
  secondary?: ReactNode;
  density?: "default" | "compact";
  className?: string;
}>) {
  const isCompact = density === "compact";

  return (
    <section
      className={cn(
        isCompact
          ? "overflow-hidden rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow]"
          : "crm-card overflow-hidden border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-md)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col lg:flex-row lg:justify-between",
          isCompact
            ? "gap-2.5 px-4 py-3 md:px-4.5 md:py-3.5 lg:items-center"
            : "gap-4 px-4 py-4 md:px-5 lg:items-start",
        )}
      >
        <div className={cn("min-w-0", isCompact ? "space-y-1.5" : "space-y-2")}>
          <p className="crm-eyebrow">{eyebrow}</p>
          {title ? (
            <h2
              className={cn(
                "font-semibold text-[var(--foreground)]",
                isCompact ? "text-[0.92rem]" : "text-base",
              )}
            >
              {title}
            </h2>
          ) : null}
          {description ? (
            <p
              className={cn(
                isCompact
                  ? "max-w-3xl text-[12.5px] leading-5 text-[var(--color-sidebar-muted)] md:text-[13px]"
                  : "max-w-3xl text-sm leading-6 text-[var(--color-sidebar-muted)]",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {secondary ? (
          <div
            className={cn(
              "crm-toolbar-cluster w-full min-w-0 lg:w-auto lg:justify-end",
              isCompact ? "gap-1.5" : "",
            )}
          >
            {secondary}
          </div>
        ) : null}
      </div>
      {primary ? (
        <div
          className={cn(
            "border-t border-[var(--color-border-soft)]",
            isCompact
              ? "bg-[var(--color-shell-surface-soft)] px-4 py-2.5 md:px-4.5"
              : "bg-[var(--color-shell-surface)] px-4 py-3 md:px-5",
          )}
        >
          <div className={cn("min-w-0 overflow-x-auto", isCompact ? "pb-0.5" : "")}>
            <div className={cn("crm-toolbar-cluster min-w-max", isCompact ? "gap-1.5" : "")}>
              {primary}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export const CommandBar = PageToolbar;
