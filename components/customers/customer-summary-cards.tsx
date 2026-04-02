import { MetricCard } from "@/components/shared/metric-card";
import { SectionCard } from "@/components/shared/section-card";

type SummaryCardItem = {
  label: string;
  value: string;
  note: string;
  href?: string;
};

export function CustomerSummaryCards({
  eyebrow,
  title,
  description,
  items,
  anchorId,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description: string;
  items: SummaryCardItem[];
  anchorId?: string;
}>) {
  return (
    <SectionCard
      eyebrow={eyebrow}
      title={title}
      description={description}
      anchorId={anchorId}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {items.map((item) => (
          <MetricCard
            key={`${item.label}-${item.value}`}
            label={item.label}
            value={item.value}
            note={item.note}
            href={item.href}
            scrollTargetId={anchorId}
          />
        ))}
      </div>
    </SectionCard>
  );
}
