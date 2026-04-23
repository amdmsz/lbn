import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DetailSidebarItem = {
  label: string;
  value: ReactNode;
  hint?: string;
};

export type DetailSidebarSection = {
  key?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  items?: DetailSidebarItem[];
  footer?: ReactNode;
  content?: ReactNode;
};

export function DetailSidebar({
  sections,
  className,
  density = "compact",
}: Readonly<{
  sections: DetailSidebarSection[];
  className?: string;
  density?: "default" | "compact";
}>) {
  const isCompact = density === "compact";

  return (
    <div className={cn(isCompact ? "space-y-3" : "space-y-4", className)}>
      {sections.map((section, index) => (
        <section
          key={section.key ?? `${section.title}-${index}`}
          className={
            isCompact
              ? "overflow-hidden rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow]"
              : "crm-card overflow-hidden border border-[var(--color-border-soft)] bg-[var(--color-panel)] shadow-[var(--color-shell-shadow-md)]"
          }
        >
          <div className={cn("border-b border-[var(--color-border-soft)]", isCompact ? "px-4 py-3.5" : "px-4 py-4")}>
            {section.eyebrow ? (
              <p className="crm-eyebrow">{section.eyebrow}</p>
            ) : null}
            <h2 className={cn("mt-1 font-semibold text-[var(--foreground)]", isCompact ? "text-[0.94rem]" : "text-sm")}>
              {section.title}
            </h2>
            {section.description ? (
              <p
                className={cn(
                  isCompact
                    ? "mt-1.5 text-[12.5px] leading-5 text-[var(--color-sidebar-muted)] md:text-[13px]"
                    : "mt-2 text-sm leading-6 text-[var(--color-sidebar-muted)]",
                )}
              >
                {section.description}
              </p>
            ) : null}
          </div>
          <div className={cn(isCompact ? "space-y-2.5 px-4 py-3.5" : "space-y-3 px-4 py-4")}>
            {section.items?.map((item) => (
              <div
                key={`${section.title}-${item.label}`}
                className={cn("crm-detail-item rounded-[0.95rem] px-3.5", isCompact ? "py-2.5" : "py-3")}
              >
                <p className={cn("crm-detail-label", isCompact ? "text-[10px]" : "text-[11px]")}>
                  {item.label}
                </p>
                <div className={cn("crm-detail-value", isCompact ? "mt-1.5 text-[13px] leading-5" : "mt-2 text-sm leading-6")}>
                  {item.value}
                </div>
                {item.hint ? (
                  <p className={cn("text-[var(--color-sidebar-muted)]", isCompact ? "mt-1 text-[11px] leading-[1.15rem]" : "mt-1 text-xs leading-5")}>
                    {item.hint}
                  </p>
                ) : null}
              </div>
            ))}
            {section.content}
          </div>
          {section.footer ? (
            <div className={cn("border-t border-[var(--color-border-soft)] px-4", isCompact ? "py-2.5" : "py-3")}>
              {section.footer}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
