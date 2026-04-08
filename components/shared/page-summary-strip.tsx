import type { ReactNode } from "react";
import { SmartLink } from "@/components/shared/smart-link";
import { cn } from "@/lib/utils";

export type PageSummaryStripItem = {
  key?: string;
  label: string;
  value: ReactNode;
  note?: string;
  href?: string;
  emphasis?: "default" | "info" | "success" | "warning";
};

const emphasisMap: Record<NonNullable<PageSummaryStripItem["emphasis"]>, string> = {
  default: "border-black/7",
  info: "border-[rgba(58,105,143,0.14)]",
  success: "border-[rgba(47,107,71,0.16)]",
  warning: "border-[rgba(160,106,29,0.16)]",
};

function SummaryTile({
  item,
  density = "default",
  className,
}: Readonly<{
  item: PageSummaryStripItem;
  density?: "default" | "compact";
  className?: string;
}>) {
  const isCompact = density === "compact";

  const content = (
    <div
      className={cn(
        isCompact
          ? "group flex h-full min-h-[88px] flex-col justify-between rounded-[0.9rem] border bg-[rgba(255,255,255,0.88)] px-3 py-2.5 transition-colors md:min-h-[94px] md:px-3.5 md:py-3"
          : "group h-full rounded-[1rem] border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,246,242,0.92))] px-4 py-4 transition-colors",
        emphasisMap[item.emphasis ?? "default"],
        item.href ? "hover:bg-white" : "",
        className,
      )}
    >
      <p
        className={cn(
          isCompact
            ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-black/42"
            : "text-[11px] font-semibold uppercase tracking-[0.14em] text-black/44",
        )}
      >
        {item.label}
      </p>
      <div
        className={cn(
          isCompact
            ? "mt-1.5 text-[1.32rem] font-semibold tracking-tight text-black/86 md:text-[1.55rem]"
            : "mt-3 text-[1.9rem] font-semibold tracking-tight text-black/86",
        )}
      >
        {item.value}
      </div>
      {item.note ? (
        <p
          title={typeof item.note === "string" ? item.note : undefined}
          className={cn(
            isCompact
              ? "mt-1 line-clamp-2 text-[12px] leading-5 text-black/50"
              : "mt-2 text-sm leading-6 text-black/55",
          )}
        >
          {item.note}
        </p>
      ) : null}
    </div>
  );

  if (!item.href) {
    return content;
  }

  return (
    <SmartLink href={item.href} className="block h-full">
      {content}
    </SmartLink>
  );
}

export function PageSummaryStrip({
  items,
  density = "compact",
  className,
}: Readonly<{
  items: PageSummaryStripItem[];
  density?: "default" | "compact";
  className?: string;
}>) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        density === "compact"
          ? "grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4"
          : "grid gap-3 md:grid-cols-2 2xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => (
        <SummaryTile
          key={item.key ?? `${item.label}-${index}`}
          item={item}
          density={density}
          className={cn(
            density === "compact" ? "shadow-none" : "shadow-[0_12px_28px_rgba(18,24,31,0.04)]",
          )}
        />
      ))}
    </div>
  );
}
