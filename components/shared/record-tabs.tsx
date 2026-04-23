import { SmartLink } from "@/components/shared/smart-link";
import { cn } from "@/lib/utils";

type RecordTabItem = {
  value: string;
  label: string;
  href: string;
  count?: number | null;
};

export function RecordTabs({
  items,
  activeValue,
  className,
  scrollTargetId,
}: Readonly<{
  items: RecordTabItem[];
  activeValue: string;
  className?: string;
  scrollTargetId?: string;
}>) {
  return (
    <div
      className={cn(
        "crm-tabs overflow-x-auto p-1.5 md:flex-wrap md:overflow-visible",
        className,
      )}
    >
      {items.map((item) => (
        <SmartLink
          key={item.value}
          href={item.href}
          scrollTargetId={scrollTargetId}
          className={cn(
            "crm-tab min-h-8 min-w-0 shrink-0 px-3 py-1.5 text-[13px] md:shrink",
            item.value === activeValue
              ? "crm-tab-active text-[var(--foreground)]"
              : "",
          )}
        >
          <span className="max-w-[9rem] truncate md:max-w-[10rem]">
            {item.label}
          </span>
          {typeof item.count === "number" ? (
            <span
              className={cn(
                "crm-tab-count px-1.5 py-0.5 text-[10.5px]",
                item.value === activeValue ? "text-[var(--foreground)]" : "",
              )}
            >
              {item.count}
            </span>
          ) : null}
        </SmartLink>
      ))}
    </div>
  );
}
