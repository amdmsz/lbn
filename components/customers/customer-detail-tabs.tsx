import { RecordTabs } from "@/components/shared/record-tabs";
import {
  customerDetailTabs,
  type CustomerDetailTab,
} from "@/lib/customers/metadata";

type CustomerTabCounts = {
  calls: number;
  wechat: number;
  live: number;
  orders: number;
  gifts: number;
  logs: number;
};

export function CustomerDetailTabs({
  customerId,
  activeTab,
  counts,
  scrollTargetId,
  buildHref,
}: Readonly<{
  customerId: string;
  activeTab: CustomerDetailTab;
  counts: CustomerTabCounts;
  scrollTargetId?: string;
  buildHref?: (tab: CustomerDetailTab) => string;
}>) {
  const items = customerDetailTabs.map((tab) => ({
    value: tab.value,
    label: tab.label,
    href: buildHref
      ? buildHref(tab.value)
      : tab.value === "profile"
        ? `/customers/${customerId}`
        : `/customers/${customerId}?tab=${tab.value}`,
    count:
      tab.value === "calls"
        ? counts.calls
        : tab.value === "wechat"
          ? counts.wechat
          : tab.value === "live"
            ? counts.live
            : tab.value === "orders"
              ? counts.orders
              : tab.value === "gifts"
                ? counts.gifts
                : tab.value === "logs"
                  ? counts.logs
                  : null,
  }));

  return (
    <RecordTabs
      items={items}
      activeValue={activeTab}
      scrollTargetId={scrollTargetId}
    />
  );
}
