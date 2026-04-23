import { cn } from "@/lib/utils";

export function LoadingState({
  title = "加载中",
  description = "正在准备当前页面数据。",
  blocks = 4,
  className,
  density = "compact",
}: Readonly<{
  title?: string;
  description?: string;
  blocks?: number;
  className?: string;
  density?: "default" | "compact";
}>) {
  const isCompact = density === "compact";

  return (
    <div
      className={cn(
        isCompact
          ? "crm-card-muted space-y-3 border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] p-4 shadow-[var(--color-shell-shadow-sm)]"
          : "crm-card space-y-4 p-5",
        className,
      )}
    >
      <div className={cn(isCompact ? "space-y-1.5" : "space-y-2")}>
        <div className="crm-loading-block h-3.5 w-28" />
        <div className={cn("crm-loading-block", isCompact ? "h-7 w-44" : "h-9 w-56")} />
        <div className="crm-loading-block h-3.5 w-full max-w-2xl" />
      </div>
      <div className={cn("grid md:grid-cols-2 xl:grid-cols-4", isCompact ? "gap-2.5" : "gap-3")}>
        {Array.from({ length: blocks }).map((_, index) => (
          <div key={index} className={cn("crm-loading-block", isCompact ? "h-[5.25rem]" : "h-28")} />
        ))}
      </div>
      <div className="sr-only">
        {title}
        {description}
      </div>
    </div>
  );
}
