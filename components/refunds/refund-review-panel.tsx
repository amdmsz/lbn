"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  Undo2,
  X,
} from "lucide-react";

import type { RefundActionResult } from "@/app/(dashboard)/orders/actions";
import { cn } from "@/lib/utils";

export type RefundRow = {
  id: string;
  tradeOrderId: string;
  tradeNo: string;
  customerName: string;
  customerPhone: string;
  customerId: string;
  requestedAmount: string;
  approvedAmount: string | null;
  status: "PENDING_FINANCE" | "APPROVED_FINANCE" | "PAID_OUT" | "REJECTED_FINANCE" | "WITHDRAWN";
  reason: string;
  reasonDetail: string;
  requesterName: string;
  requestedAt: Date | string;
};

export type RefundReviewPanelProps = Readonly<{
  rows: RefundRow[];
  canApprove: boolean;
  canPayout: boolean;
  approveAction: (formData: FormData) => Promise<RefundActionResult>;
  rejectAction: (formData: FormData) => Promise<RefundActionResult>;
  payoutAction: (formData: FormData) => Promise<RefundActionResult>;
  withdrawAction: (formData: FormData) => Promise<RefundActionResult>;
}>;

const REASON_LABEL: Record<string, string> = {
  CUSTOMER_REGRET: "客户反悔",
  QUALITY_ISSUE: "质量问题",
  PRICING_DISPUTE: "价格争议",
  DUPLICATE_PAYMENT: "重复收款",
  OTHER: "其他",
};

const STATUS_META: Record<RefundRow["status"], { label: string; tone: string }> = {
  PENDING_FINANCE: { label: "待审批", tone: "amber" },
  APPROVED_FINANCE: { label: "已批准·待出账", tone: "info" },
  PAID_OUT: { label: "已出账", tone: "success" },
  REJECTED_FINANCE: { label: "已驳回", tone: "neutral" },
  WITHDRAWN: { label: "已撤回", tone: "neutral" },
};

function formatTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function RefundReviewPanel({
  rows,
  canApprove,
  canPayout,
  approveAction,
  rejectAction,
  payoutAction,
  withdrawAction,
}: RefundReviewPanelProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600/70" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">当前没有待处理的退款申请</p>
        <p className="mt-1 text-[12px] text-muted-foreground">销售/主管发起申请后会显示在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <RefundCard
          key={row.id}
          row={row}
          canApprove={canApprove}
          canPayout={canPayout}
          approveAction={approveAction}
          rejectAction={rejectAction}
          payoutAction={payoutAction}
          withdrawAction={withdrawAction}
        />
      ))}
    </div>
  );
}

