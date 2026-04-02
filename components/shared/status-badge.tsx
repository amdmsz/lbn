import { cn } from "@/lib/utils";

const badgeVariants = {
  neutral: "bg-[rgba(18,24,31,0.04)] text-black/68 border-black/10",
  info: "bg-[rgba(54,95,135,0.10)] text-[var(--color-info)] border-[rgba(54,95,135,0.16)]",
  success:
    "bg-[rgba(47,107,71,0.10)] text-[var(--color-success)] border-[rgba(47,107,71,0.16)]",
  warning:
    "bg-[rgba(155,106,29,0.10)] text-[var(--color-warning)] border-[rgba(155,106,29,0.16)]",
  danger:
    "bg-[rgba(141,59,51,0.10)] text-[var(--color-danger)] border-[rgba(141,59,51,0.16)]",
} as const;

export type StatusBadgeVariant = keyof typeof badgeVariants;

export function StatusBadge({
  label,
  variant = "neutral",
}: Readonly<{
  label: string;
  variant?: StatusBadgeVariant;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] shadow-[0_4px_10px_rgba(31,35,41,0.02)]",
        badgeVariants[variant],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}
