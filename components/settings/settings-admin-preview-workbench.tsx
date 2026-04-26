import type { ReactNode } from "react";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge, type StatusBadgeVariant } from "@/components/shared/status-badge";
import type {
  SettingsViewerRole,
  SettingsWorkspaceValue,
} from "@/lib/settings/metadata";

type PreviewItem = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  variant?: StatusBadgeVariant;
};

type PreviewSection = {
  eyebrow?: string;
  title: string;
  description?: string;
  items: PreviewItem[];
};

function PreviewGrid({ items }: Readonly<{ items: PreviewItem[] }>) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-3.5 py-3"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="crm-detail-label">{item.label}</p>
            {item.variant ? <StatusBadge label="状态" variant={item.variant} /> : null}
          </div>
          <div className="mt-2 break-words text-[13px] font-medium leading-5 text-[var(--foreground)]">
            {item.value}
          </div>
          {item.hint ? (
            <div className="mt-1.5 text-[11.5px] leading-5 text-[var(--color-sidebar-muted)]">
              {item.hint}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function SettingsAdminPreviewWorkbench({
  activeValue,
  viewerRole,
  title,
  description,
  badges,
  metrics,
  sections,
}: Readonly<{
  activeValue: SettingsWorkspaceValue;
  viewerRole: SettingsViewerRole;
  title: string;
  description: string;
  badges?: ReactNode;
  metrics?: Array<{
    label: string;
    value: string;
    hint?: string;
  }>;
  sections: PreviewSection[];
}>) {
  return (
    <div className="crm-page">
      <SettingsPageHeader
        activeValue={activeValue}
        viewerRole={viewerRole}
        title={title}
        description={description}
        badges={
          <>
            <StatusBadge label="ADMIN" variant="info" />
            <StatusBadge label="只读预览" variant="warning" />
            {badges}
          </>
        }
        metrics={metrics}
      />

      <SectionCard
        className="mt-5"
        eyebrow="Phase 1"
        title="当前状态"
        description="本页先承接管理员配置入口和当前运行状态预览；真实保存、版本审计与回滚会在 SystemSetting 里程碑接入。"
      >
        <div className="rounded-[0.95rem] border border-[rgba(201,138,30,0.16)] bg-[rgba(201,138,30,0.06)] px-4 py-3 text-[13px] leading-6 text-[var(--color-warning)]">
          现在不会写数据库，也不会修改当前环境变量。录音存储和 AI worker 仍按现有运行时配置工作。
        </div>
      </SectionCard>

      <div className="mt-5 grid gap-5">
        {sections.map((section) => (
          <SectionCard
            key={section.title}
            eyebrow={section.eyebrow}
            title={section.title}
            description={section.description}
          >
            <PreviewGrid items={section.items} />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
