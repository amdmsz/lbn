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

const emphasisMap: Record<
  NonNullable<PageSummaryStripItem["emphasis"]>,
  { surface: string; value: string }
> = {
  default: {
    surface:
      "border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)]",
    value: "text-[var(--foreground)]",
  },
  info: {
    surface:
      "border-[rgba(111,141,255,0.12)] bg-[var(--color-shell-surface-soft)]",
    value: "text-[var(--color-info)]",
  },
  success: {
    surface:
      "border-[rgba(87,212,176,0.12)] bg-[var(--color-shell-surface-soft)]",
    value: "text-[var(--color-success)]",
  },
  warning: {
    surface:
      "border-[rgba(240,195,106,0.12)] bg-[var(--color-shell-surface-soft)]",
    value: "text-[var(--color-warning)]",
  },
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
  const emphasis = emphasisMap[item.emphasis ?? "default"];

  const content = (
    <div
      className={cn(
        isCompact
          ? "group flex h-full min-h-[82px] flex-col justify-between rounded-[1.02rem] border px-3.5 py-2.5 transition-[transform,border-color,background-color,box-shadow] duration-200 md:min-h-[86px] md:py-3"
          : "group h-full rounded-[1.08rem] border px-4 py-3 transition-[transform,border-color,background-color,box-shadow] duration-200",
        emphasis.surface,
        item.href
          ? "shadow-[var(--color-shell-shadow-xs)] hover:-translate-y-[1px] hover:border-[rgba(111,141,255,0.18)] hover:bg-[var(--color-shell-surface)] hover:shadow-[var(--color-shell-shadow-sm)]"
          : "shadow-[var(--color-shell-shadow-xs)]",
        className,
      )}
    >
      <p
        className={cn(
          isCompact
            ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-sidebar-muted)]"
            : "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]",
        )}
      >
        {item.label}
      </p>
      <div
        className={cn(
          isCompact
            ? "mt-1.25 text-[1.14rem] font-semibold tracking-[-0.04em] md:text-[1.32rem]"
            : "mt-2 text-[1.62rem] font-semibold tracking-[-0.045em]",
          emphasis.value,
        )}
      >
        {item.value}
      </div>
      {item.note ? (
        <p
          title={typeof item.note === "string" ? item.note : undefined}
          className={cn(
            isCompact
              ? "mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-[var(--color-sidebar-muted)]"
              : "mt-1.5 text-[13px] leading-5 text-[var(--color-sidebar-muted)]",
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
          ? "grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
          : "grid gap-3 md:grid-cols-2 2xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item, index) => (
        <SummaryTile
          key={item.key ?? `${item.label}-${index}`}
          item={item}
          density={density}
          className={
            density === "compact" ? "" : "shadow-[var(--color-shell-shadow-xs)]"
          }
        />
      ))}
    </div>
  );
}
