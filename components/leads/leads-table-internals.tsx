"use client";

import type { ReactNode } from "react";
import type { LeadListFilters } from "@/lib/leads/queries";
import { cn } from "@/lib/utils";

export function FilterHiddenInputs({
  filters,
  includePage = false,
  overrides,
}: Readonly<{
  filters: LeadListFilters;
  includePage?: boolean;
  overrides?: Partial<LeadListFilters>;
}>) {
  const nextFilters = {
    ...filters,
    ...overrides,
  };

  return (
    <>
      {nextFilters.name ? (
        <input type="hidden" name="name" value={nextFilters.name} />
      ) : null}
      {nextFilters.phone ? (
        <input type="hidden" name="phone" value={nextFilters.phone} />
      ) : null}
      {nextFilters.status ? (
        <input type="hidden" name="status" value={nextFilters.status} />
      ) : null}
      {nextFilters.tagId ? (
        <input type="hidden" name="tagId" value={nextFilters.tagId} />
      ) : null}
      <input type="hidden" name="view" value={nextFilters.view} />
      {nextFilters.quick ? (
        <input type="hidden" name="quick" value={nextFilters.quick} />
      ) : null}
      {nextFilters.importBatchId ? (
        <input
          type="hidden"
          name="importBatchId"
          value={nextFilters.importBatchId}
        />
      ) : null}
      {nextFilters.assignedOwnerId ? (
        <input
          type="hidden"
          name="assignedOwnerId"
          value={nextFilters.assignedOwnerId}
        />
      ) : null}
      {nextFilters.createdFrom ? (
        <input
          type="hidden"
          name="createdFrom"
          value={nextFilters.createdFrom}
        />
      ) : null}
      {nextFilters.createdTo ? (
        <input type="hidden" name="createdTo" value={nextFilters.createdTo} />
      ) : null}
      <input
        type="hidden"
        name="pageSize"
        value={String(nextFilters.pageSize)}
      />
      {includePage ? (
        <input type="hidden" name="page" value={String(nextFilters.page)} />
      ) : null}
    </>
  );
}

export function SnapshotCard({
  label,
  value,
  note,
  children,
  footer,
  tone = "default",
}: Readonly<{
  label: string;
  value?: ReactNode;
  note?: string;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "info" | "success" | "danger";
}>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-4 shadow-sm",
        tone === "info" && "border-primary/20",
        tone === "success" && "border-emerald-500/20",
        tone === "danger" && "border-destructive/20",
      )}
    >
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      {typeof value !== "undefined" ? (
        <div className="mt-2 text-2xl font-semibold text-foreground">
          {value}
        </div>
      ) : null}
      {note ? (
        <p className="mt-1.5 text-sm leading-5 text-muted-foreground">
          {note}
        </p>
      ) : null}
      {children ? <div className="mt-2.5 space-y-1.5">{children}</div> : null}
      {footer ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">{footer}</div>
      ) : null}
    </div>
  );
}

export function SelectionStateBanner({
  title,
  description,
  action,
  tone = "default",
}: Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "info" | "danger";
}>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card px-4 py-3 shadow-sm",
        tone === "info" && "border-primary/20 bg-primary/5",
        tone === "danger" && "border-destructive/20 bg-destructive/5",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-[13px] font-medium text-foreground">
            {title}
          </p>
          <p className="text-[12px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function LeadWorkbenchDialog({
  title,
  description,
  onClose,
  children,
  footer,
}: Readonly<{
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}>) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 dark:bg-foreground/50">
      <div className="w-full max-w-[36rem] overflow-hidden rounded-xl border border-border/60 bg-card shadow-lg">
        <div className="flex items-start justify-between gap-4 border-b border-border/50 bg-background/60 px-5 py-4">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              批量操作
            </p>
            <div>
              <h3 className="text-[1.08rem] font-semibold text-foreground">
                {title}
              </h3>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-0 items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">{children}</div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/50 bg-background/60 px-5 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
