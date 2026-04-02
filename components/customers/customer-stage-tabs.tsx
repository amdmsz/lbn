import { RecordTabs } from "@/components/shared/record-tabs";
import { customerQueueOptions, type CustomerQueueKey } from "@/lib/customers/metadata";

export function CustomerStageTabs({
  activeQueue,
  counts,
  buildHref,
  scrollTargetId,
}: Readonly<{
  activeQueue: CustomerQueueKey;
  counts: Record<CustomerQueueKey, number>;
  buildHref: (queue: CustomerQueueKey) => string;
  scrollTargetId?: string;
}>) {
  return (
    <RecordTabs
      items={customerQueueOptions.map((item) => ({
        value: item.value,
        label: item.label,
        href: buildHref(item.value),
        count: counts[item.value],
      }))}
      activeValue={activeQueue}
      scrollTargetId={scrollTargetId}
    />
  );
}
