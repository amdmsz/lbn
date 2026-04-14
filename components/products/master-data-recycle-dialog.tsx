"use client";

import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  MASTER_DATA_RECYCLE_REASON_OPTIONS,
  type MasterDataRecycleGuard,
  type MasterDataRecycleReasonCode,
} from "@/lib/products/recycle-guards";

export function MasterDataRecycleDialog({
  open,
  objectName,
  objectTypeLabel,
  secondaryLabel,
  domainLabel,
  updatedAt,
  guard,
  reason,
  onReasonChange,
  onClose,
  onFallbackAction,
  pending = false,
}: Readonly<{
  open: boolean;
  objectName: string;
  objectTypeLabel: string;
  secondaryLabel: string;
  domainLabel: string;
  updatedAt: Date;
  guard: MasterDataRecycleGuard;
  reason: MasterDataRecycleReasonCode;
  onReasonChange: (value: MasterDataRecycleReasonCode) => void;
  onClose: () => void;
  onFallbackAction?: () => void;
  pending?: boolean;
}>) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/34 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-[1.1rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={
                  guard.canMoveToRecycleBin
                    ? "\u53ef\u6062\u590d\u5220\u9664"
                    : "\u5f15\u7528\u963b\u65ad"
                }
                variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
              />
              <StatusBadge label={objectTypeLabel} variant="neutral" />
            </div>
            <div>
              <h3 className="text-[1.02rem] font-semibold text-black/86">
                {"\u79fb\u5165\u56de\u6536\u7ad9"}
              </h3>
              <p className="mt-1 text-sm leading-6 text-black/58">
                {
                  "\u5148\u786e\u8ba4\u5f53\u524d\u5bf9\u8c61\u7684\u5f15\u7528\u5173\u7cfb\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u5141\u8bb8\u8fdb\u5165\u56de\u6536\u7ad9\u3002"
                }
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="crm-button crm-button-ghost min-h-0 px-2.5 py-2 text-sm"
          >
            {"\u5173\u95ed"}
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-3 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.78)] p-4 sm:grid-cols-2">
            <SummaryRow label="\u5bf9\u8c61\u540d\u79f0" value={objectName} />
            <SummaryRow label="\u5bf9\u8c61\u7c7b\u578b" value={objectTypeLabel} />
            <SummaryRow label="\u6b21\u6807\u8bc6" value={secondaryLabel} />
            <SummaryRow label="\u6240\u5c5e\u57df" value={domainLabel} />
            <SummaryRow
              label="\u6700\u8fd1\u66f4\u65b0\u65f6\u95f4"
              value={formatDateTime(updatedAt)}
            />
            <SummaryRow label="blocker \u6458\u8981" value={guard.blockerSummary} />
          </div>

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                {"\u5220\u9664\u539f\u56e0"}
              </p>
              <p className="mt-1 text-[13px] leading-5 text-black/54">
                {
                  "\u7528\u4e8e\u786e\u8ba4\u8fd9\u662f\u8bef\u5efa\u3001\u6d4b\u8bd5\u6216\u91cd\u590d\u5bf9\u8c61\uff0c\u540e\u7eed\u56de\u6536\u7ad9\u4e2d\u5fc3\u4f1a\u6cbf\u7528\u8fd9\u7ec4\u539f\u56e0\u5b57\u6bb5\u3002"
                }
              </p>
            </div>
            <select
              value={reason}
              onChange={(event) =>
                onReasonChange(event.target.value as MasterDataRecycleReasonCode)
              }
              className="crm-select"
            >
              {MASTER_DATA_RECYCLE_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {guard.blockers.length > 0 ? (
            <div className="space-y-2 rounded-[0.95rem] border border-[rgba(141,59,51,0.14)] bg-[rgba(255,247,246,0.86)] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-danger)]">
                {"\u5f15\u7528\u5173\u7cfb"}
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
                    <StatusBadge
                      label={`\u963b\u65ad ${blocker.count}`}
                      variant="danger"
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ActionBanner tone="success">
              {
                "\u5f53\u524d\u5bf9\u8c61\u5df2\u901a\u8fc7\u5546\u54c1\u57df\u56de\u6536\u7ad9\u9884\u68c0\uff0c\u540e\u7eed\u53ef\u4ee5\u63a5\u5165\u7edf\u4e00\u56de\u6536\u7ad9\u4e2d\u5fc3\u3002"
              }
            </ActionBanner>
          )}

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.74)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
              {"\u5f71\u54cd\u8bf4\u660e"}
            </p>
            <ul className="space-y-1.5 text-[13px] leading-5 text-black/56">
              <li>
                {
                  "\u79fb\u5165\u56de\u6536\u7ad9\u540e\u5e94\u4ece\u9ed8\u8ba4\u4e1a\u52a1\u5217\u8868\u4e2d\u9690\u85cf\u3002"
                }
              </li>
              <li>
                {
                  "\u4e0d\u4f1a\u66ff\u4ee3\u542f\u7528 / \u505c\u7528\u8fd9\u6761\u4e3b\u751f\u547d\u5468\u671f\u3002"
                }
              </li>
              <li>
                {
                  "\u5df2\u6709\u5ba1\u8ba1\u8bb0\u5f55\u548c\u5f15\u7528\u5173\u7cfb\u8bf4\u660e\u4f1a\u7ee7\u7eed\u4fdd\u7559\u3002"
                }
              </li>
              <li>
                {
                  "\u6c38\u4e45\u5220\u9664\u4e0d\u4f1a\u5728\u5f53\u524d\u4e1a\u52a1\u9875\u4e2d\u6267\u884c\u3002"
                }
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] leading-5 text-black/56">
            {guard.canMoveToRecycleBin
              ? "\u5f53\u524d\u9636\u6bb5\u5148\u5b8c\u6210\u56de\u6536\u7ad9\u9884\u68c0\u4e0e\u52a8\u4f5c\u8fb9\u754c\uff0c\u771f\u5b9e\u5165\u56de\u6536\u7ad9\u4f1a\u5728 Phase 1B-3 \u63a5\u5165\u3002"
              : "\u5f53\u524d\u5bf9\u8c61\u5df2\u8fdb\u5165\u4e1a\u52a1\u5f15\u7528\u94fe\uff0c\u672c\u8f6e\u4e0d\u5141\u8bb8\u79fb\u5165\u56de\u6536\u7ad9\uff0c\u8bf7\u6539\u4e3a\u505c\u7528\u3002"}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              {"\u53d6\u6d88"}
            </button>
            {guard.canMoveToRecycleBin ? (
              <button
                type="button"
                disabled
                className="crm-button crm-button-primary cursor-not-allowed opacity-55"
              >
                {"\u79fb\u5165\u56de\u6536\u7ad9"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onFallbackAction}
                disabled={pending}
                className="crm-button crm-button-primary"
              >
                {pending ? "\u5904\u7406\u4e2d..." : guard.fallbackActionLabel}
              </button>
            )}
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
