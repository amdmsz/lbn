"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Undo2,
  X,
} from "lucide-react";

import type { TradeOrderRevisionActionResult } from "@/app/(dashboard)/orders/actions";
import { cn } from "@/lib/utils";

export type ActiveRevision = {
  id: string;
  kind: "CANCEL" | "REDUCE_QUANTITY" | "MODIFY_LINES";
  status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  reason: string;
  requestedAt: Date | string;
  requester: { id: string; name: string; username: string } | null;
};

export type RevisionBlocker = {
  code: string;
  message: string;
};

export type RevisableItem = {
  id: string;
  titleSnapshot: string;
  qty: number;
  dealUnitPrice: string;
};

export type TradeOrderRevisionPanelProps = Readonly<{
  tradeOrderId: string;
  customerId: string;
  tradeNo: string;
  isApproved: boolean;
  isRevisionPending: boolean;
  activeRevision: ActiveRevision | null;
  blockers: RevisionBlocker[];
  canRequestRevision: boolean;
  canReviewRevision: boolean;
  currentUserId: string;
  // 仅 SKU 类型行 (排除 GIFT/BUNDLE), 用于减量编辑
  revisableItems: RevisableItem[];
  requestAction: (formData: FormData) => Promise<TradeOrderRevisionActionResult>;
  reviewAction: (formData: FormData) => Promise<TradeOrderRevisionActionResult>;
  withdrawAction: (formData: FormData) => Promise<TradeOrderRevisionActionResult>;
}>;

const KIND_LABEL: Record<ActiveRevision["kind"], string> = {
  CANCEL: "整单撤销",
  REDUCE_QUANTITY: "减少数量",
  MODIFY_LINES: "更换 SKU",
};

function formatTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function TradeOrderRevisionPanel({
  tradeOrderId,
  customerId,
  tradeNo,
  isApproved,
  isRevisionPending,
  activeRevision,
  blockers,
  canRequestRevision,
  canReviewRevision,
  currentUserId,
  revisableItems,
  requestAction,
  reviewAction,
  withdrawAction,
}: TradeOrderRevisionPanelProps) {
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [revisionKind, setRevisionKind] = useState<"CANCEL" | "REDUCE_QUANTITY">(
    "CANCEL",
  );
  const [patchedQty, setPatchedQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [notice, setNotice] = useState<
    { status: "success" | "error"; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const blocked = blockers.length > 0;
  const isOwnRequest =
    activeRevision?.requester?.id === currentUserId && currentUserId !== "";

  // === 已审核但无 pending revision: 显示 "申请撤单" 按钮 ===
  if (isApproved && !isRevisionPending && canRequestRevision) {
    return (
      <>
        <div className="rounded-xl border border-border/60 bg-card p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                客户反悔 / 调整需求?
              </p>
              <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                本订单已审核。如客户取消下单,可在此发起撤单申请,由主管复审通过后逆向所有履约/收款。
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReason("");
                setRevisionKind("CANCEL");
                setPatchedQty(
                  Object.fromEntries(revisableItems.map((it) => [it.id, it.qty])),
                );
                setNotice(null);
                setRequestDialogOpen(true);
              }}
              disabled={blocked}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-3.5 text-[12.5px] font-medium text-amber-700 transition hover:border-amber-500/50 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
              title={blocked ? blockers.map((b) => b.message).join("; ") : ""}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              申请撤单 / 减量
            </button>
          </div>
          {blocked ? (
            <div className="mt-3 space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[11.5px] leading-4 text-amber-800 dark:text-amber-300">
              <div className="font-semibold">当前阶段不支持撤单:</div>
              {blockers.map((b) => (
                <div key={b.code} className="space-y-1">
                  <div className="flex items-start gap-1.5">
                    <AlertTriangle
                      className="mt-0.5 h-3 w-3 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{b.message}</span>
                  </div>
                  <BlockerActionHint code={b.code} />
                </div>
              ))}
            </div>
          ) : null}
          {notice ? (
            <NoticeRow notice={notice} onDismiss={() => setNotice(null)} />
          ) : null}
        </div>

        {requestDialogOpen ? (
          <RequestDialog
            tradeOrderId={tradeOrderId}
            customerId={customerId}
            tradeNo={tradeNo}
            reason={reason}
            onReasonChange={setReason}
            revisionKind={revisionKind}
            onRevisionKindChange={setRevisionKind}
            revisableItems={revisableItems}
            patchedQty={patchedQty}
            onPatchedQtyChange={setPatchedQty}
            pending={pending}
            onClose={() => setRequestDialogOpen(false)}
            onSubmit={() => {
              const fd = new FormData();
              fd.set("tradeOrderId", tradeOrderId);
              fd.set("customerId", customerId);
              fd.set("kind", revisionKind);
              fd.set("reason", reason.trim());
              if (revisionKind === "REDUCE_QUANTITY") {
                const patchedLines = revisableItems
                  .filter((it) => (patchedQty[it.id] ?? it.qty) < it.qty)
                  .map((it) => ({
                    itemId: it.id,
                    newQty: Math.max(0, patchedQty[it.id] ?? it.qty),
                  }));
                fd.set("patchedLines", JSON.stringify(patchedLines));
              }
              startTransition(async () => {
                const result = await requestAction(fd);
                setNotice(result);
                if (result.status === "success") {
                  setRequestDialogOpen(false);
                }
              });
            }}
          />
        ) : null}
      </>
    );
  }

  // === 已有 pending revision: 显示当前申请详情 + 复审/撤回 ===
  if (isRevisionPending && activeRevision) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <ArrowLeftRight
                className="h-4 w-4 text-amber-700 dark:text-amber-300"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                撤单申请审批中 · {KIND_LABEL[activeRevision.kind]}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] leading-5 text-amber-800/85 dark:text-amber-200/85">
              <span className="font-medium">原因:</span> {activeRevision.reason}
            </p>
            <p className="mt-1 text-[11.5px] leading-4 text-amber-700/75 dark:text-amber-300/75">
              发起人: {activeRevision.requester?.name ?? "—"} ·{" "}
              {formatTime(activeRevision.requestedAt)}
            </p>
          </div>
          {isOwnRequest ? (
            <button
              type="button"
              onClick={() => {
                const fd = new FormData();
                fd.set("revisionId", activeRevision.id);
                fd.set("tradeOrderId", tradeOrderId);
                fd.set("customerId", customerId);
                startTransition(async () => {
                  const result = await withdrawAction(fd);
                  setNotice(result);
                });
              }}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-[12px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 className="h-3 w-3" aria-hidden="true" />
              )}
              撤回申请
            </button>
          ) : null}
        </div>

        {canReviewRevision && !isOwnRequest ? (
          <div className="mt-3 space-y-2 rounded-lg border border-amber-500/25 bg-card p-3">
            <label className="block">
              <span className="text-[11px] font-semibold text-muted-foreground">
                复审备注 (可选)
              </span>
              <textarea
                rows={2}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                className="crm-textarea mt-1 min-h-[3rem] text-[12.5px]"
                placeholder="如需备注一并写入审计日志"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <ReviewButton
                decision="APPROVED"
                label="通过撤单"
                icon={CheckCircle2}
                tone="success"
                pending={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("revisionId", activeRevision.id);
                  fd.set("decision", "APPROVED");
                  fd.set("reviewNote", reviewNote.trim());
                  fd.set("tradeOrderId", tradeOrderId);
                  fd.set("customerId", customerId);
                  startTransition(async () => {
                    const result = await reviewAction(fd);
                    setNotice(result);
                  });
                }}
              />
              <ReviewButton
                decision="REJECTED"
                label="驳回(订单保持已审核)"
                icon={X}
                tone="danger"
                pending={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("revisionId", activeRevision.id);
                  fd.set("decision", "REJECTED");
                  fd.set("reviewNote", reviewNote.trim());
                  fd.set("tradeOrderId", tradeOrderId);
                  fd.set("customerId", customerId);
                  startTransition(async () => {
                    const result = await reviewAction(fd);
                    setNotice(result);
                  });
                }}
              />
            </div>
          </div>
        ) : null}

        {notice ? (
          <NoticeRow notice={notice} onDismiss={() => setNotice(null)} />
        ) : null}
      </div>
    );
  }

  return null;
}

function ReviewButton({
  decision,
  label,
  icon: Icon,
  tone,
  pending,
  onClick,
}: Readonly<{
  decision: "APPROVED" | "REJECTED";
  label: string;
  icon: typeof CheckCircle2;
  tone: "success" | "danger";
  pending: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "success"
          ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/50 hover:bg-emerald-500/15 dark:text-emerald-300"
          : "border-destructive/30 bg-destructive/8 text-destructive hover:border-destructive/45 hover:bg-destructive/12",
      )}
      data-decision={decision}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

function BlockerActionHint({ code }: Readonly<{ code: string }>) {
  if (code === "PAYMENT_CONFIRMED" || code === "COD_COLLECTED") {
    return (
      <Link
        href="/finance/refunds"
        className="ml-4.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary underline-offset-2 transition hover:underline"
      >
        暂不支持自动撤单, 但可以走退款流程
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </Link>
    );
  }
  if (code === "ALREADY_SHIPPED") {
    return (
      <p className="ml-4.5 text-[11px] text-muted-foreground">
        需要走退货流程 (Phase C, 待开发)
      </p>
    );
  }
  return null;
}

