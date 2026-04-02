import type { ReactNode } from "react";
import Link from "next/link";
import { PageMeta } from "@/components/shared/page-meta";
import { SummaryHeader } from "@/components/shared/summary-header";

type BreadcrumbItem = {
  label: string;
  href?: string;
};

export function RoleAwareCustomerHeader({
  eyebrow,
  title,
  description,
  badges,
  breadcrumbs,
  secondary,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  badges?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  secondary?: ReactNode;
}>) {
  return (
    <div className="space-y-4">
      <SummaryHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        badges={badges}
      />

      {breadcrumbs?.length || secondary ? (
        <PageMeta
          primary={
            <>
              {breadcrumbs?.map((item, index) =>
                item.href ? (
                  <span key={`${item.label}-${index}`} className="flex items-center gap-2">
                    <Link href={item.href} scroll={false} className="crm-text-link">
                      {item.label}
                    </Link>
                    {index < breadcrumbs.length - 1 ? (
                      <span className="text-black/28">/</span>
                    ) : null}
                  </span>
                ) : (
                  <span
                    key={`${item.label}-${index}`}
                    className="flex items-center gap-2 text-sm font-medium text-black/68"
                  >
                    <span>{item.label}</span>
                    {index < breadcrumbs.length - 1 ? (
                      <span className="text-black/28">/</span>
                    ) : null}
                  </span>
                ),
              )}
            </>
          }
          secondary={secondary}
        />
      ) : null}
    </div>
  );
}
