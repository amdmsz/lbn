import { SmartLink } from "@/components/shared/smart-link";
import {
  customerDetailTabGroups,
  customerDetailTabs,
  getCustomerDetailTabGroupMeta,
  type CustomerDetailTab,
} from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

type CustomerTabCounts = {
  calls: number;
  wechat: number;
  live: number;
  orders: number;
  gifts: number;
  logs: number;
};

function getTabCount(tab: CustomerDetailTab, counts: CustomerTabCounts) {
  switch (tab) {
    case "calls":
      return counts.calls;
    case "wechat":
      return counts.wechat;
    case "live":
      return counts.live;
    case "orders":
      return counts.orders;
    case "gifts":
      return counts.gifts;
    case "logs":
      return counts.logs;
    default:
      return null;
  }
}

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
  const activeGroup = getCustomerDetailTabGroupMeta(activeTab);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2.5 md:min-w-0 md:flex-wrap">
          {customerDetailTabGroups.map((group) => {
            const isActive = group.tabs.some((tab) => tab === activeTab);
            const href = buildHref
              ? buildHref(isActive ? activeTab : group.tabs[0])
              : group.tabs[0] === "profile"
                ? `/customers/${customerId}`
                : `/customers/${customerId}?tab=${group.tabs[0]}`;
            const count = group.tabs.reduce((total, tab) => {
              const value = getTabCount(tab, counts);
              return typeof value === "number" ? total + value : total;
            }, 0);

            return (
              <SmartLink
                key={group.value}
                href={href}
                scrollTargetId={scrollTargetId}
                className={cn(
                  "inline-flex min-h-10 min-w-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-[border-color,background-color,color,box-shadow] duration-150",
                  isActive
                    ? "border-black/10 bg-[rgba(255,255,255,0.96)] text-black/86 shadow-[0_8px_18px_rgba(18,24,31,0.05)]"
                    : "border-transparent bg-[rgba(247,248,250,0.72)] text-black/58 hover:border-black/7 hover:bg-white hover:text-black/82",
                )}
              >
                <span className="truncate">{group.label}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none",
                      isActive
                        ? "bg-black/[0.05] text-black/62"
                        : "bg-black/[0.04] text-black/46",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </SmartLink>
            );
          })}
        </div>
      </div>

      {activeGroup.tabs.length > 1 ? (
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2 md:min-w-0 md:flex-wrap">
            {customerDetailTabs
              .filter((tab) => activeGroup.tabs.some((item) => item === tab.value))
              .map((tab) => {
                const isActive = tab.value === activeTab;
                const count = getTabCount(tab.value, counts);

                return (
                  <SmartLink
                    key={tab.value}
                    href={
                      buildHref
                        ? buildHref(tab.value)
                        : `/customers/${customerId}?tab=${tab.value}`
                    }
                    scrollTargetId={scrollTargetId}
                    className={cn(
                      "inline-flex min-h-8 min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-[border-color,background-color,color] duration-150",
                      isActive
                        ? "border-black/9 bg-[rgba(15,23,42,0.05)] text-black/82"
                        : "border-black/6 bg-white/70 text-black/52 hover:border-black/10 hover:bg-white hover:text-black/76",
                    )}
                  >
                    <span className="truncate">{tab.label}</span>
                    {typeof count === "number" ? (
                      <span className="text-[11px] font-semibold text-current/65">
                        {count}
                      </span>
                    ) : null}
                  </SmartLink>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
