import { cn } from "@/lib/utils";

const badgeVariants = {
  neutral:
    "bg-muted/30 text-muted-foreground border-border/50",
  info: "bg-[rgba(61,124,255,0.08)] text-[var(--color-info)] border-[rgba(61,124,255,0.12)]",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning:
    "bg-[rgba(201,138,30,0.08)] text-[var(--color-warning)] border-[rgba(201,138,30,0.12)]",
  danger:
    "bg-[rgba(209,91,118,0.08)] text-[var(--color-danger)] border-[rgba(209,91,118,0.12)]",
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

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-[0.22rem] text-[10px] font-medium tracking-[0.04em]",
        showIndicator ? "gap-1" : "",
        badgeVariants[variant],
      )}
    >
      {showIndicator ? (
        <span className="h-[0.22rem] w-[0.22rem] rounded-full bg-current opacity-75" />
      ) : null}
      {label}
    </span>
  );
}
