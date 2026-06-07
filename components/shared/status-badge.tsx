import { cn } from "@/lib/utils";

// 全部 variant 走 globals.css 的 4 状态 tone token (--tone-*-soft-bg/-border/-text).
// light/dark 同一抽象, 不再混 emerald-50 直 hex.
const badgeVariants = {
  neutral:
    "bg-muted/40 text-muted-foreground border-border/60",
  info: "bg-[var(--tone-info-soft-bg)] text-[var(--tone-info-soft-text)] border-[var(--tone-info-soft-border)]",
  success:
    "bg-[var(--tone-success-soft-bg)] text-[var(--tone-success-soft-text)] border-[var(--tone-success-soft-border)]",
  warning:
    "bg-[var(--tone-warning-soft-bg)] text-[var(--tone-warning-soft-text)] border-[var(--tone-warning-soft-border)]",
  danger:
    "bg-[var(--tone-danger-soft-bg)] text-[var(--tone-danger-soft-text)] border-[var(--tone-danger-soft-border)]",
} as const;

export type StatusBadgeVariant = keyof typeof badgeVariants;

export function StatusBadge({
  label,
  variant = "neutral",
}: Readonly<{
  label: string;
  variant?: StatusBadgeVariant;
}>) {
  const showIndicator = variant !== "neutral";

  // 字号收敛: 10px → 12px (text-xs), 取消 tracking 0.04em caption.
  // 圆角 pill, padding 紧凑.
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-[0.18rem] text-xs font-medium leading-4",
        showIndicator ? "gap-1.5" : "",
        badgeVariants[variant],
      )}
    >
      {showIndicator ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-85" />
      ) : null}
      {label}
    </span>
  );
}
