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
        "crm-tabs border border-black/7 bg-[rgba(255,255,255,0.86)] shadow-[0_10px_24px_rgba(18,24,31,0.04)]",
        className,
      )}
    >
      {items.map((item) => (
        <SmartLink
          key={item.value}
          href={item.href}
          scrollTargetId={scrollTargetId}
          className={cn(
            "crm-tab min-w-0",
            item.value === activeValue ? "crm-tab-active" : "",
          )}
        >
          <span className="max-w-[10rem] truncate">{item.label}</span>
          {typeof item.count === "number" ? (
            <span className="crm-tab-count">{item.count}</span>
          ) : null}
        </SmartLink>
      ))}
    </div>
  );
}
