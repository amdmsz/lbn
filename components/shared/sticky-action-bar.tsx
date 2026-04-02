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
          ? "sticky top-3 z-20 rounded-[0.95rem] border border-black/8 bg-[rgba(255,255,255,0.84)] px-4 py-2.5 backdrop-blur shadow-[0_10px_22px_rgba(18,24,31,0.05)]"
          : "sticky top-3 z-20 rounded-[1rem] border border-black/8 bg-[rgba(255,255,255,0.88)] px-4 py-3 backdrop-blur shadow-[0_16px_36px_rgba(18,24,31,0.08)]",
        className,
      )}
    >
      <div className={cn("flex flex-col lg:flex-row lg:justify-between", isCompact ? "gap-2.5 lg:items-center" : "gap-3 lg:items-center")}>
        {(title || description) ? (
          <div className={cn(isCompact ? "space-y-0.5" : "space-y-1")}>
            {title ? <p className={cn("font-semibold text-black/84", isCompact ? "text-[0.94rem]" : "text-sm")}>{title}</p> : null}
            {description ? (
              <p className={cn(isCompact ? "text-[12.5px] leading-5 text-black/54 md:text-[13px]" : "text-sm leading-6 text-black/56")}>
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className={cn("crm-toolbar-cluster", isCompact ? "gap-1.5" : "")}>{children}</div>
      </div>
    </section>
  );
}
