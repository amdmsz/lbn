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
            ? "text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40"
            : isCompact
            ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-black/42"
            : "text-[11px] font-semibold uppercase tracking-[0.14em] text-black/46"
        }
      >
        {label}
      </p>
      <p
        className={
          isStrip
            ? "mt-2 text-[1.1rem] font-semibold tracking-[-0.03em] text-black/86 md:text-[1.18rem]"
            : isCompact
            ? "mt-1.5 text-[1.28rem] font-semibold tracking-tight text-black/86 md:text-[1.45rem]"
            : "mt-3 text-[1.85rem] font-semibold tracking-tight text-black/86"
        }
      >
        {value}
      </p>
      <p
        title={note}
        className={
          isStrip
            ? "mt-1 line-clamp-2 text-[12px] leading-5 text-black/48"
            : isCompact
            ? "mt-1 max-w-[18rem] truncate text-[12px] leading-5 text-black/50"
            : "mt-2 max-w-[18rem] text-sm leading-6 text-black/55"
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
      ? "block rounded-[1rem] border border-black/8 bg-[rgba(255,255,255,0.92)] px-3.5 py-3 shadow-[0_6px_16px_rgba(18,24,31,0.025)] transition-[border-color,background-color,box-shadow] md:px-4 md:py-3.5"
      : isCompact
      ? "block rounded-[0.95rem] border border-black/7 bg-[rgba(255,255,255,0.84)] px-3.5 py-3 shadow-[0_8px_18px_rgba(18,24,31,0.03)] transition-colors md:px-4 md:py-3.5"
      : "crm-card block border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,247,243,0.9))] p-4 shadow-[0_14px_28px_rgba(18,24,31,0.05)] transition-colors md:p-5") +
    (href
      ? isStrip
        ? " hover:border-black/12 hover:bg-white hover:shadow-[0_10px_20px_rgba(18,24,31,0.04)]"
        : " hover:border-[var(--color-accent)]/24 hover:bg-white"
      : "") +
    (className ? ` ${className}` : "");

  if (href) {
    return (
      <SmartLink href={href} scrollTargetId={scrollTargetId} className={cardClassName}>
        <MetricCardContent label={label} value={value} note={note} density={density} />
      </SmartLink>
    );
  }

  return (
    <section className={cardClassName}>
      <MetricCardContent label={label} value={value} note={note} density={density} />
    </section>
  );
}
