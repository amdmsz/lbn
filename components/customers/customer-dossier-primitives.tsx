import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type CustomerDossierSignalItem = {
  label: string;
  value: ReactNode;
  description?: ReactNode;
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
