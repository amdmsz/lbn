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
    <section
      className={cn(
        "rounded-[1.1rem] border border-black/7 bg-[rgba(255,255,255,0.84)] px-4 py-4 shadow-[0_10px_24px_rgba(18,24,31,0.04)] md:px-5 md:py-5",
        className,
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          {eyebrow ? <p className="crm-detail-label text-black/38">{eyebrow}</p> : null}
          <h2 className="text-[1rem] font-semibold text-black/84">{title}</h2>
          {description ? (
            <p className="max-w-3xl text-[13px] leading-6 text-black/56">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="crm-toolbar-cluster gap-1.5">{actions}</div> : null}
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
    <div className="rounded-[1rem] border border-black/7 bg-[rgba(250,250,251,0.72)] px-4 py-3.5 transition-colors hover:border-black/10 hover:bg-white/82">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-black/82">{title}</p>
            {description ? (
              <p className="text-[13px] leading-6 text-black/56">{description}</p>
            ) : null}
          </div>

          {meta.length > 0 ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] leading-5 text-black/48">
              {meta.map((item, index) => (
                <span
                  key={`${index}-${item}`}
                  className="inline-flex max-w-full items-center gap-2"
                >
                  {index > 0 ? <span className="text-black/20">·</span> : null}
                  <span className="break-words">{item}</span>
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
