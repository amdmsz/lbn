import type { ReactNode } from "react";
import { ScrollAnchor } from "@/components/shared/scroll-anchor";
import { cn } from "@/lib/utils";

export function SectionCard({
  eyebrow,
  title,
  description,
  actions,
  children,
  density = "compact",
  className,
  contentClassName,
  anchorId,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  density?: "default" | "compact";
  className?: string;
  contentClassName?: string;
  anchorId?: string;
}>) {
  const isCompact = density === "compact";

  const content = (
    <section
      className={cn(
        isCompact
          ? "overflow-hidden rounded-[0.95rem] border border-black/7 bg-[rgba(255,255,255,0.84)] shadow-[0_10px_22px_rgba(18,24,31,0.04)]"
          : "crm-card overflow-hidden border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(249,247,243,0.9))] shadow-[0_18px_38px_rgba(18,24,31,0.05)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col border-b border-black/7 lg:flex-row lg:justify-between",
          isCompact
            ? "gap-2.5 bg-[rgba(247,248,250,0.74)] px-4 py-3 md:px-5 md:py-3.5 lg:items-center"
            : "gap-3 bg-[linear-gradient(180deg,rgba(248,249,251,0.92),rgba(255,255,255,0.72))] px-5 py-4 lg:items-start",
        )}
      >
        <div className="crm-section-heading">
          {eyebrow ? <p className={cn("crm-eyebrow", isCompact ? "text-black/40" : "")}>{eyebrow}</p> : null}
          <h2
            className={cn(
              "crm-section-title text-black/84",
              isCompact ? "text-[0.94rem] leading-5" : "",
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
        {actions ? <div className={cn("crm-toolbar-cluster", isCompact ? "gap-1.5" : "")}>{actions}</div> : null}
      </div>
      <div className={cn(isCompact ? "p-3.5 md:p-4" : "p-4 md:p-5", contentClassName)}>{children}</div>
    </section>
  );

  if (!anchorId) {
    return content;
  }

  return <ScrollAnchor anchorId={anchorId}>{content}</ScrollAnchor>;
}
