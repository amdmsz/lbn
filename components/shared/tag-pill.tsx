import { cn } from "@/lib/utils";
import { isValidHexColor } from "@/lib/master-data/metadata";

export function TagPill({
  label,
  color,
  className,
}: Readonly<{
  label: string;
  color?: string | null;
  className?: string;
}>) {
  const useCustomColor = isValidHexColor(color);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] shadow-[0_6px_12px_rgba(37,61,112,0.04)]",
        !useCustomColor &&
          "border-[var(--crm-badge-neutral-border)] bg-[var(--crm-badge-neutral-bg)] text-[var(--crm-badge-neutral-text)]",
        className,
      )}
      style={
        useCustomColor
          ? {
              color: color ?? undefined,
              borderColor: `${color}55`,
              backgroundColor: `${color}14`,
            }
          : undefined
      }
    >
      {label}
    </span>
  );
}
