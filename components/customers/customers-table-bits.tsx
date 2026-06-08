"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Eye, SquarePen, StickyNote } from "lucide-react";
import {
  buildCustomerPopupHref,
  CustomerViewToggle,
  type CustomerViewMode,
} from "@/components/customers/customer-list-helpers";
import CompactBadgeGroup, {
  type BadgeTone,
  type CompactBadgeItem,
} from "@/components/shared/compact-badge-group";
import type { CustomerBatchActionNoticeState } from "@/lib/customers/batch-action-contract";
import {
  CUSTOMER_GRADE_BADGE_TONE,
  CUSTOMER_GRADE_LABEL,
  CUSTOMER_GRADE_SHORT_LABEL,
} from "@/lib/customers/grade";
import {
  getCustomerExecutionDisplayLongLabel,
  getCustomerExecutionDisplayVariant,
} from "@/lib/customers/metadata";
import type { CustomerListItem } from "@/lib/customers/queries";
import { cn } from "@/lib/utils";
import type { CustomerGrade } from "@prisma/client";

// 单一执行徽章: 颜色 token, 不再做按钮 + pill 双重渲染.
export const executionBadgeClassNames = {
  neutral:
    "border-[var(--crm-badge-neutral-border)] bg-[var(--crm-badge-neutral-bg)] text-[var(--crm-badge-neutral-text)]",
  info: "border-[var(--tone-info-soft-border)] bg-[var(--tone-info-soft-bg)] text-[var(--color-accent-strong)]",
  success:
    "border-[var(--tone-success-soft-border)] bg-[var(--tone-success-soft-bg)] text-[var(--color-success)]",
  warning:
    "border-[var(--tone-warning-soft-border)] bg-[var(--tone-warning-soft-bg)] text-[var(--color-warning)]",
  danger:
    "border-[var(--tone-danger-soft-border)] bg-[var(--tone-danger-soft-bg)] text-[var(--color-danger)]",
} as const;

export function ListTopBar({
  headerAction,
  viewMode,
  onChangeView,
  totalCount,
  quickSelectButton,
}: Readonly<{
  headerAction?: ReactNode;
  viewMode: CustomerViewMode;
  onChangeView: (next: CustomerViewMode) => void;
  totalCount: number;
  quickSelectButton: ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        {quickSelectButton}
        <div className="md:hidden">
          <CustomerViewToggle value={viewMode} onChange={onChangeView} />
        </div>
      </div>
      <p className="text-[12px] font-medium tabular-nums text-[var(--color-sidebar-muted)]">
        共 {totalCount} 位客户
      </p>
    </div>
  );
}

// Wave 7-B: 客户分级 A/B/C/D/F chip. 用与 compact-badge-group 一致的 tone 体系,
// 但单独做一个 component 是因为列表里 chip 出现频率高, 用 1 个字母 (A/B/C/...)
// 而不是 group 的长 label.
const customerGradeToneClassMap: Record<
  "primary" | "success" | "info" | "warning" | "danger",
  string
> = {
  primary:
    "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 transition-colors duration-200 ease-out hover:bg-primary/15 hover:ring-primary/30",
  success:
    "bg-[var(--tone-success-soft-bg)] text-[var(--tone-success-soft-text)] ring-1 ring-inset ring-[var(--tone-success-soft-border)] transition-colors duration-200 ease-out hover:brightness-[0.97]",
  info: "bg-[var(--tone-info-soft-bg)] text-[var(--tone-info-soft-text)] ring-1 ring-inset ring-[var(--tone-info-soft-border)] transition-colors duration-200 ease-out hover:brightness-[0.97]",
  warning:
    "bg-[var(--tone-warning-soft-bg)] text-[var(--tone-warning-soft-text)] ring-1 ring-inset ring-[var(--tone-warning-soft-border)] transition-colors duration-200 ease-out hover:brightness-[0.97]",
  danger:
    "bg-[var(--tone-danger-soft-bg)] text-[var(--tone-danger-soft-text)] ring-1 ring-inset ring-[var(--tone-danger-soft-border)] transition-colors duration-200 ease-out hover:brightness-[0.97]",
};

