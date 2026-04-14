"use client";

import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { formatDateTime, getLeadSourceLabel } from "@/lib/leads/metadata";
import {
  LEAD_RECYCLE_REASON_OPTIONS,
  type LeadRecycleGuard,
  type LeadRecycleReasonCode,
} from "@/lib/leads/recycle-guards";
import type { LeadStatus } from "@prisma/client";

type LeadRecycleDialogItem = {
  name: string | null;
  phone: string;
  source: string;
  status: LeadStatus;
  updatedAt: Date | string;
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/34 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-[1.1rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={guard.canMoveToRecycleBin ? "可回收删除" : "存在阻断"}
                variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
              />
              <StatusBadge label="线索" variant="neutral" />
            </div>
            <div>
              <h3 className="text-[1.02rem] font-semibold text-black/86">移入回收站</h3>
              <p className="mt-1 text-sm leading-6 text-black/58">
                先确认线索是否已经进入客户、成交、礼品或导入回滚链，再决定是否允许移入回收站。
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="crm-button crm-button-ghost min-h-0 px-2.5 py-2 text-sm"
          >
            关闭
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.78)] p-4 sm:grid-cols-2">
            <SummaryRow label="线索名称" value={item.name?.trim() || "未填写姓名"} />
            <SummaryRow label="对象类型" value="线索" />
            <SummaryRow label="次标识" value={item.phone} />
            <SummaryRow label="所属域" value="线索中心 / 分配工作台" />
            <SummaryRow label="来源" value={getLeadSourceLabel(item.source as never)} />
            <SummaryRow
              label="最近更新时间"
              value={formatDateTime(normalizeDate(item.updatedAt))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
            <StatusBadge label="删除前状态" variant="neutral" />
            <LeadStatusBadge status={item.status} />
          </div>

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                删除原因
              </p>
              <p className="mt-1 text-[13px] leading-5 text-black/54">
                用于记录这条线索为什么进入回收站，后续治理页会沿用这组原因字段。
              </p>
            </div>
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
            <div className="space-y-2 rounded-[0.95rem] border border-[rgba(141,59,51,0.14)] bg-[rgba(255,247,246,0.86)] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-danger)]">
                阻断原因
              </p>
              <div className="space-y-2">
                {guard.blockers.map((blocker) => (
                  <div
                    key={blocker.name}
                    className="flex items-start justify-between gap-4 rounded-[0.85rem] border border-[rgba(141,59,51,0.12)] bg-white/78 px-3 py-2.5"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-black/82">{blocker.name}</p>
                      <p className="text-[13px] leading-5 text-black/56">
                        {blocker.description}
                      </p>
                    </div>
                    <StatusBadge label={`阻断 ${blocker.count}`} variant="danger" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ActionBanner tone="success">
              当前线索已通过回收站预检，确认后会立即从线索工作台中隐藏。
            </ActionBanner>
          )}

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.74)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
              影响说明
            </p>
            <ul className="space-y-1.5 text-[13px] leading-5 text-black/56">
              <li>移入回收站后，这条线索会从默认业务视图中隐藏。</li>
              <li>已分配、跟进和联系痕迹不会被抹掉，只是转入治理视图。</li>
              <li>恢复后会保留原负责人，不会重置 owner。</li>
              <li>永久删除不会在当前页面执行，只会在回收站治理页中处理。</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] leading-5 text-black/56">
            {guard.canMoveToRecycleBin
              ? "确认后线索会按现有查询规则从 /leads 工作台中自然消失。"
              : `${guard.blockerSummary}${guard.fallbackActionLabel ? ` 建议改走：${guard.fallbackActionLabel}。` : ""}`}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              关闭
            </button>
            {guard.canMoveToRecycleBin ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending || !onConfirm}
                className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
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

function SummaryRow({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="space-y-1">
      <p className="text-[12px] text-black/42">{label}</p>
      <p className="text-sm font-medium leading-5 text-black/78">{value}</p>
    </div>
  );
}
