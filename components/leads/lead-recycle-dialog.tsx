"use client";

import type { LeadSource, LeadStatus } from "@prisma/client";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime, getLeadSourceLabel } from "@/lib/leads/metadata";
import {
  LEAD_RECYCLE_REASON_OPTIONS,
  type LeadRecycleGuard,
  type LeadRecycleReasonCode,
} from "@/lib/leads/recycle-guards";

type LeadRecycleDialogItem = {
  name: string | null;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  updatedAt: Date | string;
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function SummaryRow({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="rounded-[0.95rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-3.5 py-2.5">
      <p className="text-[11px] text-[var(--color-sidebar-muted)]">{label}</p>
      <p className="mt-1 text-[13px] font-medium leading-5 text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}

export function LeadRecycleDialog({
  open,
  item,
  guard,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  pending = false,
}: Readonly<{
  open: boolean;
  item: LeadRecycleDialogItem | null;
  guard: LeadRecycleGuard | null;
  reason: LeadRecycleReasonCode;
  onReasonChange: (value: LeadRecycleReasonCode) => void;
  onClose: () => void;
  onConfirm?: () => void;
  pending?: boolean;
}>) {
  if (!open || !item || !guard) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm dark:bg-black/50">
      <div className="w-full max-w-[40rem] overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/50 bg-background/60 px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={guard.canMoveToRecycleBin ? "可移入回收站" : "存在阻断"}
                variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
              />
              <LeadStatusBadge status={item.status} />
            </div>
            <div>
              <h3 className="text-[1.06rem] font-semibold text-foreground">
                移入回收站
              </h3>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                确认这条线索是否退出当前工作台。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-0 items-center rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryRow
              label="线索名称"
              value={item.name?.trim() || "未填写姓名"}
            />
            <SummaryRow label="手机号" value={item.phone} />
            <SummaryRow label="来源" value={getLeadSourceLabel(item.source)} />
            <SummaryRow
              label="最近更新"
              value={formatDateTime(normalizeDate(item.updatedAt))}
            />
          </div>

          <div className="space-y-2 rounded-[0.98rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              原因
            </p>
            <select
              value={reason}
              onChange={(event) =>
                onReasonChange(event.target.value as LeadRecycleReasonCode)
              }
              className="crm-select"
            >
              {LEAD_RECYCLE_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {guard.blockers.length > 0 ? (
            <div className="space-y-2 rounded-[0.98rem] border border-[rgba(209,91,118,0.16)] bg-[rgba(209,91,118,0.06)] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase text-destructive">
                阻断原因
              </p>
              <div className="space-y-2">
                {guard.blockers.map((blocker) => (
                  <div
                    key={blocker.name}
                    className="rounded-[0.92rem] border border-[rgba(209,91,118,0.14)] bg-[var(--color-shell-surface)] px-3.5 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[13px] font-medium text-[var(--foreground)]">
                          {blocker.name}
                        </p>
                        <p className="text-[12px] leading-5 text-[var(--color-sidebar-muted)]">
                          {blocker.description}
                        </p>
                      </div>
                      <StatusBadge
                        label={`阻断 ${blocker.count}`}
                        variant="danger"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ActionBanner
              tone="success"
              className="rounded-[0.98rem] shadow-none"
            >
              当前线索已通过预检，确认后会从线索工作台中隐藏。
            </ActionBanner>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/50 bg-background/60 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[12px] leading-5 text-muted-foreground">
            {guard.canMoveToRecycleBin
              ? "后续如需恢复，请在回收站治理页处理。"
              : `${guard.blockerSummary}${guard.fallbackActionLabel ? ` 建议改走：${guard.fallbackActionLabel}。` : ""}`}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-0 items-center justify-center rounded-lg border border-border/60 bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-primary"
            >
              取消
            </button>
            {guard.canMoveToRecycleBin ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending || !onConfirm}
                className="inline-flex min-h-0 items-center justify-center rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground shadow-sm transition-all hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-55"
              >
                {pending ? "处理中..." : "移入回收站"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
