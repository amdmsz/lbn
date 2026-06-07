"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PackageCheck,
  Truck,
  X,
} from "lucide-react";

import type {
  ShippingReturnActionResult,
} from "@/app/(dashboard)/shipping/returns/actions";
import { cn } from "@/lib/utils";

// Phase C — 发货人退货物流跟踪台
// 与 components/refunds/refund-review-panel.tsx 风格保持一致.
// status 状态机详见 prisma/schema.prisma ShippingReturnStatus.

export type ShippingReturnRow = {
  id: string;
  tradeOrderId: string;
  tradeNo: string;
  shippingTaskId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  productSummary: string;
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
  requesterName: string;
  requestedAt: Date | string;
  // 退货物流字段 (仅 IN_RETURN_TRANSIT / RETURNED_TO_WAREHOUSE 才有)
  returnTrackingNumber: string | null;
  returnCarrier: string | null;
  trackingFilledAt: Date | string | null;
  // 入库字段 (仅 RETURNED_TO_WAREHOUSE 才有)
  receivedAt: Date | string | null;
  receivedRemark: string | null;
  // 关联 RefundRequest (RETURNED_TO_WAREHOUSE 后自动建)
  refundRequestId: string | null;
  expectedRefundAmount: string;
};

export type ShippingReturnListPanelProps = Readonly<{
  rows: ShippingReturnRow[];
  canFillTracking: boolean;
  canConfirmReceived: boolean;
  fillTrackingAction: (formData: FormData) => Promise<ShippingReturnActionResult>;
  confirmReceivedAction: (formData: FormData) => Promise<ShippingReturnActionResult>;
}>;

const REASON_LABEL: Record<ShippingReturnRow["reason"], string> = {
  CUSTOMER_REJECT: "客户拒收",
  QUALITY_ISSUE: "质量问题",
  WRONG_ITEM: "发错货",
  DELIVERY_TIMEOUT: "物流超时",
  ADDRESS_PROBLEM: "地址错误",
  OTHER: "其他",
};

const STATUS_META: Record<
  ShippingReturnRow["status"],
  { label: string; tone: "amber" | "info" | "success" | "neutral" | "danger" }
> = {
  PENDING_REVIEW: { label: "待主管复审", tone: "amber" },
  PENDING_RETURN_TRACKING: { label: "待填运单", tone: "amber" },
  IN_RETURN_TRANSIT: { label: "回程在途", tone: "info" },
  RETURNED_TO_WAREHOUSE: { label: "已入库", tone: "success" },
  REJECTED: { label: "已驳回", tone: "neutral" },
  CANCELED: { label: "已撤回", tone: "neutral" },
};

function formatTime(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function ShippingReturnListPanel({
  rows,
  canFillTracking,
  canConfirmReceived,
  fillTrackingAction,
  confirmReceivedAction,
}: ShippingReturnListPanelProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-8 text-center">
        <PackageCheck className="mx-auto h-8 w-8 text-emerald-600/70" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">
          当前没有待处理的退货任务
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          主管批准退货申请后, 发货人会在这里收到待对接物流的工单.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <ShippingReturnCard
          key={row.id}
          row={row}
          canFillTracking={canFillTracking}
          canConfirmReceived={canConfirmReceived}
          fillTrackingAction={fillTrackingAction}
          confirmReceivedAction={confirmReceivedAction}
        />
      ))}
    </div>
  );
}

