import { SmartLink } from "@/components/shared/smart-link";

function MetricCardContent({
  label,
  value,
  note,
  density = "compact",
}: Readonly<{
  label: string;
  value: string;
  note: string;
  density?: "default" | "compact" | "strip";
}>) {
  const isStrip = density === "strip";
  const isCompact = density === "compact";

  return (
    <>
      <p
        className={
          isStrip
            ? "text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]"
            : isCompact
              ? "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]"
              : "text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]"
        }
      >
        {label}
      </p>
      <p
        className={
          isStrip
            ? "mt-2 text-[1.1rem] font-semibold tracking-[-0.035em] text-[var(--foreground)] md:text-[1.18rem]"
            : isCompact
              ? "mt-1.5 text-[1.28rem] font-semibold tracking-[-0.035em] text-[var(--foreground)] md:text-[1.48rem]"
              : "mt-3 text-[1.82rem] font-semibold tracking-[-0.04em] text-[var(--foreground)]"
        }
      >
        {value}
      </p>
      <p
        title={note}
        className={
          isStrip
            ? "mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-sidebar-muted)]"
            : isCompact
              ? "mt-1 max-w-[18rem] truncate text-[12px] leading-5 text-[var(--color-sidebar-muted)]"
              : "mt-2 max-w-[18rem] text-sm leading-6 text-[var(--color-sidebar-muted)]"
        }
      >
        {note}
      </p>
    </>
  );
}

export function MetricCard({
  label,
  value,
  note,
  href,
  scrollTargetId,
  density = "compact",
  className,
}: Readonly<{
  label: string;
  value: string;
  note: string;
  href?: string;
  scrollTargetId?: string;
  density?: "default" | "compact" | "strip";
  className?: string;
}>) {
  const isStrip = density === "strip";
  const isCompact = density === "compact";
  const cardClassName =
    (isStrip
      ? "block rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-panel)] px-3.5 py-3 shadow-[var(--color-shell-shadow-sm)] transition-[transform,border-color,background-color,box-shadow] duration-200 md:px-4 md:py-3.25"
      : isCompact
        ? "block rounded-[1.05rem] border border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] px-3.5 py-3 shadow-[var(--color-shell-shadow-sm)] transition-[transform,border-color,background-color,box-shadow] duration-200 md:px-4 md:py-3.25"
        : "crm-card block border border-[var(--color-border-soft)] bg-[var(--color-panel)] p-4 shadow-[var(--color-shell-shadow-lg)] transition-[transform,border-color,background-color,box-shadow] duration-200 md:p-5") +
    (href
      ? isStrip
        ? " hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-sm)]"
        : " hover:-translate-y-[1px] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]"
      : "") +
    (className ? ` ${className}` : "");

  if (href) {
    return (
      <SmartLink
        href={href}
        scrollTargetId={scrollTargetId}
        className={cardClassName}
      >
        <MetricCardContent
          label={label}
          value={value}
          note={note}
          density={density}
        />
      </SmartLink>
    );
  }

  return (
    <section className={cardClassName}>
      <MetricCardContent
        label={label}
        value={value}
        note={note}
        density={density}
      />
    </section>
  );
}
