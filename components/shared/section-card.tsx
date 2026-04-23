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
          ? "overflow-hidden rounded-[1.05rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow]"
          : "crm-card overflow-hidden border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-md)]",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col border-b border-[var(--color-border-soft)] lg:flex-row lg:justify-between",
          isCompact
            ? "gap-2.5 bg-[var(--color-panel-soft)] px-4 py-2.5 md:px-4.5 md:py-3 lg:items-center"
            : "gap-3 bg-[var(--color-shell-surface)] px-5 py-4 lg:items-start",
        )}
      >
        <div className="crm-section-heading">
          {eyebrow ? <p className="crm-eyebrow">{eyebrow}</p> : null}
          <h2
            className={cn(
              "crm-section-title text-[var(--foreground)]",
              isCompact ? "text-[0.92rem] leading-5" : "",
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
          <div
            className={cn(
              "crm-toolbar-cluster w-full min-w-0 lg:w-auto lg:justify-end",
              isCompact ? "gap-1.5" : "",
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          isCompact ? "p-3 md:p-3.5" : "p-4 md:p-5",
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  );

  if (!anchorId) {
    return content;
  }

  return <ScrollAnchor anchorId={anchorId}>{content}</ScrollAnchor>;
}
