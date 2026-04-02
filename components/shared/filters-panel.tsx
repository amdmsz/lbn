import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FiltersPanel({
  title,
  description,
  actions,
  children,
  density = "compact",
  className,
  eyebrow = "筛选区",
}: Readonly<{
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  density?: "default" | "compact";
  className?: string;
  eyebrow?: string;
}>) {
  const isCompact = density === "compact";

  return (
    <section
      className={cn(
        isCompact
          ? "space-y-3 rounded-[0.95rem] border border-black/7 bg-[rgba(255,255,255,0.82)] px-4 py-3 shadow-[0_8px_18px_rgba(18,24,31,0.03)] md:px-5 md:py-3.5"
          : "crm-filter-panel space-y-3",
        className,
      )}
    >
      <div className={cn("flex flex-col lg:flex-row lg:justify-between", isCompact ? "gap-2.5 lg:items-center" : "gap-2 lg:items-start")}>
        <div className="crm-section-heading">
          <p className={cn("crm-eyebrow", isCompact ? "text-black/40" : "")}>{eyebrow}</p>
          <h2 className={cn("crm-section-title", isCompact ? "text-[0.94rem] text-black/84" : "")}>{title}</h2>
          {description ? (
            <p className={cn("crm-section-copy", isCompact ? "text-[12.5px] leading-5 text-black/54 md:text-[13px]" : "")}>
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className={cn("crm-toolbar-cluster", isCompact ? "gap-1.5" : "")}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
