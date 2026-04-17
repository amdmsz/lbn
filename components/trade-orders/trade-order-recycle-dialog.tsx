"use client";

import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
import type { RecycleFinalizePreview } from "@/lib/recycle-bin/types";
import {
  buildTradeOrderRecycleBlockerGroups,
  type TradeOrderRecycleBlockerGroup,
} from "@/lib/trade-orders/recycle-blocker-explanation";
import {
  TRADE_ORDER_RECYCLE_REASON_OPTIONS,
  type TradeOrderRecycleGuard,
  type TradeOrderRecycleReasonCode,
} from "@/lib/trade-orders/recycle-guards";

type TradeOrderRecycleDialogItem = {
  tradeNo: string;
  customerName: string;
  receiverName: string;
  receiverPhone: string;
  tradeStatus: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED";
  reviewStatus: string;
  updatedAt: Date | string;
};

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function getTradeStatusLabel(
  value: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "CANCELED",
) {
  switch (value) {
    case "DRAFT":
      return "草稿";
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已驳回";
    case "CANCELED":
      return "已取消";
    default:
      return value;
  }
}

function getReviewStatusLabel(value: string) {
  switch (value) {
    case "PENDING_REVIEW":
      return "待审核";
    case "APPROVED":
      return "已审核";
    case "REJECTED":
      return "已驳回";
    default:
      return value || "未记录";
  }
}

function getFinalizePreviewLabel(preview: RecycleFinalizePreview | null) {
  if (!preview) {
    return "3 天后待重算";
  }

  return preview.finalAction === "PURGE" ? "3 天后可 PURGE" : "3 天后仅 ARCHIVE";
}

function getFinalizePreviewVariant(preview: RecycleFinalizePreview | null) {
  if (!preview) {
    return "neutral" as const;
  }

  return preview.finalAction === "PURGE" ? ("warning" as const) : ("info" as const);
}

function getFinalizePreviewHint(preview: RecycleFinalizePreview | null) {
  if (!preview) {
    return "当前还没有拿到最终处理预览，请刷新后重试。";
  }

  if (preview.finalAction === "PURGE") {
    return preview.canEarlyPurge
      ? "当前最新服务端真相仍指向 light 对象。进入回收站后，冷静期内仅 ADMIN 可见“提前永久删除”。"
      : "当前真相仍指向 PURGE，但最终处理仍以 3 天到期时重新计算的最新服务端真相为准。";
  }

  return "当前最新服务端真相已经指向 ARCHIVE。即使先移入回收站，3 天后也只会封存，不会伪装成 PURGED。";
}

function getFallbackSuggestion() {
  return "建议改走取消 / 作废 / 订单治理链。";
}

