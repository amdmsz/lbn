import type { ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { formatDateTime } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

export function CustomerEmptyState({
  title,
  description,
  className,
}: Readonly<{
  title: string;
  description: string;
  className?: string;
}>) {
  return <EmptyState className={className} title={title} description={description} />;
}

export function CustomerTabSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <SectionCard
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
      density="compact"
      className={cn(
        "rounded-[1.05rem] border-[var(--color-border-soft)] bg-[var(--color-panel-soft)] shadow-[var(--color-shell-shadow-sm)]",
        className,
      )}
      contentClassName="p-4 md:p-5"
    >
      {children}
    </SectionCard>
  );
}

export function CustomerRecordCard({
  title,
  meta,
  description,
  href,
  hrefLabel,
  className,
}: Readonly<{
  title: string;
  meta: string[];
  description?: string;
  href?: string;
  hrefLabel?: string;
  className?: string;
}>) {
  return (
    <div
      className={cn(
        "rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-4 py-3.5 transition-[border-color,background-color,box-shadow] duration-150 hover:border-[rgba(122,154,255,0.18)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-sm)]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
          {description ? (
            <p className="text-[13px] leading-6 text-[var(--color-sidebar-muted)]">{description}</p>
          ) : null}
          {meta.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
              {meta.map((item, index) => (
                <span key={`${index}-${item}`} className="max-w-full break-words">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
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

export function formatOwnerLabel(
  owner: { name: string; username: string } | null | undefined,
) {
  if (!owner) {
    return "未分配";
  }

  return `${owner.name} (@${owner.username})`;
}

export function formatOptionalDate(value: Date | null | undefined) {
  return value ? formatDateTime(value) : "暂无";
}