function RefundCard({
  row,
  canApprove,
  canPayout,
  approveAction,
  rejectAction,
  payoutAction,
  withdrawAction,
}: Readonly<
  Omit<RefundReviewPanelProps, "rows" | "currentUserId"> & { row: RefundRow }
>) {
  const [approvedAmount, setApprovedAmount] = useState(row.requestedAmount);
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [payoutMethod, setPayoutMethod] = useState<
    "ALIPAY" | "WECHAT" | "BANK_TRANSFER" | "OFFLINE_CASH" | "OTHER"
  >("BANK_TRANSFER");
  const [payoutReference, setPayoutReference] = useState("");
  const [notice, setNotice] = useState<
    { status: "success" | "error"; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const statusMeta = STATUS_META[row.status];
  const isPending = row.status === "PENDING_FINANCE";
  const isApproved = row.status === "APPROVED_FINANCE";

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium",
                statusMeta.tone === "amber" &&
                  "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                statusMeta.tone === "info" &&
                  "border-primary/30 bg-primary/8 text-primary",
                statusMeta.tone === "success" &&
                  "border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
                statusMeta.tone === "neutral" &&
                  "border-border/60 bg-muted text-muted-foreground",
              )}
            >
              {statusMeta.label}
            </span>
            <span className="text-[13px] font-semibold text-foreground">
              {row.tradeNo}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {row.customerName} · {row.customerPhone}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">¥{row.requestedAmount}</span> 申请
            </span>
            {row.approvedAmount ? (
              <span>
                / 已批 <span className="font-medium text-foreground">¥{row.approvedAmount}</span>
              </span>
            ) : null}
            <span>· {REASON_LABEL[row.reason] ?? row.reason}</span>
            <span>· {row.requesterName}</span>
            <span>· {formatTime(row.requestedAt)}</span>
          </div>
          <p className="mt-2 text-[12.5px] leading-5 text-foreground/85">
            {row.reasonDetail}
          </p>
        </div>
      </div>

      {/* 待审批: 财务复审区 */}
      {isPending && canApprove ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              批准金额(默认=申请金额, 可改 ≤)
            </p>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={approvedAmount}
              onChange={(e) => setApprovedAmount(e.target.value)}
              className="crm-input mt-1 h-8 w-full text-right tabular-nums"
            />
            <textarea
              rows={2}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="复审备注(可选)"
              className="crm-textarea mt-2 min-h-[3rem] text-[12.5px]"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("refundRequestId", row.id);
                  fd.set("tradeOrderId", row.tradeOrderId);
                  fd.set("approvedAmount", approvedAmount);
                  fd.set("reviewNote", reviewNote.trim());
                  startTransition(async () => {
                    const result = await approveAction(fd);
                    setNotice(result);
                  });
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 text-[12.5px] font-medium text-emerald-700 transition hover:border-emerald-500/50 disabled:opacity-50 dark:text-emerald-300"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                批准
              </button>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              驳回理由(必填, ≥4字)
            </p>
            <textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例如: 客户付款凭证不全, 暂不予退款"
              className="crm-textarea mt-1 min-h-[5rem] text-[12.5px]"
            />
            <button
              type="button"
              disabled={pending || rejectReason.trim().length < 4}
              onClick={() => {
                const fd = new FormData();
                fd.set("refundRequestId", row.id);
                fd.set("tradeOrderId", row.tradeOrderId);
                fd.set("rejectReason", rejectReason.trim());
                startTransition(async () => {
                  const result = await rejectAction(fd);
                  setNotice(result);
                });
              }}
              className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/8 px-3 text-[12.5px] font-medium text-destructive transition hover:border-destructive/45 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              驳回
            </button>
          </div>
        </div>
      ) : null}

      {/* 已批准: 财务出账区 */}
      {isApproved && canPayout ? (
        <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            登记实际出账(批准 ¥{row.approvedAmount})
          </p>
          <div className="mt-2 grid gap-2 md:grid-cols-[10rem_1fr_auto]">
            <select
              value={payoutMethod}
              onChange={(e) =>
                setPayoutMethod(e.target.value as typeof payoutMethod)
              }
              className="crm-input h-9 text-[12.5px]"
            >
              <option value="ALIPAY">支付宝</option>
              <option value="WECHAT">微信</option>
              <option value="BANK_TRANSFER">银行转账</option>
              <option value="OFFLINE_CASH">线下现金</option>
              <option value="OTHER">其他</option>
            </select>
            <input
              type="text"
              value={payoutReference}
              onChange={(e) => setPayoutReference(e.target.value)}
              placeholder="转账流水号/收据号(可选)"
              className="crm-input h-9 text-[12.5px]"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("refundRequestId", row.id);
                fd.set("tradeOrderId", row.tradeOrderId);
                fd.set("customerId", row.customerId);
                fd.set("payoutMethod", payoutMethod);
                fd.set("payoutReference", payoutReference.trim());
                startTransition(async () => {
                  const result = await payoutAction(fd);
                  setNotice(result);
                });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 text-[12.5px] font-medium text-primary transition hover:bg-primary/15 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
              记录出账完成
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            出账后将自动建反向凭证 (ReversePaymentRecord), 标 PaymentRecord
            isReversed=true, 不再可冲账二次.
          </p>
        </div>
      ) : null}

      {/* 撤回 — 仅发起人 */}
      {isPending ? (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const fd = new FormData();
              fd.set("refundRequestId", row.id);
              fd.set("tradeOrderId", row.tradeOrderId);
              startTransition(async () => {
                const result = await withdrawAction(fd);
                setNotice(result);
              });
            }}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-border/60 px-2.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:opacity-50"
          >
            <Undo2 className="h-3 w-3" />
            发起人撤回(仅本人)
          </button>
        </div>
      ) : null}

      {notice ? (
        <div
          className={cn(
            "mt-3 flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-4",
            notice.status === "success"
              ? "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
              : "border-destructive/25 bg-destructive/8 text-destructive",
          )}
        >
          <span className="flex items-start gap-1.5">
            {notice.status === "success" ? (
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            )}
            {notice.message}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 text-current/60 transition hover:text-current"
            aria-label="关闭"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
