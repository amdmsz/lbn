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
        "flex gap-2 overflow-x-auto rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.84)] p-2 shadow-[0_8px_18px_rgba(18,24,31,0.04)] md:flex-wrap md:overflow-visible",
        className,
      )}
    >
      {items.map((item) => (
        <SmartLink
          key={item.value}
          href={item.href}
          scrollTargetId={scrollTargetId}
          className={cn(
            "inline-flex min-h-9 min-w-0 shrink-0 items-center gap-2 rounded-[0.85rem] border px-3 py-2 text-sm transition-colors md:shrink",
            item.value === activeValue
              ? "border-[var(--color-accent)]/16 bg-[var(--color-accent)]/8 text-[var(--color-accent)]"
              : "border-transparent bg-transparent text-black/64 hover:border-black/8 hover:bg-white hover:text-black/84",
          )}
        >
          <span className="max-w-[9rem] truncate md:max-w-[10rem]">{item.label}</span>
          {typeof item.count === "number" ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px]",
                item.value === activeValue
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "bg-black/5 text-black/52",
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
