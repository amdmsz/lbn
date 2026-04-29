import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BentoTone = "primary" | "success" | "warning" | "danger" | "muted";

const toneClassNames: Record<BentoTone, string> = {
  primary: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  muted: "bg-muted-foreground",
};

const ringToneClassNames: Record<BentoTone, string> = {
  primary: "text-primary",
  success: "text-emerald-500",
  warning: "text-amber-500",
  danger: "text-red-500",
  muted: "text-muted-foreground",
};

const bentoSurfaceClassName =
  "rounded-2xl border border-border bg-card p-6 shadow-sm";

export function BentoGrid({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: Readonly<{
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}>) {
  return (
    <section className={cn(bentoSurfaceClassName, className)}>
      {title || eyebrow || description || actions ? (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            {eyebrow ? (
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </section>
  );
}

export function BentoMetricCard({
  label,
  value,
  note,
  href,
  tone = "primary",
  className,
}: Readonly<{
  label: string;
  value: ReactNode;
  note?: string;
  href?: string;
  tone?: BentoTone;
  className?: string;
}>) {
  const content = (
    <div
      className={cn(
        bentoSurfaceClassName,
        "group flex min-h-[11rem] flex-col justify-between transition duration-200 hover:-translate-y-px hover:border-primary/30",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span
          className={cn(
            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full opacity-80 transition group-hover:scale-125",
            toneClassNames[tone],
          )}
        />
      </div>
      <div>
        <div className="font-mono text-4xl font-semibold tracking-tight text-foreground">
          {value}
        </div>
        {note ? (
          <p className="mt-3 line-clamp-2 text-sm leading-5 text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}

export function BentoMiniStat({
  label,
  value,
  note,
  className,
}: Readonly<{
  label: string;
  value: ReactNode;
  note?: string;
  className?: string;
}>) {
  return (
    <div className={cn("rounded-xl border border-border bg-muted/35 px-3 py-2.5", className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-lg font-semibold text-foreground">
        {value}
      </p>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function BentoActionLink({
  href,
  children,
  className,
}: Readonly<{
  href: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function BentoRadialMetric({
  label,
  value,
  percent,
  tone = "primary",
}: Readonly<{
  label: string;
  value: ReactNode;
  percent: number;
  tone?: BentoTone;
}>) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const offset = circumference - (clampedPercent / 100) * circumference;

  return (
    <div className="flex min-w-0 flex-col items-center gap-3 rounded-2xl border border-border bg-muted/20 px-3 py-4">
      <div className="relative h-24 w-24">
        <svg
          viewBox="0 0 100 100"
          role="img"
          aria-label={`${label} ${clampedPercent}%`}
          className="h-full w-full -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeOpacity="0.28"
            strokeWidth="5"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={ringToneClassNames[tone]}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-semibold leading-none text-foreground">
            {value}
          </span>
          <span className="mt-1 font-mono text-[10px] text-muted-foreground">
            {clampedPercent}%
          </span>
        </div>
      </div>
      <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