export function CustomerGradeBadge({
  grade,
  size = "sm",
  variant = "short",
  className,
}: Readonly<{
  grade: CustomerGrade | null;
  size?: "sm" | "md";
  variant?: "short" | "long";
  className?: string;
}>) {
  if (!grade) {
    return null;
  }
  const tone = CUSTOMER_GRADE_BADGE_TONE[grade];
  const label =
    variant === "short"
      ? CUSTOMER_GRADE_SHORT_LABEL[grade]
      : CUSTOMER_GRADE_LABEL[grade];
  const sizeClass =
    size === "sm"
      ? "h-5 px-2 text-[11px]"
      : "h-6 px-2.5 text-[12px]";
  return (
    <span
      title={CUSTOMER_GRADE_LABEL[grade]}
      className={cn(
        "inline-flex select-none items-center rounded-full font-semibold tracking-tight",
        sizeClass,
        customerGradeToneClassMap[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ExecutionBadge({
  row,
  onClick,
  compact = false,
  variantClass,
}: Readonly<{
  row: CustomerListItem;
  onClick: () => void;
  compact?: boolean;
  variantClass?: string;
}>) {
  const className = cn(
    "inline-flex items-center rounded-full border font-medium tracking-tight outline-none transition-[background-color,color,filter,box-shadow] duration-200 ease-out hover:brightness-[0.95] focus-visible:ring-2 focus-visible:ring-primary/40",
    compact ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[11px]",
    variantClass ??
      executionBadgeClassNames[
        getCustomerExecutionDisplayVariant({
          executionClass: row.executionClass,
          newImported: row.newImported,
          pendingFirstCall: row.pendingFirstCall,
        })
      ],
  );
  return (
    <button type="button" onClick={onClick} title="编辑跟进结果" className={className}>
      {getCustomerExecutionDisplayLongLabel({
        executionClass: row.executionClass,
        newImported: row.newImported,
        pendingFirstCall: row.pendingFirstCall,
      })}
    </button>
  );
}

export function RowActions({
  row,
  onOpenSheet,
  onOpenFollowUp,
  onPopupOpen,
  variant,
}: Readonly<{
  row: CustomerListItem;
  onOpenSheet: () => void;
  onOpenFollowUp: () => void;
  onPopupOpen: () => void;
  variant: "compact" | "spacious";
}>) {
  const isSpacious = variant === "spacious";
  const btn = isSpacious
    ? "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground ring-1 ring-inset ring-transparent outline-none transition-[background-color,color,box-shadow] duration-200 ease-out hover:bg-muted hover:text-primary hover:ring-primary/20 focus-visible:ring-primary/40"
    : "crm-button crm-button-secondary inline-flex h-8 w-8 items-center rounded-[10px] px-0 text-[var(--color-sidebar-muted)] transition-colors duration-200 ease-out hover:text-foreground";
  const iconSize = isSpacious ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5",
        !isSpacious &&
          "w-full justify-center opacity-100 transition-opacity duration-150 md:pointer-events-none md:opacity-0 md:group-hover/customer-row:pointer-events-auto md:group-hover/customer-row:opacity-100 md:group-focus-within/customer-row:pointer-events-auto md:group-focus-within/customer-row:opacity-100",
      )}
    >
      <button
        type="button"
        onClick={onOpenSheet}
        aria-label={`查看 ${row.name} 详情`}
        title="查看详情"
        className={btn}
      >
        <Eye className={iconSize} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onOpenFollowUp}
        aria-label={`编辑 ${row.name} 跟进`}
        title="编辑跟进"
        className={btn}
      >
        <SquarePen className={iconSize} aria-hidden="true" />
      </button>
      <Link
        href={buildCustomerPopupHref(row.id)}
        prefetch={false}
        target="_blank"
        rel="noreferrer"
        onClick={onPopupOpen}
        aria-label={`新窗口打开 ${row.name} 详情`}
        title="新窗口打开详情"
        className={btn}
      >
        <ExternalLink className={iconSize} aria-hidden="true" />
      </Link>
    </div>
  );
}

// 备注 preview: 默认折叠为 icon, hover/focus 展开 popover; 点击进 follow-up 编辑.
export function RemarkPreviewTrigger({
  hasRemark,
  remarkText,
  onOpenEditor,
}: Readonly<{
  hasRemark: boolean;
  remarkText: string;
  onOpenEditor: () => void;
}>) {
  return (
    <div className="group/remark relative shrink-0" data-row-interactive="true">
      <button
        type="button"
        onClick={onOpenEditor}
        aria-label={hasRemark ? "查看 / 编辑备注" : "添加备注"}
        title={hasRemark ? "查看 / 编辑备注" : "添加备注"}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          hasRemark
            ? "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"
            : "border-border bg-card hover:border-primary/30 hover:text-primary",
        )}
      >
        <StickyNote className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {hasRemark ? (
        <div
          role="tooltip"
          className="pointer-events-none invisible absolute right-0 top-9 z-20 w-64 rounded-lg border border-border bg-card p-3 text-xs leading-5 text-foreground/85 opacity-0 shadow-lg transition-opacity duration-150 group-hover/remark:visible group-hover/remark:opacity-100 group-focus-within/remark:visible group-focus-within/remark:opacity-100 dark:shadow-black/40"
        >
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            备注
          </p>
          <p className="line-clamp-6 whitespace-pre-wrap break-words">{remarkText}</p>
          <p className="mt-2 text-[11px] text-muted-foreground">点击图标编辑</p>
        </div>
      ) : null}
    </div>
  );
}

function toBlockedBadgeItems(
  summary: CustomerBatchActionNoticeState["blockedReasonSummary"],
  tone: BadgeTone,
): CompactBadgeItem[] {
  return summary.map((item) => ({ label: `${item.label} ${item.count} 位`, tone }));
}

export function BlockedReasonStrip({
  title,
  tone,
  summary,
}: Readonly<{
  title: string;
  tone: "warning" | "danger";
  summary: CustomerBatchActionNoticeState["blockedReasonSummary"];
}>) {
  const containerClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10"
      : "border-rose-200 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10";
  const titleClass =
    tone === "warning"
      ? "text-amber-900 dark:text-amber-200"
      : "text-rose-900 dark:text-rose-200";
  return (
    <div className={cn("rounded-xl border px-4 py-3", containerClass)}>
      <p className={cn("text-[12px] font-semibold", titleClass)}>{title}</p>
      <div className="mt-2">
        <CompactBadgeGroup items={toBlockedBadgeItems(summary, tone)} maxVisible={8} size="sm" />
      </div>
    </div>
  );
}
