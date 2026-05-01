"use client";

import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  PackageCheck,
  ReceiptText,
  Truck,
} from "lucide-react";
import type { TradeOrderDraftComputation } from "@/lib/trade-orders/workflow";
import { cn } from "@/lib/utils";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function ExecutionMetric({
  label,
  value,
  note,
}: Readonly<{
  label: string;
  value: string;
  note: string;
}>) {
  return (
    <div className="rounded-2xl border border-border/55 bg-white/72 px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{note}</p>
    </div>
  );
}

export function TradeOrderSplitPreview({
  computation,
}: Readonly<{
  computation: TradeOrderDraftComputation;
}>) {
  const ready = computation.items.length > 0 && computation.issues.length === 0;

  return (
    <section className="overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/50 bg-muted/20 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
              ready
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            )}
          >
            {ready ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <p className="crm-eyebrow">Execution Preview</p>
            <h2 className="mt-1 text-[0.98rem] font-semibold leading-5 text-foreground">
              {ready ? "执行拆分已就绪" : "执行拆分等待明细补齐"}
            </h2>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              成交层保持独立商品行；提交审核后，仅按 supplier 生成执行子单。
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
            成交行 {computation.items.length}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <Truck className="h-3.5 w-3.5" aria-hidden="true" />
            supplier {computation.groups.length}
          </span>
        </div>
      </div>

      <div className="space-y-4 p-3.5 md:p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <ExecutionMetric
            label="成交金额"
            value={formatCurrency(computation.totals.finalAmount)}
            note={`待收 ${formatCurrency(computation.totals.remainingAmount)}`}
          />
          <ExecutionMetric
            label="商品件数"
            value={String(computation.totals.qtyTotal)}
            note={`${computation.totals.skuLineCount} 条成交商品行`}
          />
          <ExecutionMetric
            label="执行子单"
            value={String(computation.groups.length)}
            note="按 supplier 自动拆分"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <div className="min-w-0 rounded-2xl border border-border/55 bg-white/68">
            <div className="flex items-center justify-between gap-3 border-b border-border/45 px-3.5 py-2.5">
              <div>
                <p className="crm-eyebrow">Trade Lines</p>
                <h3 className="mt-1 text-sm font-semibold text-foreground">
                  成交层商品行
                </h3>
              </div>
              <PackageCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>

            {computation.items.length > 0 ? (
              <div className="divide-y divide-border/45">
                {computation.items.map((item) => (
                  <div key={item.lineId} className="px-3.5 py-3">
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg border border-border/60 bg-card px-2 text-[11px] font-semibold tabular-nums text-foreground">
                            {item.lineNo}
                          </span>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {item.supplierNames.join(" / ")}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-foreground">
                          {item.title}
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                          数量 {item.qty} / 成交单价 {formatCurrency(item.dealUnitPrice)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(item.finalAmount)}
                        </p>
                        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                          优惠 {formatCurrency(item.discountAmount)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3.5 py-4 text-[13px] leading-6 text-muted-foreground">
                添加有效 SKU 后，这里会显示成交层商品行。
              </div>
            )}
          </div>

          <div className="min-w-0 rounded-2xl border border-border/55 bg-white/68">
            <div className="flex items-center justify-between gap-3 border-b border-border/45 px-3.5 py-2.5">
              <div>
                <p className="crm-eyebrow">Supplier Execution</p>
                <h3 className="mt-1 text-sm font-semibold text-foreground">
                  supplier 执行分组
                </h3>
              </div>
              <GitBranch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>

            {computation.groups.length > 0 ? (
              <div className="divide-y divide-border/45">
                {computation.groups.map((group, index) => (
                  <div key={group.supplierId} className="px-3.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg border border-border/60 bg-card px-2 text-[11px] font-semibold tabular-nums text-foreground">
                            S{index + 1}
                          </span>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {group.supplierName}
                          </p>
                        </div>
                        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                          成交行 {group.lineCount} / 执行组件 {group.componentCount} / 件数{" "}
                          {group.qtyTotal}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {formatCurrency(group.finalAmount)}
                        </p>
                        <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                          COD {formatCurrency(group.codAmount)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3.5 py-4 text-[13px] leading-6 text-muted-foreground">
                明细完整后，这里会显示审核提交后的 supplier 执行子单。
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
