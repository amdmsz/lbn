/**
 * PaymentSnapshotCard — 订单详情 5 区聚焦后的"付款情况"主区单卡.
 *
 * 设计目标:
 * - 销售关心的只有 3 件事: 总额是多少, 收了多少, 还差多少.
 * - 顶部回款进度条 + 大字金额, 不堆 4 张 metric.
 * - 1-2 条最近收款 / 催收记录直接铺在卡内, 让销售一眼能看到"最新一笔到账".
 * - 详情 (全部收款 / 全部催收) 走"查看全部"链接进入收款工作台, 不在本卡展开长列表.
 */

import Link from "next/link";
import { Coins, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";

export type PaymentSnapshotRecordTone = "success" | "warning" | "info" | "danger" | "neutral";

export type PaymentSnapshotRecord = Readonly<{
  id: string;
  label: string;
  amount?: string | null;
  occurredAt: string;
  tone: PaymentSnapshotRecordTone;
}>;

export type PaymentSnapshotCardProps = Readonly<{
  totalAmount: string;
  collectedAmount: string;
  remainingAmount: string;
  paymentSchemeLabel?: string | null;
  paidPercent: number;
  records: ReadonlyArray<PaymentSnapshotRecord>;
  recordsTotal: number;
  viewAllHref: string;
  collectionsHref?: string | null;
}>;

const toneDot: Record<PaymentSnapshotRecordTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  danger: "bg-rose-500",
  neutral: "bg-muted-foreground/50",
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function PaymentSnapshotCard({
  totalAmount,
  collectedAmount,
  remainingAmount,
  paymentSchemeLabel,
  paidPercent,
  records,
  recordsTotal,
  viewAllHref,
  collectionsHref,
}: PaymentSnapshotCardProps) {
  const percent = clampPercent(paidPercent);
  const isFull = percent >= 100;
  const visible = records.slice(0, 2);
  const hasMore = recordsTotal > visible.length;

  return (
    <section
      aria-label="付款情况"
      className={cn(
        "rounded-xl border border-border/60 bg-card px-4 py-3.5 shadow-sm",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            <Wallet className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-[15px] font-semibold text-foreground">付款情况</h3>
          {paymentSchemeLabel ? (
            <span className="text-xs text-muted-foreground">{paymentSchemeLabel}</span>
          ) : null}
        </div>
        <Link
          href={viewAllHref}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          查看全部
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          {collectedAmount}
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          / {totalAmount}
        </span>
        <span
          className={cn(
            "ml-auto text-xs font-medium",
            isFull ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground",
          )}
        >
          {percent}% 已收 · 待收 <span className="font-mono">{remainingAmount}</span>
        </span>
      </div>

      <div
        className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/40"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            isFull ? "bg-emerald-500" : "bg-primary/80",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {visible.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {visible.map((record) => (
            <li
              key={record.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <span
                aria-hidden="true"
                className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneDot[record.tone])}
              />
              <span className="truncate text-foreground/80">{record.label}</span>
              {record.amount ? (
                <span className="font-mono text-foreground">{record.amount}</span>
              ) : null}
              <span className="ml-auto font-mono text-[11px]">{record.occurredAt}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">暂无收款记录。</p>
      )}

      <div className="mt-3 flex items-center gap-3 text-[11px]">
        {hasMore ? (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <Coins className="h-3 w-3" aria-hidden="true" />
            查看全部 {recordsTotal} 条
          </Link>
        ) : null}
        {collectionsHref ? (
          <Link
            href={collectionsHref}
            className="inline-flex items-center font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            看催收任务
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export default PaymentSnapshotCard;
