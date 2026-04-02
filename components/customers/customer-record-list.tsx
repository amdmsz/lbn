import type { ReactNode } from "react";
import Link from "next/link";
import { DetailItem } from "@/components/shared/detail-item";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateTime } from "@/lib/customers/metadata";
import { cn } from "@/lib/utils";

export function CustomerDetailItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return <DetailItem label={label} value={value} />;
}

export function CustomerEmptyState({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return <EmptyState title={title} description={description} />;
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
  description: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <section className={cn("crm-section-card", className)}>
      <div className="flex flex-col gap-3 border-b border-black/6 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          {eyebrow ? <p className="crm-detail-label">{eyebrow}</p> : null}
          <h2 className="text-lg font-semibold text-black/84">{title}</h2>
          <p className="max-w-3xl text-sm leading-7 text-black/58">{description}</p>
        </div>
        {actions ? <div className="crm-toolbar-cluster">{actions}</div> : null}
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}

export function CustomerRecordCard({
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
    <div className="crm-subtle-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-black/82">{title}</p>
            {description ? (
              <p className="text-sm leading-6 text-black/58">{description}</p>
            ) : null}
          </div>

          {meta.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {meta.map((item, index) => (
                <div
                  key={`${index}-${item}`}
                  className="rounded-[0.8rem] border border-black/6 bg-white/70 px-3 py-2 text-sm leading-6 text-black/60"
                >
                  {item}
                </div>
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
