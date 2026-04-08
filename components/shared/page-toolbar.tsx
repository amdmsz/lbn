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
          ? "overflow-hidden rounded-[0.95rem] border border-black/7 bg-white/88 shadow-[0_10px_22px_rgba(18,24,31,0.04)]"
          : "crm-card overflow-hidden border-black/7 bg-white/90 shadow-[0_18px_42px_rgba(18,24,31,0.05)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col lg:flex-row lg:justify-between",
          isCompact ? "gap-3 px-4 py-3 md:px-5 md:py-3.5 lg:items-center" : "gap-4 px-4 py-4 md:px-5 lg:items-start",
        )}
      >
        <div className={cn("min-w-0", isCompact ? "space-y-1.5" : "space-y-2")}>
          <p className={cn("crm-eyebrow", isCompact ? "text-black/40" : "text-black/48")}>{eyebrow}</p>
          {title ? (
            <h2 className={cn("font-semibold text-black/84", isCompact ? "text-[0.94rem]" : "text-base")}>
              {title}
            </h2>
          ) : null}
          {description ? (
            <p
              className={cn(
                isCompact
                  ? "max-w-3xl text-[12.5px] leading-5 text-black/54 md:text-[13px]"
                  : "max-w-3xl text-sm leading-6 text-black/56",
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
            "border-t border-black/7",
            isCompact
              ? "bg-[rgba(247,248,250,0.72)] px-4 py-2.5 md:px-5"
              : "bg-[linear-gradient(180deg,rgba(247,248,250,0.86),rgba(255,255,255,0.86))] px-4 py-3 md:px-5",
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
