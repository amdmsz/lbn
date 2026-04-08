import type { ReactNode } from "react";
import { ScrollAnchor } from "@/components/shared/scroll-anchor";
import { cn } from "@/lib/utils";

type SummaryMetric = {
  label: string;
  value: string;
  hint?: string;
};

export function SummaryHeader({
  context,
  eyebrow,
  title,
  description,
  badges,
  actions,
  metrics,
  density = "compact",
  className,
  anchorId = "page-top",
}: Readonly<{
  context?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  badges?: ReactNode;
  actions?: ReactNode;
  metrics?: SummaryMetric[];
  density?: "default" | "compact";
  className?: string;
  anchorId?: string;
}>) {
  const isCompact = density === "compact";

  const content = (
    <section
      className={cn(
        isCompact
          ? "overflow-hidden rounded-[1rem] border border-black/7 bg-[rgba(255,255,255,0.86)] shadow-[0_10px_22px_rgba(18,24,31,0.04)]"
          : "crm-card overflow-hidden border border-black/7 bg-[rgba(255,255,255,0.92)] shadow-[0_20px_40px_rgba(18,24,31,0.05)]",
        className,
      )}
    >
      <div
        className={cn(
          isCompact ? "px-4 py-4 md:px-5 md:py-4.5" : "px-5 py-5 md:px-6 md:py-6",
        )}
      >
        <div
          className={cn(
            "flex flex-col xl:flex-row xl:justify-between",
            isCompact ? "gap-3.5 xl:items-start" : "gap-5 xl:items-start",
          )}
        >
          <div className={cn("min-w-0", isCompact ? "space-y-2" : "space-y-3")}>
            {context ? <div>{context}</div> : null}
            {eyebrow ? (
              <p
                className={cn(
                  "font-semibold uppercase tracking-[0.18em]",
                  isCompact ? "text-[10px] text-black/42" : "text-[10px] text-[var(--color-accent)]",
                )}
              >
                {eyebrow}
              </p>
            ) : null}
            <div className={cn(isCompact ? "space-y-1.5" : "space-y-2")}>
              <h1
                className={cn(
                  "font-semibold tracking-tight text-black/87",
                  isCompact ? "text-[1.34rem] md:text-[1.56rem]" : "text-[1.75rem] md:text-[2rem]",
                )}
              >
                {title}
              </h1>
              {description ? (
                <p
                  className={cn(
                    isCompact
                      ? "max-w-4xl text-[12.5px] leading-5 text-black/54 md:text-[13px]"
                      : "max-w-4xl text-sm leading-6 text-black/58",
                  )}
                >
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          {(badges || actions) ? (
            <div
              className={cn(
                "flex w-full min-w-0 flex-col xl:w-auto xl:shrink-0",
                isCompact
                  ? "gap-2 xl:max-w-[36rem] xl:items-end"
                  : "gap-2.5 xl:max-w-[36rem] xl:items-end",
              )}
            >
              {badges ? <div className="crm-header-actions gap-1.5">{badges}</div> : null}
              {actions ? <div className="crm-header-actions gap-1.5">{actions}</div> : null}
            </div>
          ) : null}
        </div>
      </div>

      {metrics?.length ? (
        <div className="grid gap-px border-t border-black/7 bg-[rgba(31,35,41,0.06)] sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {metrics.map((metric) => (
            <div
              key={`${metric.label}-${metric.value}`}
              className="bg-[rgba(255,255,255,0.9)] px-3.5 py-3 md:px-4 md:py-3.5"
            >
              <p className="crm-eyebrow text-black/40">{metric.label}</p>
              <p className="mt-1.5 text-[1.28rem] font-semibold text-black/85 md:text-[1.45rem]">
                {metric.value}
              </p>
              {metric.hint ? (
                <p
                  title={metric.hint}
                  className="mt-1 text-[12px] leading-5 text-black/50"
                >
                  {metric.hint}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );

  return <ScrollAnchor anchorId={anchorId}>{content}</ScrollAnchor>;
}
