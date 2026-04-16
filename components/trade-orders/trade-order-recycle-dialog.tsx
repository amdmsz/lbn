"use client";

import { ActionBanner } from "@/components/shared/action-banner";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/customers/metadata";
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

type BlockerStage = "审核层" | "拆单层" | "支付层" | "履约层" | "其他";

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

function resolveBlockerStage(
  blocker: TradeOrderRecycleGuard["blockers"][number],
): BlockerStage {
  if (
    blocker.name === "已取消订单" ||
    blocker.name === "非草稿订单" ||
    blocker.name === "订单已离开草稿态"
  ) {
    return "审核层";
  }

  if (blocker.name === "已生成供应商子单") {
    return "拆单层";
  }

  if (
    blocker.name === "已存在支付计划" ||
    blocker.name === "已存在支付记录" ||
    blocker.name === "已存在催收任务"
  ) {
    return "支付层";
  }

  if (
    blocker.name === "已存在发货任务" ||
    blocker.name === "已存在导出批次行" ||
    blocker.name === "已存在物流跟进" ||
    blocker.name === "已存在 COD 回款记录"
  ) {
    return "履约层";
  }

  return "其他";
}

function buildBlockerGroups(guard: TradeOrderRecycleGuard) {
  const groups = new Map<BlockerStage, TradeOrderRecycleGuard["blockers"]>();

  for (const blocker of guard.blockers) {
    const stage = resolveBlockerStage(blocker);
    const current = groups.get(stage) ?? [];
    current.push(blocker);
    groups.set(stage, current);
  }

  return [
    "审核层",
    "拆单层",
    "支付层",
    "履约层",
    "其他",
  ]
    .map((stage) => {
      const blockers = groups.get(stage as BlockerStage) ?? [];

      return blockers.length > 0
        ? {
            stage: stage as BlockerStage,
            blockers,
          }
        : null;
    })
    .filter((group): group is { stage: BlockerStage; blockers: TradeOrderRecycleGuard["blockers"] } =>
      Boolean(group),
    );
}

export function TradeOrderRecycleDialog({
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
  item: TradeOrderRecycleDialogItem | null;
  guard: TradeOrderRecycleGuard | null;
  reason: TradeOrderRecycleReasonCode;
  onReasonChange: (value: TradeOrderRecycleReasonCode) => void;
  onClose: () => void;
  onConfirm?: () => void;
  pending?: boolean;
}>) {
  if (!open || !item || !guard) {
    return null;
  }

  const blockerGroups = buildBlockerGroups(guard);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/34 px-4 py-8">
      <div className="w-full max-w-3xl overflow-hidden rounded-[1.1rem] border border-black/10 bg-[rgba(255,255,255,0.98)] shadow-[0_24px_60px_rgba(18,24,31,0.18)]">
        <div className="flex items-start justify-between gap-4 border-b border-black/7 bg-[rgba(247,248,250,0.88)] px-5 py-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={guard.canMoveToRecycleBin ? "可移入回收站" : "当前存在阻断"}
                variant={guard.canMoveToRecycleBin ? "warning" : "danger"}
              />
              <StatusBadge label="TradeOrder" variant="neutral" />
            </div>
            <div>
              <h3 className="text-[1.02rem] font-semibold text-black/86">移入回收站</h3>
              <p className="mt-1 text-sm leading-6 text-black/58">
                完全复用现有 TradeOrder recycle guard 真相，只在这里解释当前为什么能移入或不能移入。
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
            <SummaryRow label="父单编号" value={item.tradeNo} />
            <SummaryRow label="客户" value={item.customerName} />
            <SummaryRow label="收件人" value={item.receiverName} />
            <SummaryRow label="联系电话" value={item.receiverPhone} />
            <SummaryRow label="成交状态" value={getTradeStatusLabel(item.tradeStatus)} />
            <SummaryRow label="审核镜像" value={getReviewStatusLabel(item.reviewStatus)} />
            <SummaryRow
              label="最近更新时间"
              value={formatDateTime(normalizeDate(item.updatedAt))}
            />
            <SummaryRow label="建议动作" value={guard.fallbackActionLabel} />
          </div>

          {guard.canMoveToRecycleBin ? (
            <>
              <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    删除原因
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-black/54">
                    用于沉淀这张草稿父单为什么进入回收站。
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

              <ActionBanner tone="success">
                当前父单仍是纯草稿，且没有进入拆单、支付或履约链路，确认后会从当前业务页自然消失。
              </ActionBanner>
            </>
          ) : (
            <>
              <div className="space-y-2 rounded-[0.95rem] border border-[rgba(141,59,51,0.14)] bg-[rgba(255,247,246,0.86)] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--color-danger)]">
                  为什么不能移入回收站
                </p>
                <p className="text-[13px] leading-5 text-black/58">{guard.blockerSummary}</p>
              </div>

              <div className="space-y-3 rounded-[0.95rem] border border-black/7 bg-white/82 p-4">
                <div>
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
                    当前卡点层级
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-black/54">
                    下列分组直接来自现有 blocker 真相，只是按业务层级做展示归类。
                  </p>
                </div>

                <div className="grid gap-3">
                  {blockerGroups.map((group) => (
                    <div
                      key={group.stage}
                      className="rounded-[0.9rem] border border-black/8 bg-[rgba(249,250,252,0.78)] p-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-black/82">{group.stage}</p>
                        <StatusBadge
                          label={`阻断 ${group.blockers.reduce((sum, blocker) => sum + blocker.count, 0)}`}
                          variant="danger"
                        />
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.blockers.map((blocker) => (
                          <div
                            key={`${group.stage}-${blocker.name}`}
                            className="rounded-[0.8rem] border border-black/8 bg-white/86 px-3 py-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium text-black/82">{blocker.name}</p>
                              <StatusBadge label={`数量 ${blocker.count}`} variant="neutral" />
                            </div>
                            <p className="mt-1 text-[13px] leading-5 text-black/56">
                              {blocker.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <ActionBanner tone="danger">
                当前建议改走：{guard.fallbackActionLabel}。回收站只承接误建草稿，不承接已进入正式交易链路的父单。
              </ActionBanner>
            </>
          )}

          <div className="space-y-2 rounded-[0.95rem] border border-black/7 bg-[rgba(249,250,252,0.74)] p-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-black/40">
              影响说明
            </p>
            <ul className="space-y-1.5 text-[13px] leading-5 text-black/56">
              <li>移入回收站后，父单会从 `/fulfillment?tab=trade-orders` 和相关默认视图中隐藏。</li>
              <li>列表页确认成功后，当前行会随刷新自然消失。</li>
              <li>详情页确认成功后，会继续走现有安全缺省 / not found 语义。</li>
              <li>永久删除仍只在 `/recycle-bin` 治理页中处理。</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-black/7 bg-[rgba(247,248,250,0.8)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-[13px] leading-5 text-black/56">
            {guard.canMoveToRecycleBin
              ? "确认后会沿用现有查询隐藏规则，从当前业务页自然移除。"
              : `${guard.blockerSummary} 建议改走：${guard.fallbackActionLabel}。`}
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
