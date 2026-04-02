import { RecordTabs } from "@/components/shared/record-tabs";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";

type ScopeTabItem = {
  value: string;
  label: string;
  href: string;
  count?: number | null;
};

export function CustomerScopeSwitcher({
  title,
  description,
  scopeLabel,
  teamItems,
  activeTeamValue,
  salesItems,
  activeSalesValue,
}: Readonly<{
  title: string;
  description: string;
  scopeLabel: string;
  teamItems: ScopeTabItem[];
  activeTeamValue?: string;
  salesItems?: ScopeTabItem[];
  activeSalesValue?: string;
}>) {
  const hasTeamItems = teamItems.length > 0;
  const hasSalesItems = Boolean(salesItems && salesItems.length > 0);

  if (!hasTeamItems && !hasSalesItems) {
    return null;
  }

  return (
    <SectionCard
      eyebrow="Scope Switch"
      title={title}
      description={description}
      actions={<StatusBadge label={scopeLabel} variant="info" />}
      contentClassName="space-y-4"
    >
      {hasTeamItems ? (
        <div className="space-y-2">
          <p className="crm-detail-label">Organization / Team</p>
          <RecordTabs items={teamItems} activeValue={activeTeamValue ?? ""} />
        </div>
      ) : null}

      {hasSalesItems ? (
        <div className="space-y-2">
          <p className="crm-detail-label">Team / Sales</p>
          <RecordTabs items={salesItems ?? []} activeValue={activeSalesValue ?? ""} />
        </div>
      ) : null}
    </SectionCard>
  );
}
