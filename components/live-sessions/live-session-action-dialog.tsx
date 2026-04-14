"use client";

import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import {
  LIVE_SESSION_RECYCLE_REASON_OPTIONS,
  type LiveSessionRecycleGuard,
  type LiveSessionRecycleReasonCode,
} from "@/lib/live-sessions/recycle-guards";

type LiveSessionDialogMode = "cancel" | "archive" | "recycle";

type LiveSessionDialogItem = {
  title: string;
  hostName: string;
  roomId: string | null;
  startAt: Date;
  updatedAt: Date;
  blockerSummary: string;
};

function getModeMeta(mode: LiveSessionDialogMode) {
  switch (mode) {
    case "cancel":
      return {
        title: "\u53d6\u6d88\u573a\u6b21",
        badgeLabel: "\u751f\u547d\u5468\u671f\u52a8\u4f5c",
        badgeVariant: "warning" as const,
        description:
          "\u53d6\u6d88\u540e\u573a\u6b21\u4f1a\u4fdd\u7559\u5728\u5386\u53f2\u4e2d\uff0c\u4f46\u4e0d\u518d\u4f5c\u4e3a\u6709\u6548\u6392\u671f\u7ee7\u7eed\u4f7f\u7528\u3002",
        primaryActionLabel: "\u786e\u8ba4\u53d6\u6d88",
        hint: "\u5f53\u524d\u52a8\u4f5c\u4f1a\u628a\u573a\u6b21\u4ece\u540e\u7eed\u4f7f\u7528\u4e2d\u9000\u51fa\uff0c\u4f46\u4e0d\u4f1a\u5220\u6389\u73b0\u6709\u8bb0\u5f55\u3002",
      };
    case "archive":
      return {
        title: "\u5f52\u6863\u573a\u6b21",
        badgeLabel: "\u5386\u53f2\u4fdd\u7559",
        badgeVariant: "info" as const,
        description:
          "\u5f52\u6863\u4f1a\u628a\u573a\u6b21\u6807\u8bb0\u4e3a\u5df2\u7ed3\u675f\uff0c\u7528\u4e8e\u540e\u7eed\u56de\u770b\u3001\u9080\u7ea6\u5ba1\u8ba1\u548c\u793c\u54c1\u8d44\u683c\u53c2\u8003\u3002",
        primaryActionLabel: "\u786e\u8ba4\u5f52\u6863",
        hint: "\u5f52\u6863\u4e0d\u662f\u5220\u9664\uff0c\u800c\u662f\u628a\u573a\u6b21\u4fdd\u7559\u4e3a\u5386\u53f2\u8bb0\u5f55\u3002",
      };
    default:
      return {
        title: "\u79fb\u5165\u56de\u6536\u7ad9",
        badgeLabel: "\u5220\u9664\u6761\u4ef6\u9884\u68c0",
        badgeVariant: "warning" as const,
        description:
          "\u5148\u786e\u8ba4\u573a\u6b21\u662f\u5426\u5df2\u8fdb\u5165\u9080\u7ea6\u3001\u793c\u54c1\u6216\u8fd0\u8425\u5386\u53f2\u94fe\uff0c\u518d\u51b3\u5b9a\u662f\u5426\u5141\u8bb8\u540e\u7eed\u63a5\u5165\u56de\u6536\u7ad9\u3002",
        primaryActionLabel: "\u79fb\u5165\u56de\u6536\u7ad9",
        hint: "\u672c\u8f6e\u5148\u5b8c\u6210 LiveSession \u7684\u5220\u9664\u9884\u68c0\u548c\u66ff\u4ee3\u52a8\u4f5c\u5206\u6d41\uff0c\u771f\u5b9e\u5165\u56de\u6536\u7ad9\u4f1a\u5728\u540e\u7eed\u56de\u6536\u7ad9\u4e2d\u5fc3\u63a5\u5165\u3002",
      };
  }
}