export function TradeOrderRecycleDialog({
  open,
  item,
  guard,
  finalizePreview,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  pending = false,
}: Readonly<{
  open: boolean;
  item: TradeOrderRecycleDialogItem | null;
  guard: TradeOrderRecycleGuard | null;
  finalizePreview: RecycleFinalizePreview | null;
  reason: TradeOrderRecycleReasonCode;
  onReasonChange: (value: TradeOrderRecycleReasonCode) => void;
  onClose: () => void;
  onConfirm?: () => void;
  pending?: boolean;
}>) {
  if (!open || !item || !guard) {
    return null;
  }

  const moveBlockerGroups = buildTradeOrderRecycleBlockerGroups(guard.blockers);
  const finalizeBlockerGroups = buildTradeOrderRecycleBlockerGroups(
    finalizePreview?.blockers ?? [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/34 px-4 py-8">
      <div className="w-full max-w-3xl overflow-hidden rounded-[1.1rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={guard.canMoveToRecycleBin ? "可移入回收站" : "move 已被阻断"}
                variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
              />
              <StatusBadge
                label={getFinalizePreviewLabel(finalizePreview)}
                variant={getFinalizePreviewVariant(finalizePreview)}
              />
              <StatusBadge label="TradeOrder" variant="neutral" />
            </div>
            <div>
              <h3 className="text-[1.02rem] font-semibold text-black/86">移入回收站</h3>
              <p className="mt-1 text-sm leading-6 text-black/58">
                这里只展示 trade-order-adapter 返回的最新 move guard 和 finalize preview，不在组件里重写 TradeOrder recycle 规则。
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
            <SummaryRow label="成交主单" value={item.tradeNo} />
            <SummaryRow label="客户" value={item.customerName} />
            <SummaryRow label="收件人" value={item.receiverName} />
            <SummaryRow label="联系电话" value={item.receiverPhone} />
            <SummaryRow label="订单状态" value={getTradeStatusLabel(item.tradeStatus)} />
            <SummaryRow label="审核状态" value={getReviewStatusLabel(item.reviewStatus)} />
            <SummaryRow label="最近更新时间" value={formatDateTime(normalizeDate(item.updatedAt))} />
            <SummaryRow label="建议动作" value={guard.fallbackActionLabel} />
          </div>

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                当前 move guard
              </p>
              <StatusBadge
                label={guard.canMoveToRecycleBin ? "当前可 move" : "当前不可 move"}
                variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
              />
            </div>
            <p className="text-[13px] leading-5 text-black/58">
              {guard.canMoveToRecycleBin
                ? "当前仍属于纯草稿误建订单，可以先进入 3 天冷静期。"
                : guard.blockerSummary}
            </p>
            {!guard.canMoveToRecycleBin && moveBlockerGroups.length > 0 ? (
              <div className="grid gap-3 pt-1">
                {moveBlockerGroups.map((group) => (
                  <TradeOrderBlockerGroupCard key={`move-${group.key}`} group={group} />
                ))}
              </div>
            ) : null}
          </div>

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                3 天后最终处理预览
              </p>
              <StatusBadge
                label={getFinalizePreviewLabel(finalizePreview)}
                variant={getFinalizePreviewVariant(finalizePreview)}
              />
            </div>
            <p className="text-[13px] leading-5 text-black/58">
              {finalizePreview?.blockerSummary ?? "当前还没有拿到最终处理预览，请刷新后重试。"}
            </p>
            <p className="text-[12px] leading-5 text-black/48">
              {getFinalizePreviewHint(finalizePreview)}
            </p>
            {finalizeBlockerGroups.length > 0 ? (
              <div className="grid gap-3 pt-1">
                {finalizeBlockerGroups.map((group) => (
                  <TradeOrderBlockerGroupCard key={`finalize-${group.key}`} group={group} />
                ))}
              </div>
            ) : null}
          </div>

          {guard.canMoveToRecycleBin ? (
            <>
              <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    回收原因
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-black/54">
                    这里只记录为什么这张成交主单被判定为误建轻对象，不在组件里扩写额外规则。
                  </p>
                </div>
                <select
                  value={reason}
                  onChange={(event) =>
                    onReasonChange(event.target.value as TradeOrderRecycleReasonCode)
                  }
                  className="crm-select"
                >
                  {TRADE_ORDER_RECYCLE_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-[0.95rem] border border-[rgba(155,106,29,0.18)] bg-[rgba(255,248,238,0.86)] px-4 py-3 text-[13px] leading-6 text-[rgba(92,61,30,0.92)]">
                确认后只会进入 3 天冷静期。move 不等于将来一定能 purge，最终仍以到期时最新服务端真相重算。
              </div>
            </>
          ) : (
            <ActionBanner tone="danger">
              {guard.blockerSummary} {getFallbackSuggestion()}
            </ActionBanner>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] leading-5 text-black/56">
            {guard.canMoveToRecycleBin
              ? "成功后只会 router.refresh() 当前页；列表页当前行会自然消失，详情页继续走现有安全缺省 / notFound 语义。"
              : `${guard.blockerSummary} ${getFallbackSuggestion()}`}
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

function TradeOrderBlockerGroupCard({
  group,
}: Readonly<{
  group: TradeOrderRecycleBlockerGroup;
}>) {
  return (
    <div className="rounded-[0.9rem] border border-black/8 bg-[rgba(249,250,252,0.78)] p-3.5">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-black/82">{group.title}</p>
        <p className="text-[13px] leading-5 text-black/54">{group.description}</p>
      </div>

      <div className="mt-3 space-y-2">
        {group.items.map((item) => (
          <div
            key={`${group.key}-${item.name}`}
            className="rounded-[0.8rem] border border-black/8 bg-white/86 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-black/82">{item.name}</p>
              {typeof item.count === "number" ? (
                <StatusBadge label={`数量 ${item.count}`} variant="neutral" />
              ) : null}
            </div>
            <p className="mt-1 text-[13px] leading-5 text-black/56">{item.description}</p>
            <p className="mt-1 text-[12px] leading-5 text-black/48">
              建议动作：{item.suggestedAction}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
