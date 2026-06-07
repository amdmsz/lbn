"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageX,
  Truck,
  Undo2,
  X,
} from "lucide-react";

import type { ShippingReturnActionResult } from "@/app/(dashboard)/shipping/returns/actions";
import { cn } from "@/lib/utils";

// Phase C — 订单详情页 (销售 / 主管视角) 退货申请面板
// 跟 components/trade-orders/trade-order-revision-panel.tsx 风格保持一致.
// 状态机详见 prisma/schema.prisma ShippingReturnStatus.
//
// 三种渲染模式:
// a) 无 activeShippingReturn + 已发货 + canRequest: 显示"申请退货"按钮 + dialog
// b) PENDING_REVIEW + canReview + 非本人: 显示"通过 / 驳回"
// c) 进行中 (PENDING_RETURN_TRACKING / IN_RETURN_TRANSIT / RETURNED_TO_WAREHOUSE):
//    显示状态时间线 + 物流 / 入库进度; 发起人可"撤回" (仅 PENDING_REVIEW 阶段)

export type ShippingReturnPanelData = {
  id: string;
  status:
    | "PENDING_REVIEW"
    | "PENDING_RETURN_TRACKING"
    | "IN_RETURN_TRANSIT"
    | "RETURNED_TO_WAREHOUSE"
    | "REJECTED"
    | "CANCELED";
  reason:
    | "CUSTOMER_REJECT"
    | "QUALITY_ISSUE"
    | "WRONG_ITEM"
    | "DELIVERY_TIMEOUT"
    | "ADDRESS_PROBLEM"
    | "OTHER";
  reasonDetail: string;
  expectedRefundAmount: string;
  requestedAt: Date | string;
  requester: { id: string; name: string; username: string } | null;
  reviewedAt: Date | string | null;
  reviewer: { id: string; name: string; username: string } | null;
  reviewNote: string | null;
  rejectReason: string | null;
  returnTrackingNumber: string | null;
  returnCarrier: string | null;
  trackingFilledAt: Date | string | null;
  receivedAt: Date | string | null;
  receivedRemark: string | null;
  refundRequestId: string | null;
  shippingTaskId: string;
};

export type ShippingReturnPanelProps = Readonly<{
  tradeOrderId: string;
  customerId: string;
  // 唯一可发起退货申请的发货任务 (必须已发货). 没有就不渲染 a) 模式.
  primaryShippingTaskId: string | null;
  activeShippingReturn: ShippingReturnPanelData | null;
  canRequest: boolean;
  canReview: boolean;
  currentUserId: string;
  requestAction: (formData: FormData) => Promise<ShippingReturnActionResult>;
  reviewAction: (formData: FormData) => Promise<ShippingReturnActionResult>;
  cancelAction: (formData: FormData) => Promise<ShippingReturnActionResult>;
}>;

const REASON_LABEL: Record<ShippingReturnPanelData["reason"], string> = {
  CUSTOMER_REJECT: "客户拒收",
  QUALITY_ISSUE: "质量问题",
  WRONG_ITEM: "发错货",
  DELIVERY_TIMEOUT: "物流超时",
  ADDRESS_PROBLEM: "地址错误",
  OTHER: "其他",
};

const STATUS_META: Record<
  ShippingReturnPanelData["status"],
  { label: string; tone: "amber" | "info" | "success" | "neutral" | "danger" }
> = {
  PENDING_REVIEW: { label: "待主管复审", tone: "amber" },
  PENDING_RETURN_TRACKING: { label: "待填运单", tone: "amber" },
  IN_RETURN_TRANSIT: { label: "回程在途", tone: "info" },
  RETURNED_TO_WAREHOUSE: { label: "已入库", tone: "success" },
  REJECTED: { label: "已驳回", tone: "neutral" },
  CANCELED: { label: "已撤回", tone: "neutral" },
};