export function LiveSessionActionDialog({
  open,
  mode,
  item,
  guard,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  pending = false,
}: Readonly<{
  open: boolean;
  mode: LiveSessionDialogMode;
  item: LiveSessionDialogItem | null;
  guard?: LiveSessionRecycleGuard | null;
  reason?: LiveSessionRecycleReasonCode;
  onReasonChange?: (value: LiveSessionRecycleReasonCode) => void;
  onClose: () => void;
  onConfirm?: () => void;
  pending?: boolean;
}>) {
  if (!open || !item) {
    return null;
  }

  const meta = getModeMeta(mode);
  const recycleGuard = guard ?? null;
  const fallbackAction =
    recycleGuard && !recycleGuard.canMoveToRecycleBin
      ? recycleGuard.fallbackAction
      : null;
  const disabledFallback =
    fallbackAction === "none" || (mode === "recycle" && recycleGuard?.canMoveToRecycleBin);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8">
      <div className="w-full max-w-2xl overflow-hidden rounded-[1.05rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={meta.badgeLabel} variant={meta.badgeVariant} />
              <StatusBadge label="\u76f4\u64ad\u573a\u6b21" variant="neutral" />
            </div>
            <div>
              <h3 className="text-[1.02rem] font-semibold text-black/86">{meta.title}</h3>
              <p className="mt-1 text-sm leading-6 text-black/58">{meta.description}</p>
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
            <SummaryRow label="\u573a\u6b21\u540d\u79f0" value={item.title} />
            <SummaryRow label="\u5bf9\u8c61\u7c7b\u578b" value="\u76f4\u64ad\u573a\u6b21" />
            <SummaryRow
              label="\u6b21\u6807\u8bc6"
              value={
                item.roomId
                  ? `${item.hostName} / ${item.roomId}`
                  : item.hostName
              }
            />
            <SummaryRow label="\u6240\u5c5e\u57df" value="\u76f4\u64ad\u573a\u6b21 / \u8fd0\u8425\u534f\u540c" />
            <SummaryRow
              label="\u5f00\u64ad\u65f6\u95f4"
              value={formatDateTime(item.startAt)}
            />
            <SummaryRow
              label="\u6700\u8fd1\u66f4\u65b0"
              value={formatDateTime(item.updatedAt)}
            />
          </div>

          {mode === "recycle" && recycleGuard ? (
            <>
              <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    {"\u5220\u9664\u539f\u56e0"}
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-black/54">
                    {
                      "\u7528\u4e8e\u8bb0\u5f55\u8fd9\u662f\u8bef\u5efa\u3001\u6d4b\u8bd5\u6216\u91cd\u590d\u573a\u6b21\uff0c\u540e\u7eed\u56de\u6536\u7ad9\u4e2d\u5fc3\u4f1a\u6cbf\u7528\u8fd9\u7ec4\u539f\u56e0\u4fe1\u606f\u3002"
                    }
                  </p>
                </div>
                <select
                  value={reason}
                  onChange={(event) =>
                    onReasonChange?.(
                      event.target.value as LiveSessionRecycleReasonCode,
                    )
                  }
                  className="crm-select"
                >
                  {LIVE_SESSION_RECYCLE_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {recycleGuard.blockers.length > 0 ? (
                <div className="space-y-2 rounded-[0.95rem] border border-[rgba(141,59,51,0.14)] bg-[rgba(255,247,246,0.86)] p-4">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-danger)]">
                    {"\u5f15\u7528\u5173\u7cfb"}
                  </p>
                  <div className="space-y-2">
                    {recycleGuard.blockers.map((blocker) => (
                      <div
                        key={blocker.name}
                        className="flex items-start justify-between gap-4 rounded-[0.85rem] border border-[rgba(141,59,51,0.12)] bg-white/78 px-3 py-2.5"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-black/82">
                            {blocker.name}
                          </p>
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
                    "\u5f53\u524d\u573a\u6b21\u5df2\u901a\u8fc7 LiveSession \u8bef\u5efa\u5220\u9664\u9884\u68c0\uff0c\u4f46\u771f\u5b9e\u5165\u56de\u6536\u7ad9\u4f1a\u5728\u540e\u7eed\u56de\u6536\u7ad9\u4e2d\u5fc3\u63a5\u5165\u3002"
                  }
                </ActionBanner>
              )}
            </>
          ) : null}

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.74)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
              {mode === "recycle" ? "\u5f71\u54cd\u8bf4\u660e" : "\u52a8\u4f5c\u5f71\u54cd"}
            </p>
            <ul className="space-y-1.5 text-[13px] leading-5 text-black/56">
              {mode === "cancel" ? (
                <>
                  <li>
                    {
                      "\u573a\u6b21\u4f1a\u4fdd\u7559\u4e3a\u53d6\u6d88\u8bb0\u5f55\uff0c\u4e0d\u4f1a\u4ece\u7cfb\u7edf\u4e2d\u6d88\u5931\u3002"
                    }
                  </li>
                  <li>
                    {
                      "\u5df2\u6709\u573a\u6b21\u4e0a\u4e0b\u6587\u3001\u5ba1\u8ba1\u8bb0\u5f55\u548c\u5ba2\u6237\u53c2\u8003\u4fe1\u606f\u4ecd\u4f1a\u4fdd\u7559\u3002"
                    }
                  </li>
                </>
              ) : null}
              {mode === "archive" ? (
                <>
                  <li>
                    {
                      "\u573a\u6b21\u4f1a\u6807\u8bb0\u4e3a\u5df2\u7ed3\u675f\uff0c\u7ee7\u7eed\u4f5c\u4e3a\u5386\u53f2\u573a\u6b21\u4fdd\u7559\u3002"
                    }
                  </li>
                  <li>
                    {
                      "\u540e\u7eed\u4ecd\u53ef\u7528\u4e8e\u9080\u7ea6\u56de\u770b\u3001\u793c\u54c1\u8d44\u683c\u53c2\u8003\u548c\u8fd0\u8425\u5ba1\u8ba1\u3002"
                    }
                  </li>
                </>
              ) : null}
              {mode === "recycle" ? (
                <>
                  <li>
                    {
                      "\u79fb\u5165\u56de\u6536\u7ad9\u540e\u5e94\u4ece\u9ed8\u8ba4\u573a\u6b21\u5217\u8868\u4e2d\u9690\u85cf\u3002"
                    }
                  </li>
                  <li>
                    {
                      "\u4e0d\u4f1a\u66ff\u4ee3\u53d6\u6d88\u6216\u5f52\u6863\u8fd9\u6761\u4e3b\u751f\u547d\u5468\u671f\u8def\u5f84\u3002"
                    }
                  </li>
                  <li>
                    {
                      "\u6c38\u4e45\u5220\u9664\u4e0d\u4f1a\u5728\u5f53\u524d\u4e1a\u52a1\u9875\u4e2d\u6267\u884c\u3002"
                    }
                  </li>
                </>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] leading-5 text-black/56">
            {mode === "recycle" && recycleGuard
              ? recycleGuard.canMoveToRecycleBin
                ? meta.hint
                : item.blockerSummary
              : meta.hint}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="crm-button crm-button-secondary"
            >
              {"\u53d6\u6d88"}
            </button>
            {mode === "recycle" ? (
              recycleGuard?.canMoveToRecycleBin ? (
                <button
                  type="button"
                  disabled
                  className="crm-button crm-button-primary cursor-not-allowed opacity-55"
                >
                  {meta.primaryActionLabel}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={pending || disabledFallback}
                  className="crm-button crm-button-primary disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {pending
                    ? "\u5904\u7406\u4e2d..."
                    : recycleGuard?.fallbackActionLabel ??
                      "\u67e5\u770b\u5f15\u7528\u5173\u7cfb"}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={onConfirm}
                disabled={pending}
                className="crm-button crm-button-primary"
              >
                {pending ? "\u5904\u7406\u4e2d..." : meta.primaryActionLabel}
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
