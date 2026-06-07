import { SmartLink } from "@/components/shared/smart-link";
import type { RecycleBinEntryStatusValue } from "@/lib/recycle-bin/queries";
import { cn } from "@/lib/utils";

type SegmentedItem = {
  value: RecycleBinEntryStatusValue;
  label: string;
  href: string;
  count: number;
};

/**
 * 回收站视图态 segmented control
 * ACTIVE / ARCHIVED / PURGED / RESTORED 4 个互斥视图态
 * 局部组件, 不污染 shared
 */
export function RecycleBinViewSegmented({
  items,
  activeValue,
}: Readonly<{
  items: SegmentedItem[];
  activeValue: RecycleBinEntryStatusValue;
}>) {
  return (
    <div
      role="tablist"
      aria-label="回收站视图态"
      className="inline-flex w-full shrink-0 items-center gap-0.5 rounded-lg border border-border/60 bg-card p-0.5 lg:w-auto"
    >
      {items.map((item) => {
        const active = item.value === activeValue;
        return (
          <SmartLink
            key={item.value}
            href={item.href}
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors lg:flex-none",
              active
                ? "bg-primary/10 text-primary shadow-sm"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <span className="truncate">{item.label}</span>
            <span
              className={cn(
                "inline-flex h-4 min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                active
                  ? "bg-primary/15 text-primary"
                  : "bg-muted/60 text-muted-foreground",
              )}
            >
              {item.count}
            </span>
          </SmartLink>
        );
      })}
    </div>
  );
}
