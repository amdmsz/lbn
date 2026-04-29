import type { ReactNode } from "react";
import { SmartLink } from "@/components/shared/smart-link";
import { cn } from "@/lib/utils";

export function PaginationControls({
  page,
  totalPages,
  summary,
  buildHref,
  leftSlot,
  rightSlot,
  scrollTargetId,
}: Readonly<{
  page: number;
  totalPages: number;
  summary: string;
  buildHref: (page: number) => string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  scrollTargetId?: string;
}>) {
  const pageNumbers = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => {
      const offset = Math.max(0, Math.min(page - 3, totalPages - 5));
      return offset + index + 1;
    },
  );

  return (
    <div className="crm-subtle-panel flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        {leftSlot ? <div>{leftSlot}</div> : null}
        <p className="text-sm leading-6 text-[var(--color-sidebar-muted)]">{summary}</p>
      </div>

      <div className="crm-toolbar-cluster justify-start lg:justify-end">
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
        <SmartLink
          href={buildHref(Math.max(1, page - 1))}
          scrollTargetId={scrollTargetId}
          aria-disabled={page === 1}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            page === 1 &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          上一页
        </SmartLink>

        {pageNumbers.map((pageNumber) => (
          <SmartLink
            key={pageNumber}
            href={buildHref(pageNumber)}
            scrollTargetId={scrollTargetId}
            aria-current={pageNumber === page ? "page" : undefined}
            className={cn(
              "crm-button min-h-0 px-3 py-2 text-sm",
              pageNumber === page
                ? "border-primary bg-primary text-primary-foreground shadow-sm hover:border-primary hover:bg-primary/90 hover:text-primary-foreground"
                : "crm-button-secondary",
            )}
          >
            {pageNumber}
          </SmartLink>
        ))}

        <SmartLink
          href={buildHref(Math.min(totalPages, page + 1))}
          scrollTargetId={scrollTargetId}
          aria-disabled={page === totalPages}
          className={cn(
            "crm-button crm-button-secondary min-h-0 px-3 py-2 text-sm",
            page === totalPages &&
              "pointer-events-none border-[var(--color-border-soft)] bg-[var(--color-shell-active)] text-[var(--color-sidebar-muted)]",
          )}
        >
          下一页
        </SmartLink>
      </div>
    </div>
  );
}
