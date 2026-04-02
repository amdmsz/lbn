import type { ReactNode } from "react";
import { ScrollAnchor } from "@/components/shared/scroll-anchor";
import { cn } from "@/lib/utils";

type SummaryMetric = {
  label: string;
  value: string;
  hint?: string;
};

export function SummaryHeader({
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
          ? "overflow-hidden rounded-[0.95rem] border border-black/7 bg-[rgba(255,255,255,0.84)] shadow-[0_10px_22px_rgba(18,24,31,0.04)]"
          : "crm-card overflow-hidden border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,247,243,0.92))] shadow-[0_22px_44px_rgba(18,24,31,0.06)]",
        className,
      )}
    >
      <div
        className={cn(
          isCompact
            ? "px-4 py-3 md:px-5 md:py-3.5"
            : "bg-[linear-gradient(135deg,rgba(154,97,51,0.08),rgba(58,105,143,0.03)_56%,rgba(255,255,255,0.92))] px-5 py-5 md:px-6 md:py-6",
        )}
      >
        <div
          className={cn(
            "flex flex-col xl:flex-row xl:justify-between",
            isCompact ? "gap-3 md:gap-3.5 xl:items-center" : "gap-4 xl:items-start",
          )}
        >
          <div className={cn("min-w-0", isCompact ? "space-y-1.5" : "space-y-2.5")}>
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
            <div className={cn(isCompact ? "space-y-1" : "space-y-1.5")}>
              <h1
                className={cn(
                  "font-semibold tracking-tight text-black/87",
                  isCompact ? "text-[1.28rem] md:text-[1.48rem]" : "text-[1.65rem] md:text-[2rem]",
                )}
              >
                {title}
              </h1>
              {description ? (
                <p
                  className={cn(
                    isCompact
                      ? "max-w-3xl text-[12.5px] leading-5 text-black/54 md:text-[13px]"
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
                "flex w-full flex-col xl:w-auto xl:shrink-0",
                isCompact ? "gap-2 xl:max-w-[30rem] xl:items-end" : "gap-2.5 xl:max-w-[30rem] xl:items-end",
              )}
            >
              {badges ? <div className={cn("crm-header-actions", isCompact ? "gap-1.5" : "")}>{badges}</div> : null}
              {actions ? <div className={cn("crm-header-actions", isCompact ? "gap-1.5" : "")}>{actions}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
      {metrics?.length ? (
        <div
          className={cn(
            "border-t border-black/7",
            isCompact ? "grid grid-cols-2 gap-px bg-[rgba(31,35,41,0.06)] xl:grid-cols-4" : "crm-summary-metrics",
          )}
        >
          {metrics.map((metric) => (
            <div
              key={`${metric.label}-${metric.value}`}
              className={cn(
                isCompact
                  ? "bg-[rgba(255,255,255,0.88)] px-3 py-2.5 backdrop-blur-sm md:px-3.5 md:py-3"
                  : "crm-summary-metric backdrop-blur-sm",
              )}
            >
              <p className={cn("crm-eyebrow", isCompact ? "text-black/40" : "")}>{metric.label}</p>
              <p
                className={cn(
                  "font-semibold text-black/85",
                  isCompact ? "mt-1.5 text-[1.26rem] md:text-[1.45rem]" : "mt-2.5 text-[1.6rem]",
                )}
              >
                {metric.value}
              </p>
              {metric.hint ? (
                <p
                  title={metric.hint}
                  className={cn(
                    isCompact
                      ? "mt-1 truncate text-[12px] leading-5 text-black/50"
                      : "mt-1.5 text-sm leading-6 text-black/56",
                  )}
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
