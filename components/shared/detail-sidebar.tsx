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
              ? "overflow-hidden rounded-[0.95rem] border border-black/7 bg-white/88 shadow-[0_10px_22px_rgba(18,24,31,0.04)]"
              : "crm-card overflow-hidden border-black/7 bg-white/92 shadow-[0_16px_34px_rgba(18,24,31,0.05)]"
          }
        >
          <div className={cn("border-b border-black/7", isCompact ? "px-4 py-3.5" : "px-4 py-4")}>
            {section.eyebrow ? (
              <p className={cn("crm-eyebrow", isCompact ? "text-black/40" : "text-black/48")}>{section.eyebrow}</p>
            ) : null}
            <h2 className={cn("mt-1 font-semibold text-black/84", isCompact ? "text-[0.94rem]" : "text-sm")}>
              {section.title}
            </h2>
            {section.description ? (
              <p
                className={cn(
                  isCompact
                    ? "mt-1.5 text-[12.5px] leading-5 text-black/54 md:text-[13px]"
                    : "mt-2 text-sm leading-6 text-black/56",
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
                className={cn(
                  "rounded-[0.95rem] border border-black/7",
                  isCompact
                    ? "bg-[rgba(247,248,250,0.74)] px-3.5 py-2.5"
                    : "bg-[linear-gradient(180deg,rgba(249,250,251,0.92),rgba(255,255,255,0.9))] px-3.5 py-3",
                )}
              >
                <p className={cn("font-semibold uppercase tracking-[0.12em] text-black/42", isCompact ? "text-[10px]" : "text-[11px]")}>
                  {item.label}
                </p>
                <div className={cn("text-black/78", isCompact ? "mt-1.5 text-[13px] leading-5" : "mt-2 text-sm leading-6")}>
                  {item.value}
                </div>
                {item.hint ? (
                  <p className={cn("text-black/48", isCompact ? "mt-1 text-[11px] leading-[1.15rem]" : "mt-1 text-xs leading-5")}>
                    {item.hint}
                  </p>
                ) : null}
              </div>
            ))}
            {section.content}
          </div>
          {section.footer ? (
            <div className={cn("border-t border-black/7 px-4", isCompact ? "py-2.5" : "py-3")}>
              {section.footer}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
