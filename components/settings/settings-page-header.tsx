import type { ReactNode } from "react";
import { SettingsWorkspaceNav } from "@/components/settings/settings-workspace-nav";
import { PageContextLink } from "@/components/shared/page-context-link";
import { SummaryHeader } from "@/components/shared/summary-header";
import type {
  SettingsViewerRole,
  SettingsWorkspaceValue,
} from "@/lib/settings/metadata";

export function SettingsPageHeader({
  activeValue,
  viewerRole,
  title,
  description,
  badges,
  actions,
  metrics,
  backHref = "/settings",
  backLabel = "返回设置中心",
  trail,
}: Readonly<{
  activeValue: SettingsWorkspaceValue;
  viewerRole?: SettingsViewerRole;
  title: string;
  description?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  metrics?: Array<{
    label: string;
    value: string;
    hint?: string;
  }>;
  backHref?: string;
  backLabel?: string;
  trail?: string[];
}>) {
  return (
    <div className="space-y-3">
      <SummaryHeader
        context={
          <PageContextLink
            href={backHref}
            label={backLabel}
            trail={trail ?? ["设置中心", title]}
          />
        }
        eyebrow="设置中心"
        title={title}
        description={description}
        badges={badges}
        actions={actions}
        metrics={metrics}
      />

      <div className="crm-subtle-panel px-3 py-2.5">
        <SettingsWorkspaceNav activeValue={activeValue} viewerRole={viewerRole} />
      </div>
    </div>
  );
}
