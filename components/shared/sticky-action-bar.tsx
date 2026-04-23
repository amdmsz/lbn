import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StickyActionBar({
  title,
  description,
  children,
  className,
  density = "compact",
}: Readonly<{
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  density?: "default" | "compact";
}>) {
  const isCompact = density === "compact";

  return (
    <section
      className={cn(
        isCompact
          ? "crm-subtle-panel lg:sticky lg:top-[var(--crm-sticky-top)] z-20 px-4 py-2.5 backdrop-blur"
          : "crm-subtle-panel lg:sticky lg:top-[var(--crm-sticky-top)] z-20 px-4 py-3 backdrop-blur",
        className,
      )}
    >
      <div className={cn("flex flex-col lg:flex-row lg:justify-between", isCompact ? "gap-2.5 lg:items-center" : "gap-3 lg:items-center")}>
        {(title || description) ? (
          <div className={cn(isCompact ? "space-y-0.5" : "space-y-1")}>
            {title ? <p className={cn("font-semibold text-[var(--foreground)]", isCompact ? "text-[0.94rem]" : "text-sm")}>{title}</p> : null}
            {description ? (
              <p className={cn(isCompact ? "text-[12.5px] leading-5 text-[var(--color-sidebar-muted)] md:text-[13px]" : "text-sm leading-6 text-[var(--color-sidebar-muted)]")}>
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        <div
          className={cn(
            "crm-toolbar-cluster w-full min-w-0 lg:w-auto lg:justify-end",
            isCompact ? "gap-1.5" : "",
          )}
        >
          {children}
        </div>
      </div>
    </section>
  );
}
