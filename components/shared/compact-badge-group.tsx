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

// 全部走 globals.css 的 --tone-* 软色块 + 主色 / muted, 不再混 6 套 tailwind 调色板.
// light/dark 同一抽象, ring-inset 收敛到 1px.
const toneClassMap: Record<BadgeTone, string> = {
  primary:
    "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
  success:
    "bg-[var(--tone-success-soft-bg)] text-[var(--tone-success-soft-text)] ring-1 ring-inset ring-[var(--tone-success-soft-border)]",
  warning:
    "bg-[var(--tone-warning-soft-bg)] text-[var(--tone-warning-soft-text)] ring-1 ring-inset ring-[var(--tone-warning-soft-border)]",
  danger:
    "bg-[var(--tone-danger-soft-bg)] text-[var(--tone-danger-soft-text)] ring-1 ring-inset ring-[var(--tone-danger-soft-border)]",
  info:
    "bg-[var(--tone-info-soft-bg)] text-[var(--tone-info-soft-text)] ring-1 ring-inset ring-[var(--tone-info-soft-border)]",
  neutral:
    "bg-muted/50 text-muted-foreground ring-1 ring-inset ring-border/70",
};

// 12px 起步 (text-xs), 不再用 11px caption. md 走 13px body 档.
const sizeClassMap: Record<CompactBadgeSize, string> = {
  sm: "px-2.5 py-0.5 text-xs leading-5",
  md: "px-3 py-1 text-[0.8125rem] leading-5",
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
