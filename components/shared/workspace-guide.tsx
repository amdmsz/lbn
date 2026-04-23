import Link from "next/link";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";

export type WorkspaceGuideItem = {
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
  badgeLabel?: string;
  badgeVariant?: StatusBadgeVariant;
  value?: string;
  valueLabel?: string;
};

export function WorkspaceGuide({
  eyebrow = "页面承接",
  title,
  description,
  items,
  density = "compact",
  gridClassName,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description: string;
  items: WorkspaceGuideItem[];
  density?: "default" | "compact";
  gridClassName?: string;
}>) {
  const isCompact = density === "compact";

  return (
    <SectionCard eyebrow={eyebrow} title={title} description={description} density={density}>
      <div
        className={cn(
          isCompact ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "grid gap-3.5 md:grid-cols-2 xl:grid-cols-3",
          gridClassName,
        )}
      >
        {items.map((item) => {
          const content = (
            <div
              className={cn(
                "group flex h-full flex-col transition-colors",
                isCompact
                  ? "rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)]"
                  : "crm-card-muted p-5 transition-transform hover:-translate-y-0.5 hover:border-[var(--color-accent)]/20",
              )}
            >
              <div className={cn("flex items-start justify-between", isCompact ? "gap-3" : "gap-4")}>
                <div className={cn("min-w-0", isCompact ? "space-y-1" : "space-y-1.5")}>
                  <h3 className={cn("font-semibold text-[var(--foreground)]", isCompact ? "text-[0.94rem]" : "text-base")}>
                    {item.title}
                  </h3>
                  {item.valueLabel ? (
                    <p className={cn("font-medium uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]", isCompact ? "text-[10px]" : "text-[11px]")}>
                      {item.valueLabel}
                    </p>
                  ) : null}
                </div>

                <div className={cn("flex shrink-0 flex-col items-end", isCompact ? "gap-1.5" : "gap-2")}>
                  {item.badgeLabel ? (
                    <StatusBadge
                      label={item.badgeLabel}
                      variant={item.badgeVariant ?? "info"}
                    />
                  ) : null}
                  {item.value ? (
                    <span
                      className={cn(
                        "border border-[var(--crm-badge-neutral-border)] bg-[var(--crm-badge-neutral-bg)] font-semibold text-[var(--crm-badge-neutral-text)]",
                        isCompact
                          ? "rounded-full px-2.5 py-1 text-[12px]"
                          : "rounded-2xl px-3 py-1.5 text-sm",
                      )}
                    >
                      {item.value}
                    </span>
                  ) : null}
                </div>
              </div>

              <p
                className={cn(
                  "flex-1 text-[var(--color-sidebar-muted)]",
                  isCompact ? "mt-2.5 text-[13px] leading-5" : "mt-3 text-sm leading-6",
                )}
              >
                {item.description}
              </p>

              {item.href ? (
                <div className={cn("flex items-center justify-between gap-3 border-t border-[var(--color-border-soft)]", isCompact ? "mt-3 pt-2.5" : "mt-4 pt-3")}>
                  <span className={cn("uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]", isCompact ? "text-[10px]" : "text-[11px]")}>
                    快捷入口
                  </span>
                  <span className={cn("crm-text-link inline-flex items-center", isCompact ? "text-[13px]" : "text-sm")}>
                    {item.hrefLabel ?? "进入"}
                  </span>
                </div>
              ) : null}
            </div>
          );

          return item.href ? (
            <Link key={`${item.title}-${item.href}`} href={item.href}>
              {content}
            </Link>
          ) : (
            <div key={item.title}>{content}</div>
          );
        })}
      </div>
    </SectionCard>
  );
}
