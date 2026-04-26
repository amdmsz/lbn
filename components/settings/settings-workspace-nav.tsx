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
        "group flex items-start gap-3 rounded-[0.95rem] border px-3 py-3 transition-colors",
        active
          ? "border-[var(--color-accent)]/16 bg-[var(--color-accent)]/7"
          : "border-transparent bg-transparent hover:border-black/8 hover:bg-white",
      )}
    >
      <span
        className={cn(
          "mt-1 h-2.5 w-2.5 rounded-full",
          active ? "bg-[var(--color-accent)]" : "bg-black/12 group-hover:bg-black/24",
        )}
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-medium",
            active ? "text-[var(--color-accent)]" : "text-black/78",
          )}
        >
          {label}
        </span>
        {description ? (
          <span className="mt-1 block text-[12px] leading-5 text-black/50">
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
    <div className="rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.84)] p-3 shadow-[0_8px_18px_rgba(18,24,31,0.04)]">
      <div className="grid gap-3 2xl:grid-cols-[190px_minmax(0,1fr)]">
        <section className="rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.72)] p-2">
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
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
              className="rounded-[0.95rem] border border-black/7 bg-[rgba(247,248,250,0.66)] p-2"
            >
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/42">
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
