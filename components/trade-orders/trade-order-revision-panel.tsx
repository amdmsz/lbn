"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
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
  requestAction,
  reviewAction,
  withdrawAction,
}: TradeOrderRevisionPanelProps) {
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
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
                setNotice(null);
                setRequestDialogOpen(true);
              }}
              disabled={blocked}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-3.5 text-[12.5px] font-medium text-amber-700 transition hover:border-amber-500/50 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
              title={blocked ? blockers.map((b) => b.message).join("; ") : ""}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              申请撤单
            </button>
          </div>
          {blocked ? (
            <div className="mt-3 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[11.5px] leading-4 text-amber-800 dark:text-amber-300">
              <div className="font-semibold">当前阶段不支持撤单:</div>
              {blockers.map((b) => (
                <div key={b.code} className="flex items-start gap-1.5">
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{b.message}</span>
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
            pending={pending}
            onClose={() => setRequestDialogOpen(false)}
            onSubmit={() => {
              const fd = new FormData();
              fd.set("tradeOrderId", tradeOrderId);
              fd.set("customerId", customerId);
              fd.set("kind", "CANCEL");
              fd.set("reason", reason.trim());
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
  pending,
  onClose,
  onSubmit,
}: Readonly<{
  tradeOrderId: string;
  customerId: string;
  tradeNo: string;
  reason: string;
  onReasonChange: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}>) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border/60 bg-card p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              发起撤单申请
            </h3>
            <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
              成交主单 {tradeNo} · 通过后将整单取消并逆向所有未发货任务/未确认收款
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

        <label className="mt-4 block">
          <span className="text-[11px] font-semibold text-muted-foreground">
            撤单原因 (必填,至少 4 个字)
          </span>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            className="crm-textarea mt-1 min-h-[5rem] text-[13px]"
            placeholder="例如:客户临时改主意不下单了 / 客户要求改成 5 件改成 3 件"
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
            disabled={pending || reason.trim().length < 4}
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