function ShippingReturnCard({
  row,
  canFillTracking,
  canConfirmReceived,
  fillTrackingAction,
  confirmReceivedAction,
}: Readonly<
  Omit<ShippingReturnListPanelProps, "rows"> & { row: ShippingReturnRow }
>) {
  const [trackingNumber, setTrackingNumber] = useState(
    row.returnTrackingNumber ?? "",
  );
  const [carrier, setCarrier] = useState(row.returnCarrier ?? "");
  const [photoUrl, setPhotoUrl] = useState("");
  const [remark, setRemark] = useState("");
  const [notice, setNotice] = useState<
    { status: "success" | "error"; message: string } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const statusMeta = STATUS_META[row.status];
  const isPendingTracking = row.status === "PENDING_RETURN_TRACKING";
  const isInTransit = row.status === "IN_RETURN_TRANSIT";
  const isReturned = row.status === "RETURNED_TO_WAREHOUSE";

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
                statusMeta.tone === "danger" &&
                  "border-destructive/30 bg-destructive/8 text-destructive",
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
            <span className="truncate" title={row.productSummary}>
              {row.productSummary || "—"}
            </span>
            <span>· {REASON_LABEL[row.reason]}</span>
            <span>
              · 期望退款{" "}
              <span className="font-medium text-foreground">
                ¥{row.expectedRefundAmount}
              </span>
            </span>
            <span>· 申请人 {row.requesterName}</span>
            <span>· {formatTime(row.requestedAt)}</span>
          </div>
          {row.reasonDetail ? (
            <p className="mt-2 text-[12.5px] leading-5 text-foreground/85">
              {row.reasonDetail}
            </p>
          ) : null}
          {row.returnTrackingNumber ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-[12px] text-muted-foreground">
              <span>
                运单 <span className="font-medium text-foreground">{row.returnTrackingNumber}</span>
              </span>
              {row.returnCarrier ? <span>· {row.returnCarrier}</span> : null}
              {row.trackingFilledAt ? (
                <span>· 填写于 {formatTime(row.trackingFilledAt)}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* 待填运单 — 发货人对接物流 */}
      {isPendingTracking && canFillTracking ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 md:grid-cols-[1fr_12rem_auto]">
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="退货运单号 (必填)"
            className="crm-input h-9 text-[12.5px]"
          />
          <input
            type="text"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            placeholder="承运商, 例如: 顺丰 / 京东"
            className="crm-input h-9 text-[12.5px]"
            list={`carrier-suggestions-${row.id}`}
          />
          <datalist id={`carrier-suggestions-${row.id}`}>
            <option value="顺丰" />
            <option value="京东" />
            <option value="圆通" />
            <option value="韵达" />
            <option value="中通" />
            <option value="申通" />
          </datalist>
          <button
            type="button"
            disabled={pending || trackingNumber.trim().length < 4}
            onClick={() => {
              const fd = new FormData();
              fd.set("shippingReturnId", row.id);
              fd.set("returnTrackingNumber", trackingNumber.trim());
              fd.set("returnCarrier", carrier.trim());
              startTransition(async () => {
                const result = await fillTrackingAction(fd);
                setNotice(result);
              });
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-primary/35 bg-primary/10 px-3 text-[12.5px] font-medium text-primary transition hover:bg-primary/15 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Truck className="h-3.5 w-3.5" />
            )}
            填写运单号
          </button>
          <p className="md:col-span-3 text-[11px] text-muted-foreground">
            填写后状态变为 回程在途, 等供应商签收后再回来确认入库.
          </p>
        </div>
      ) : null}

      {/* 回程在途 — 发货人确认入库 */}
      {isInTransit && canConfirmReceived ? (
        <div className="mt-3 grid gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="入库照片 URL (可选, 留存依据)"
              className="crm-input h-9 text-[12.5px]"
            />
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("shippingReturnId", row.id);
                fd.set("receivedPhotoUrl", photoUrl.trim());
                fd.set("receivedRemark", remark.trim());
                startTransition(async () => {
                  const result = await confirmReceivedAction(fd);
                  setNotice(result);
                });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 text-[12.5px] font-medium text-emerald-700 transition hover:border-emerald-500/50 disabled:opacity-50 dark:text-emerald-300"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PackageCheck className="h-3.5 w-3.5" />
              )}
              确认入库
            </button>
          </div>
          <textarea
            rows={2}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="入库备注 (可选, 例如: 外箱完好, 内件待复检)"
            className="crm-textarea min-h-[3rem] text-[12.5px]"
          />
          <p className="text-[11px] text-muted-foreground">
            确认入库后系统会自动建退款申请 ¥{row.expectedRefundAmount} 推到财务工作台.
          </p>
        </div>
      ) : null}

      {/* 已入库 — 仅展示结果 + 跳财务 */}
      {isReturned ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-300">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              入库于 {formatTime(row.receivedAt)}
            </span>
            {row.receivedRemark ? <span>· {row.receivedRemark}</span> : null}
          </div>
          <Link
            href={
              row.refundRequestId
                ? `/finance/refunds?focus=${row.refundRequestId}`
                : "/finance/refunds"
            }
            className="inline-flex h-7 items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-[11.5px] font-medium transition hover:border-emerald-500/50"
          >
            <ExternalLink className="h-3 w-3" />
            查看退款工单
          </Link>
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
