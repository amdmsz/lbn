import type { ReactNode } from "react";
import Link from "next/link";
import { SmartLink } from "@/components/shared/smart-link";
import { cn } from "@/lib/utils";

export type SummaryTone = "default" | "info" | "warning" | "danger" | "success";

export type SummaryCard = {
  label?: string;
  eyebrow?: string;
  value: string;
  description?: string;
  note: string;
  href: string;
  tone?: SummaryTone;
};

export type PortraitSignal = {
  label: string;
  value: string;
  description?: string;
};

export const summaryToneClassName: Record<SummaryTone, string> = {
  default: "border-border/50",
  info: "border-primary/20",
  warning: "border-amber-400/25",
  danger: "border-destructive/20",
  success: "border-emerald-500/20",
};

export type CustomerDossierSignalItem = {
  label: string;
  value: ReactNode;
  description?: ReactNode;
};

export type CustomerDossierStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type CustomerDossierStatusItem = {
  label: string;
  value: ReactNode;
  tone?: CustomerDossierStatusTone;
};

const statusToneClassName: Record<CustomerDossierStatusTone, string> = {
  neutral: "border-[var(--color-border-soft)] bg-[var(--color-shell-surface)]",
  info: "border-[rgba(79,125,247,0.16)] bg-[rgba(79,125,247,0.035)]",
  success: "border-[rgba(52,168,128,0.16)] bg-[rgba(52,168,128,0.04)]",
  warning: "border-[rgba(214,158,46,0.18)] bg-[rgba(214,158,46,0.045)]",
  danger: "border-[rgba(220,90,112,0.16)] bg-[rgba(220,90,112,0.04)]",
};

