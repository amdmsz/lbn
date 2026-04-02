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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.05em] shadow-[0_4px_10px_rgba(31,35,41,0.03)]",
        !useCustomColor && "border-black/10 bg-black/5 text-black/70",
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
