import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  getVisibleSettingsWorkspaceSections,
  settingsOverviewItem,
  type SettingsViewerRole,
  type SettingsWorkspaceValue,
} from "@/lib/settings/metadata";

function WorkspaceRow({
  href,
  label,
  description,
  active,
}: Readonly<{
  href: string;
  label: string;
  description?: string;
  active: boolean;
}>) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 rounded-full transition-colors",
          active ? "bg-primary" : "bg-muted-foreground/30 group-hover:bg-border",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-medium",
            active ? "text-primary" : "text-inherit",
          )}
        >
          {label}
        </span>
        {description ? (
          <span
            className={cn(
              "mt-1 block text-xs leading-5",
              active ? "text-primary/70" : "text-muted-foreground/80",
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function SettingsWorkspaceNav({
  activeValue,
  viewerRole,
}: Readonly<{
  activeValue: SettingsWorkspaceValue;
  viewerRole?: SettingsViewerRole;
}>) {
  const visibleSections = getVisibleSettingsWorkspaceSections(viewerRole);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="grid gap-3 2xl:grid-cols-[190px_minmax(0,1fr)]">
        <section className="p-1.5">
          <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            设置总览
          </p>
          <WorkspaceRow
            href={settingsOverviewItem.href}
            label={settingsOverviewItem.label}
            description={settingsOverviewItem.description}
            active={activeValue === settingsOverviewItem.value}
          />
        </section>

        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
          {visibleSections.map((section) => (
            <section
              key={section.key}
              className="p-1.5"
            >
              <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {section.title}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <WorkspaceRow
                    key={item.value}
                    href={item.href}
                    label={item.label}
                    description={item.description}
                    active={activeValue === item.value}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
