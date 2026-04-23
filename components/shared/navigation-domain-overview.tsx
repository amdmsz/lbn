import Link from "next/link";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import type { NavigationGroup } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function countGroupItems(group: NavigationGroup) {
  return group.sections.reduce((total, section) => total + section.items.length, 0);
}

export function NavigationDomainOverview({
  title,
  description,
  groups,
  excludeKeys = [],
}: Readonly<{
  title: string;
  description: string;
  groups: NavigationGroup[];
  excludeKeys?: string[];
}>) {
  const visibleGroups = groups.filter((group) => !excludeKeys.includes(group.key));

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <SectionCard eyebrow="业务域入口" title={title} description={description}>
      <div className="grid gap-4 xl:grid-cols-2">
        {visibleGroups.map((group) => {
          const itemCount = countGroupItems(group);

          return (
            <div key={group.key} className="crm-card-muted flex h-full flex-col border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                    业务域
                  </p>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">{group.title}</h3>
                  <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">{group.description}</p>
                </div>
                <StatusBadge
                  label={`${itemCount} 个入口`}
                  variant={itemCount > 2 ? "info" : "neutral"}
                />
              </div>

              <div className="mt-4 space-y-3">
                {group.sections.map((section, index) => (
                  <div
                    key={`${group.key}-${section.title ?? index}`}
                    className={cn(
                      "rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-3",
                      section.title ? "space-y-3" : "space-y-2",
                    )}
                  >
                    {section.title ? (
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                          {section.title}
                        </p>
                        {section.description ? (
                          <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">
                            {section.description}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-2.5">
                      {section.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3.5 py-3 transition-colors hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-[var(--foreground)]">{item.title}</p>
                            <span className="crm-text-link text-xs">进入</span>
                          </div>
                          <p className="mt-1.5 text-sm leading-6 text-[var(--color-sidebar-muted)]">
                            {item.description}
                          </p>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
