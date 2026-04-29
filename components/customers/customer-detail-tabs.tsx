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
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1 scrollbar-hide [&::-webkit-scrollbar]:hidden">
        <div className="inline-flex min-w-max items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1 shadow-sm backdrop-blur-md">
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
                  "inline-flex min-h-8 min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-[border-color,background-color,color,box-shadow,transform] duration-150",
                  isActive
                    ? "border-primary/20 bg-card text-foreground shadow-sm"
                    : "border-transparent hover:border-primary/20 hover:bg-background hover:text-foreground",
                )}
              >
                <span className="truncate">{group.label}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "tabular-nums text-[11px] leading-none",
                      isActive
                        ? "text-foreground/70"
                        : "text-muted-foreground",
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
        <div className="overflow-x-auto pb-1 scrollbar-hide [&::-webkit-scrollbar]:hidden">
          <div className="inline-flex min-w-max items-center gap-1">
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
                      "inline-flex min-h-8 min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-[border-color,background-color,color,box-shadow] duration-150",
                      isActive
                        ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                        : "border-transparent hover:border-primary/20 hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{tab.label}</span>
                    {typeof count === "number" ? (
                      <span
                        className={cn(
                          "tabular-nums text-[11px] leading-none",
                          isActive
                            ? "text-primary/75"
                            : "text-muted-foreground",
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
      ) : null}
    </div>
  );
}
