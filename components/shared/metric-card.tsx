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
  density?: "default" | "compact";
}>) {
  const isCompact = density === "compact";

  return (
    <>
      <p
        className={
          isCompact
            ? "text-[10px] font-semibold uppercase tracking-[0.12em] text-black/42"
            : "text-[11px] font-semibold uppercase tracking-[0.14em] text-black/46"
        }
      >
        {label}
      </p>
      <p
        className={
          isCompact
            ? "mt-1.5 text-[1.28rem] font-semibold tracking-tight text-black/86 md:text-[1.45rem]"
            : "mt-3 text-[1.85rem] font-semibold tracking-tight text-black/86"
        }
      >
        {value}
      </p>
      <p
        title={note}
        className={
          isCompact
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
}: Readonly<{
  label: string;
  value: string;
  note: string;
  href?: string;
  scrollTargetId?: string;
  density?: "default" | "compact";
}>) {
  const isCompact = density === "compact";
  const className =
    (isCompact
      ? "block rounded-[0.95rem] border border-black/7 bg-[rgba(255,255,255,0.84)] px-3.5 py-3 shadow-[0_8px_18px_rgba(18,24,31,0.03)] transition-colors md:px-4 md:py-3.5"
      : "crm-card block border border-black/7 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,247,243,0.9))] p-4 shadow-[0_14px_28px_rgba(18,24,31,0.05)] transition-colors md:p-5") +
    (href ? " hover:border-[var(--color-accent)]/24 hover:bg-white" : "");

  if (href) {
    return (
      <SmartLink href={href} scrollTargetId={scrollTargetId} className={className}>
        <MetricCardContent label={label} value={value} note={note} density={density} />
      </SmartLink>
    );
  }

  return (
    <section className={className}>
      <MetricCardContent label={label} value={value} note={note} density={density} />
    </section>
  );
}
