import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type BadgeTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type CompactBadgeItem = {
  label: string;
  tone?: BadgeTone;
  icon?: ReactNode;
};

type CompactBadgeSize = "sm" | "md";

const toneClassMap: Record<BadgeTone, string> = {
  primary:
    "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20",
  success:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
  warning:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
  danger:
    "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/20",
  info:
    "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20",
  neutral:
    "bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200/70 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/20",
};

const sizeClassMap: Record<CompactBadgeSize, string> = {
  sm: "px-2.5 py-0.5 text-[11px] leading-4",
  md: "px-3 py-1 text-xs leading-5",
};

const iconSizeClassMap: Record<CompactBadgeSize, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
};

export type CompactBadgeGroupProps = {
  items: CompactBadgeItem[];
  maxVisible?: number;
  size?: CompactBadgeSize;
  className?: string;
  overflowTone?: BadgeTone;
};

export default function CompactBadgeGroup({
  items,
  maxVisible = 5,
  size = "sm",
  className,
  overflowTone = "neutral",
}: CompactBadgeGroupProps) {
  if (!items.length) {
    return null;
  }

  const effectiveMax = Math.max(1, maxVisible);
  const visibleItems = items.slice(0, effectiveMax);
  const overflowItems = items.slice(effectiveMax);
  const overflowCount = overflowItems.length;
  const overflowTitle = overflowItems.map((item) => item.label).join("、");

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      role="list"
    >
      {visibleItems.map((item, index) => (
        <Badge
          key={`${item.label}-${index}`}
          item={item}
          size={size}
        />
      ))}
      {overflowCount > 0 ? (
        <span
          role="listitem"
          title={overflowTitle}
          className={cn(
            "inline-flex select-none items-center rounded-full font-medium tracking-tight",
            sizeClassMap[size],
            toneClassMap[overflowTone],
          )}
        >
          +{overflowCount}
        </span>
      ) : null}
    </div>
  );
}

function Badge({
  item,
  size,
}: {
  item: CompactBadgeItem;
  size: CompactBadgeSize;
}) {
  const tone: BadgeTone = item.tone ?? "neutral";
  return (
    <span
      role="listitem"
      title={item.label}
      className={cn(
        "inline-flex max-w-[12rem] items-center gap-1 truncate rounded-full font-medium tracking-tight",
        sizeClassMap[size],
        toneClassMap[tone],
      )}
    >
      {item.icon ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center",
            iconSizeClassMap[size],
          )}
          aria-hidden
        >
          {item.icon}
        </span>
      ) : null}
      <span className="truncate">{item.label}</span>
    </span>
  );
}