const REASON_OPTIONS: Array<{
  value: ShippingReturnPanelData["reason"];
  label: string;
}> = [
  { value: "CUSTOMER_REJECT", label: "客户拒收" },
  { value: "QUALITY_ISSUE", label: "质量问题" },
  { value: "WRONG_ITEM", label: "发错货" },
  { value: "DELIVERY_TIMEOUT", label: "物流超时" },
  { value: "ADDRESS_PROBLEM", label: "地址错误" },
  { value: "OTHER", label: "其他" },
];

function formatTime(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function ShippingReturnPanel({
  tradeOrderId,
  customerId,
  primaryShippingTaskId,
  activeShippingReturn,
  canRequest,
  canReview,
  currentUserId,
  requestAction,
  reviewAction,
  cancelAction,
}: ShippingReturnPanelProps) {
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [reason, setReason] =
    useState<ShippingReturnPanelData["reason"]>("CUSTOMER_REJECT");
  const [reasonDetail, setReasonDetail] = useState("");
  const [expectedRefundAmount, setExpectedRefundAmount] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [notice, setNotice] = useState<
    { status: "success" | "error"; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const isOwnRequest =
    activeShippingReturn?.requester?.id === currentUserId && currentUserId !== "";

  // === Mode a) 无 activeShippingReturn + 已发货 + canRequest: 申请按钮 ===
  if (!activeShippingReturn && primaryShippingTaskId && canRequest) {
    return (
      <>
        <div className="rounded-xl border border-border/60 bg-card p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                客户要求退货?
              </p>
              <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                订单已发货, 撤单已不适用. 申请退货由主管复审通过后,
                由发货人对接物流回收, 入库后系统会自动建退款工单.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setReason("CUSTOMER_REJECT");
                setReasonDetail("");
                setExpectedRefundAmount("");
                setNotice(null);
                setRequestDialogOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-amber-500/35 bg-amber-500/10 px-3.5 text-[12.5px] font-medium text-amber-700 transition hover:border-amber-500/50 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
            >
              <PackageX className="h-3.5 w-3.5" aria-hidden="true" />
              申请退货
            </button>
          </div>
          {notice ? (
            <NoticeRow notice={notice} onDismiss={() => setNotice(null)} />
          ) : null}
        </div>

        {requestDialogOpen ? (
          <RequestDialog
            reason={reason}
            onReasonChange={setReason}
            reasonDetail={reasonDetail}
            onReasonDetailChange={setReasonDetail}
            expectedRefundAmount={expectedRefundAmount}
            onExpectedRefundAmountChange={setExpectedRefundAmount}
            pending={pending}
            onClose={() => setRequestDialogOpen(false)}
            onSubmit={() => {
              const fd = new FormData();
              fd.set("tradeOrderId", tradeOrderId);
              fd.set("shippingTaskId", primaryShippingTaskId);
              fd.set("customerId", customerId);
              fd.set("reason", reason);
              fd.set("reasonDetail", reasonDetail.trim());
              if (expectedRefundAmount.trim()) {
                fd.set("expectedRefundAmount", expectedRefundAmount.trim());
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

  // === activeShippingReturn 存在 ===
  if (activeShippingReturn) {
    const statusMeta = STATUS_META[activeShippingReturn.status];
    const isPendingReview =
      activeShippingReturn.status === "PENDING_REVIEW";
    const isInProgress =
      activeShippingReturn.status === "PENDING_RETURN_TRACKING" ||
      activeShippingReturn.status === "IN_RETURN_TRANSIT" ||
      activeShippingReturn.status === "RETURNED_TO_WAREHOUSE";

    // Terminal 状态 (REJECTED / CANCELED): 不主动展示 (列表里看)
    if (!isPendingReview && !isInProgress) {
      return null;
    }

    return (
      <div
        className={cn(
          "rounded-xl border p-3.5",
          isPendingReview
            ? "border-amber-500/30 bg-amber-500/8"
            : "border-border/60 bg-card",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <PackageX
                className={cn(
                  "h-4 w-4",
                  isPendingReview
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-foreground">
                退货申请 · {statusMeta.label}
              </span>
              <StatusPill tone={statusMeta.tone} label={REASON_LABEL[activeShippingReturn.reason]} />
            </div>
            <p className="mt-2 text-[12.5px] leading-5 text-foreground/85">
              <span className="font-medium text-muted-foreground">原因详情:</span>{" "}
              {activeShippingReturn.reasonDetail}
            </p>
            <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground">
              发起人: {activeShippingReturn.requester?.name ?? "—"} ·{" "}
              {formatTime(activeShippingReturn.requestedAt)}
              {activeShippingReturn.expectedRefundAmount ? (
                <>
                  {" · 期望退款 "}
                  <span className="font-medium text-foreground">
                    ¥{activeShippingReturn.expectedRefundAmount}
                  </span>
                </>
              ) : null}
            </p>
          </div>
          {/* 撤回按钮: 仅 PENDING_REVIEW + 本人 */}
          {isPendingReview && isOwnRequest ? (
            <button
              type="button"
              onClick={() => {
                const fd = new FormData();
                fd.set("shippingReturnId", activeShippingReturn.id);
                fd.set("tradeOrderId", tradeOrderId);
                fd.set("customerId", customerId);
                startTransition(async () => {
                  const result = await cancelAction(fd);
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

        {/* 复审 UI: 仅 PENDING_REVIEW + 主管 + 非本人 */}
        {isPendingReview && canReview && !isOwnRequest ? (
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
            <label className="block">
              <span className="text-[11px] font-semibold text-muted-foreground">
                驳回原因 (仅驳回时必填)
              </span>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="crm-textarea mt-1 min-h-[3rem] text-[12.5px]"
                placeholder="例如: 客户已签收使用, 暂不支持退货"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <ReviewButton
                decision="APPROVED"
                label="通过退货"
                icon={CheckCircle2}
                tone="success"
                pending={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("shippingReturnId", activeShippingReturn.id);
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
                label="驳回退货"
                icon={X}
                tone="danger"
                pending={pending || rejectReason.trim().length < 2}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("shippingReturnId", activeShippingReturn.id);
                  fd.set("decision", "REJECTED");
                  fd.set("reviewNote", reviewNote.trim());
                  fd.set("rejectReason", rejectReason.trim());
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

        {/* 进度时间线: 进行中状态 */}
        {isInProgress ? (
          <ProgressTimeline activeShippingReturn={activeShippingReturn} />
        ) : null}

        {notice ? (
          <NoticeRow notice={notice} onDismiss={() => setNotice(null)} />
        ) : null}
      </div>
    );
  }

  return null;
}

function StatusPill({
  tone,
  label,
}: Readonly<{
  tone: "amber" | "info" | "success" | "neutral" | "danger";
  label: string;
}>) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[10.5px] font-medium",
        tone === "amber" &&
          "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tone === "info" && "border-primary/30 bg-primary/8 text-primary",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
        tone === "neutral" && "border-border/60 bg-muted text-muted-foreground",
        tone === "danger" &&
          "border-destructive/30 bg-destructive/8 text-destructive",
      )}
    >
      {label}
    </span>
  );
}

function ProgressTimeline({
  activeShippingReturn,
}: Readonly<{ activeShippingReturn: ShippingReturnPanelData }>) {
  const steps: Array<{
    key: string;
    label: string;
    detail: string | null;
    done: boolean;
    icon: typeof CheckCircle2;
  }> = [
    {
      key: "approved",
      label: "主管已批准",
      detail: activeShippingReturn.reviewedAt
        ? `${activeShippingReturn.reviewer?.name ?? "—"} · ${formatTime(activeShippingReturn.reviewedAt)}`
        : null,
      done: Boolean(activeShippingReturn.reviewedAt),
      icon: CheckCircle2,
    },
    {
      key: "tracking",
      label: "发货人已对接物流",
      detail: activeShippingReturn.returnTrackingNumber
        ? `${activeShippingReturn.returnCarrier ?? "承运商待补充"} · 运单 ${activeShippingReturn.returnTrackingNumber}${
            activeShippingReturn.trackingFilledAt
              ? ` · ${formatTime(activeShippingReturn.trackingFilledAt)}`
              : ""
          }`
        : "等发货人对接物流并填写退货运单号",
      done: Boolean(activeShippingReturn.returnTrackingNumber),
      icon: Truck,
    },
    {
      key: "received",
      label: "供应商已入库",
      detail: activeShippingReturn.receivedAt
        ? `${formatTime(activeShippingReturn.receivedAt)}${
            activeShippingReturn.receivedRemark
              ? ` · ${activeShippingReturn.receivedRemark}`
              : ""
          }`
        : "回程在途中, 等供应商签收入库",
      done: Boolean(activeShippingReturn.receivedAt),
      icon: CheckCircle2,
    },
  ];

  return (
    <ol className="mt-3 space-y-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
      {steps.map((step) => {
        const Icon = step.icon;
        return (
          <li
            key={step.key}
            className="flex items-start gap-2 text-[12px] leading-5"
          >
            <Icon
              className={cn(
                "mt-0.5 h-3.5 w-3.5 shrink-0",
                step.done
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground/60",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "font-medium",
                  step.done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </p>
              {step.detail ? (
                <p className="text-[11px] text-muted-foreground">
                  {step.detail}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
      {activeShippingReturn.status === "RETURNED_TO_WAREHOUSE" &&
      activeShippingReturn.refundRequestId ? (
        <li className="mt-1 border-t border-border/40 pt-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
          已自动创建退款工单 (单号 …{activeShippingReturn.refundRequestId.slice(-6)}),
          等财务批准.
        </li>
      ) : null}
    </ol>
  );
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
      <span className="flex items-start gap-1.5">
        {notice.status === "success" ? (
          <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        ) : (
          <AlertTriangle
            className="mt-0.5 h-3 w-3 shrink-0"
            aria-hidden="true"
          />
        )}
        {notice.message}
      </span>
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
  reason,
  onReasonChange,
  reasonDetail,
  onReasonDetailChange,
  expectedRefundAmount,
  onExpectedRefundAmountChange,
  pending,
  onClose,
  onSubmit,
}: Readonly<{
  reason: ShippingReturnPanelData["reason"];
  onReasonChange: (value: ShippingReturnPanelData["reason"]) => void;
  reasonDetail: string;
  onReasonDetailChange: (value: string) => void;
  expectedRefundAmount: string;
  onExpectedRefundAmountChange: (value: string) => void;
  pending: boolean;
  onClose: () => void;
  onSubmit: () => void;
}>) {
  const canSubmit = reasonDetail.trim().length >= 4;

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
              发起退货申请
            </h3>
            <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
              主管复审通过后, 由发货人对接物流回收, 入库后系统自动建退款工单.
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

        {/* 原因 select */}
        <label className="mt-4 block">
          <span className="text-[11px] font-semibold text-muted-foreground">
            退货原因 (必选)
          </span>
          <select
            value={reason}
            onChange={(e) =>
              onReasonChange(e.target.value as ShippingReturnPanelData["reason"])
            }
            className="crm-input mt-1 h-9 w-full text-[13px]"
          >
            {REASON_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {/* 原因详情 */}
        <label className="mt-3 block">
          <span className="text-[11px] font-semibold text-muted-foreground">
            原因详情 (必填, 至少 4 个字)
          </span>
          <textarea
            rows={3}
            value={reasonDetail}
            onChange={(e) => onReasonDetailChange(e.target.value)}
            className="crm-textarea mt-1 min-h-[4.5rem] text-[13px]"
            placeholder="例如: 客户收到货发现外箱损毁, 已拒收快递"
            autoFocus
          />
        </label>

        {/* 期望退款金额 */}
        <label className="mt-3 block">
          <span className="text-[11px] font-semibold text-muted-foreground">
            期望退款金额 (可选, 不填则按订单成交金额兜底)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={expectedRefundAmount}
            onChange={(e) => onExpectedRefundAmountChange(e.target.value)}
            className="crm-input mt-1 h-9 w-full text-[13px] tabular-nums"
            placeholder="例如: 1280.00"
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
              <PackageX className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            提交申请
          </button>
        </div>
      </div>
    </div>
  );
}