export function CustomerDossierMeta({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <span
      className={cn(
        "text-[12px] font-medium leading-5 text-[var(--color-sidebar-muted)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function CustomerDossierSignalRail({
  items,
  className,
}: Readonly<{
  items: CustomerDossierSignalItem[];
  className?: string;
}>) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3"
        >
          <p className="crm-detail-label">{item.label}</p>
          <div className="mt-1.5 text-[13px] font-medium leading-5 text-[var(--foreground)]">
            {item.value}
          </div>
          {item.description ? (
            <div className="mt-1 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
              {item.description}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function CustomerDossierStatusGrid({
  items,
  className,
}: Readonly<{
  items: CustomerDossierStatusItem[];
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "min-w-0 rounded-[0.82rem] border px-3 py-2",
            statusToneClassName[item.tone ?? "neutral"],
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--color-sidebar-muted)]">
            {item.label}
          </p>
          <div className="mt-1 min-w-0 break-words text-[12px] font-medium leading-5 text-[var(--foreground)] [word-break:normal]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CustomerDossierLedgerRow({
  title,
  subtitle,
  meta,
  statusItems,
  aside,
  detail,
  href,
  hrefLabel,
  className,
}: Readonly<{
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode[];
  statusItems?: CustomerDossierStatusItem[];
  aside?: ReactNode;
  detail?: ReactNode;
  href?: string;
  hrefLabel?: string;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-3 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow] duration-150 hover:border-[rgba(79,125,247,0.18)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-start">
        <div className="min-w-0 flex-1 xl:min-w-[14rem] xl:basis-[18rem]">
          <div className="min-w-0 break-words text-[13px] font-semibold leading-5 text-[var(--foreground)] [word-break:normal]">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 min-w-0 break-words text-[12px] leading-5 text-[var(--color-sidebar-muted)] [word-break:normal]">
              {subtitle}
            </div>
          ) : null}
          {meta && meta.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
              {meta.map((item, index) => (
                <span key={index} className="max-w-full break-words [word-break:normal]">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {statusItems && statusItems.length > 0 ? (
          <CustomerDossierStatusGrid
            items={statusItems}
            className="min-w-0 flex-1 sm:grid-cols-2 xl:min-w-[16rem] xl:basis-[18rem] xl:grid-cols-2"
          />
        ) : null}

        {aside || (href && hrefLabel) ? (
          <div className="flex min-w-0 flex-row items-center justify-between gap-3 xl:min-w-[7rem] xl:max-w-[12rem] xl:shrink-0 xl:flex-col xl:items-end xl:justify-start">
            {aside ? (
              <div className="min-w-0 max-w-full break-words text-left text-[12px] font-medium leading-5 text-[var(--color-sidebar-muted)] [word-break:normal] xl:text-right">
                {aside}
              </div>
            ) : <span />}
            {href && hrefLabel ? (
              <Link href={href} scroll={false} className="crm-text-link shrink-0">
                {hrefLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {detail ? (
        <div className="mt-3 border-t border-[var(--color-border-soft)] pt-3">
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function CustomerDossierPanel({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-4 shadow-[0_8px_18px_rgba(124,101,70,0.03)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CustomerDossierNotice({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3.5 py-2.5 text-[11px] leading-5 text-[var(--color-sidebar-muted)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function OverviewSummaryCard({
  card,
}: Readonly<{
  card: SummaryCard;
}>) {
  return (
    <SmartLink
      href={card.href}
      scrollTargetId="customer-main"
      className={cn(
        "group rounded-xl border bg-card px-4 py-3.5 shadow-sm transition-[border-color,background-color] duration-150 hover:bg-muted/30",
        summaryToneClassName[card.tone ?? "default"],
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {card.eyebrow ?? card.label ?? "摘要"}
      </p>
      <p className="mt-2 text-[1.08rem] font-semibold text-foreground">
        {card.value}
      </p>
      {card.description ? (
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {card.description}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground/80">
        {card.note}
      </p>
    </SmartLink>
  );
}

export function PortraitFact({
  label,
  value,
  description,
}: Readonly<{
  label: string;
  value: ReactNode;
  description?: string;
}>) {
  return (
    <div className="rounded-lg border border-border/40 bg-card px-3.5 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 text-[13px] font-semibold leading-5 text-foreground">
        {value}
      </div>
      {description ? (
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function PortraitActionLink({
  href,
  label,
  emphasis = "default",
}: Readonly<{
  href: string;
  label: string;
  emphasis?: "default" | "primary";
}>) {
  return (
    <SmartLink
      href={href}
      scrollTargetId="customer-main"
      className={cn(
        "inline-flex h-9 items-center rounded-md border px-3.5 text-[12px] font-medium shadow-sm transition-[border-color,background-color,color] duration-150",
        emphasis === "primary"
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted/40 hover:text-foreground",
      )}
    >
      {label}
    </SmartLink>
  );
}

export function PortraitSignalRail({
  items,
}: Readonly<{
  items: PortraitSignal[];
}>) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border/40 bg-card px-3.5 py-3 shadow-sm"
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1.5 text-[13px] font-semibold leading-5 text-foreground">
            {item.value}
          </p>
          {item.description ? (
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function CompactArchiveCard({
  title,
  meta,
  description,
  href,
  hrefLabel,
}: Readonly<{
  title: string;
  meta: string[];
  description?: string;
  href?: string;
  hrefLabel?: string;
}>) {
  return (
    <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow] hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          {description ? (
            <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">{description}</p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {meta.map((item, index) => (
              <span key={`${index}-${item}`} className="inline-flex max-w-full items-center gap-2">
                {index > 0 ? <span className="text-[var(--color-border)]">/</span> : null}
                <span className="break-words">{item}</span>
              </span>
            ))}
          </div>
        </div>
        {href && hrefLabel ? (
          <Link href={href} scroll={false} className="crm-text-link shrink-0 pt-0.5">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function QuietSectionMeta({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <span className="text-[12px] font-medium leading-5 text-[var(--color-sidebar-muted)]">
      {children}
    </span>
  );
}

export function OrderArchiveCard({
  title,
  amount,
  summary,
  meta,
  statusItems,
  detail,
  href,
  hrefLabel,
}: Readonly<{
  title: string;
  amount: string;
  summary: string;
  meta: string[];
  statusItems: CustomerDossierStatusItem[];
  detail?: ReactNode;
  href: string;
  hrefLabel: string;
}>) {
  return (
    <CustomerDossierLedgerRow
      title={title}
      subtitle={summary}
      meta={meta}
      statusItems={statusItems}
      aside={
        <span className="text-[1.02rem] font-semibold text-foreground">
          {amount}
        </span>
      }
      detail={detail}
      href={href}
      hrefLabel={hrefLabel}
    />
  );
}

export function CustomerDossierRecordCard({
  title,
  summary,
  meta,
  aside,
  href,
  hrefLabel,
  className,
}: Readonly<{
  title: string;
  summary?: ReactNode;
  meta: ReactNode[];
  aside?: ReactNode;
  href?: string;
  hrefLabel?: string;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3.5 shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow] duration-150 hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          {summary ? (
            <div className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">
              {summary}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
            {meta.map((item, index) => (
              <span key={index} className="max-w-full break-words">
                {item}
              </span>
            ))}
          </div>
        </div>

        {aside || (href && hrefLabel) ? (
          <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
            {aside ? (
              <div className="text-[12px] font-medium leading-5 text-[var(--color-sidebar-muted)]">
                {aside}
              </div>
            ) : null}
            {href && hrefLabel ? (
              <Link href={href} scroll={false} className="crm-text-link">
                {hrefLabel}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
