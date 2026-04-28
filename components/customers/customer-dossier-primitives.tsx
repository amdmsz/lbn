import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