function NoticeRow({
  notice,
  onDismiss,
}: Readonly<{
  notice: { status: "success" | "error"; message: string };
  onDismiss: () => void;
}>) {
  return (
    <div
      className={cn(
        "mt-3 flex items-start justify-between gap-3 rounded-lg border px-2.5 py-2 text-[11.5px] leading-4",
        notice.status === "success"
          ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
          : "border-destructive/25 bg-destructive/8 text-destructive",
      )}
    >
      <span>{notice.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-current/60 transition hover:text-current"
        aria-label="关闭通知"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

function RequestDialog({
  tradeNo,
  reason,
  onReasonChange,
  revisionKind,
  onRevisionKindChange,
  revisableItems,
  patchedQty,
  onPatchedQtyChange,
  pending,
  onClose,
  onSubmit,
}: Readonly<{
  tradeOrderId: string;
  customerId: string;
  tradeNo: string;
  reason: string;
  onReasonChange: (value: string) => void;
  revisionKind: "CANCEL" | "REDUCE_QUANTITY";
  onRevisionKindChange: (kind: "CANCEL" | "REDUCE_QUANTITY") => void;
  revisableItems: RevisableItem[];
  patchedQty: Record<string, number>;
  onPatchedQtyChange: (next: Record<string, number>) => void;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}>) {
  const hasItems = revisableItems.length > 0;
  const someActuallyReduced = revisableItems.some(
    (it) => (patchedQty[it.id] ?? it.qty) < it.qty,
  );
  const canSubmit =
    reason.trim().length >= 4 &&
    (revisionKind === "CANCEL" || someActuallyReduced);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border/60 bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              发起撤单 / 减量申请
            </h3>
            <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
              成交主单 {tradeNo} · 主管复审通过后由系统执行
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* 类型切换 */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onRevisionKindChange("CANCEL")}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2.5 text-left text-[12.5px] transition",
              revisionKind === "CANCEL"
                ? "border-amber-500/35 bg-amber-500/8 text-foreground"
                : "border-border/60 bg-card text-muted-foreground hover:border-primary/25",
            )}
          >
            <div className="font-semibold">整单撤销</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              客户不买了, 主单标 CANCELED
            </div>
          </button>
          <button
            type="button"
            onClick={() => onRevisionKindChange("REDUCE_QUANTITY")}
            disabled={!hasItems}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2.5 text-left text-[12.5px] transition disabled:cursor-not-allowed disabled:opacity-40",
              revisionKind === "REDUCE_QUANTITY"
                ? "border-amber-500/35 bg-amber-500/8 text-foreground"
                : "border-border/60 bg-card text-muted-foreground hover:border-primary/25",
            )}
          >
            <div className="font-semibold">减少数量</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              客户调减某行, 通过后主单回草稿待重新提交
            </div>
          </button>
        </div>

        {/* 减量编辑区 */}
        {revisionKind === "REDUCE_QUANTITY" && hasItems ? (
          <div className="mt-3 rounded-lg border border-border/60 bg-[var(--color-shell-surface-soft)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              新数量 (newQty=0 表示删除该行)
            </p>
            <div className="mt-2 space-y-2">
              {revisableItems.map((item) => {
                const newQty = patchedQty[item.id] ?? item.qty;
                const isChanged = newQty < item.qty;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md border bg-card px-2.5 py-2 text-[12px]",
                      isChanged
                        ? "border-amber-500/30"
                        : "border-border/40",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {item.titleSnapshot}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground">
                        原 {item.qty} 件 · ¥{item.dealUnitPrice}/件
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max={item.qty - 1}
                        value={newQty}
                        onChange={(e) =>
                          onPatchedQtyChange({
                            ...patchedQty,
                            [item.id]: Math.max(
                              0,
                              Math.min(item.qty, Number(e.target.value) || 0),
                            ),
                          })
                        }
                        className="crm-input h-7 w-16 text-center text-[12px] tabular-nums"
                      />
                      <span className="text-[10.5px] text-muted-foreground">
                        / {item.qty}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {!someActuallyReduced ? (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                至少调减一行才能提交申请
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="mt-4 block">
          <span className="text-[11px] font-semibold text-muted-foreground">
            原因 (必填,至少 4 个字)
          </span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className="crm-textarea mt-1 min-h-[4.5rem] text-[13px]"
            placeholder={
              revisionKind === "CANCEL"
                ? "例如: 客户临时改主意不下单了"
                : "例如: 客户预算调整, 第 1 行从 10 件减到 5 件"
            }
            autoFocus
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-full border border-border/60 bg-card px-3.5 text-[12.5px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending || !canSubmit}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-3.5 text-[12.5px] font-medium text-amber-700 transition hover:border-amber-500/50 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            提交申请
          </button>
        </div>
      </div>
    </div>
  );
}
