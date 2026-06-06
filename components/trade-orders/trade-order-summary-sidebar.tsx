"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Gift,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TradeOrderDraftComputation } from "@/lib/trade-orders/workflow";

type PaymentSchemeOption = {
  value:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  label: string;
  description: string;
};

type SidebarTone = "default" | "info" | "success" | "warning" | "danger";

const sidebarToneClassName: Record<SidebarTone, string> = {
  default: "border-border/60 bg-card text-muted-foreground",
  info: "border-primary/15 bg-primary/5 text-primary",
  success:
    "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/18 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/15 bg-destructive/8 text-destructive",
};

export type SummarySidebarProps = Readonly<{
  computation: TradeOrderDraftComputation;
  selectedPaymentScheme: PaymentSchemeOption | undefined;
  submitReady: boolean;
  issueMessages: string[];
  saveDraftAction: (formData: FormData) => Promise<void>;
  submitForReviewAction: (formData: FormData) => Promise<void>;
  isSubmitting?: boolean;
}>;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function SidebarStatusPill({
  label,
  tone = "default",
  icon: Icon,
}: Readonly<{
  label: string;
  tone?: SidebarTone;
  icon?: LucideIcon;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        sidebarToneClassName[tone],
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

function SidebarSummaryRow({
  label,
  value,
  strong = false,
}: Readonly<{
  label: string;
  value: string;
  strong?: boolean;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px] text-muted-foreground">
      <span>{label}</span>
      <span
        className={cn(
          "font-medium tabular-nums text-foreground",
          strong ? "text-[1rem] font-semibold" : "",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SidebarStatRow({
  icon: Icon,
  label,
  value,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: string | number;
}>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function TradeOrderSummarySidebar({
  computation,
  selectedPaymentScheme,
  submitReady,
  issueMessages,
  saveDraftAction,
  submitForReviewAction,
  isSubmitting = false,
}: SummarySidebarProps) {
  const { totals } = computation;
  const skuLineCount = totals.skuLineCount;
  const giftLineCount = totals.giftLineCount;
  const finalAmountText = formatCurrency(totals.finalAmount);

  return (
    <>
      <aside className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start xl:w-[22rem]">
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
            <p className="crm-eyebrow">Settlement</p>
            <h2 className="mt-1 text-[0.98rem] font-semibold text-foreground">
              收款与金额摘要
            </h2>
          </div>
          <div className="space-y-4 p-4">
            <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/75">
                Final Amount
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-foreground">
                {finalAmountText}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                {selectedPaymentScheme?.label ?? "未选择支付方案"} / 商品{" "}
                {skuLineCount} / 赠品 {giftLineCount}
              </p>
            </div>

            <div className="space-y-2.5">
              <SidebarSummaryRow
                label="列表金额"
                value={formatCurrency(totals.listAmount)}
              />
              <SidebarSummaryRow
                label="成交金额"
                value={formatCurrency(totals.finalAmount)}
                strong
              />
              <SidebarSummaryRow
                label="优惠金额"
                value={formatCurrency(totals.discountAmount)}
              />
              <SidebarSummaryRow
                label="赠品行"
                value={`${giftLineCount} 行`}
              />
              <SidebarSummaryRow
                label="定金"
                value={formatCurrency(totals.depositAmount)}
              />
              <SidebarSummaryRow
                label="待收金额"
                value={formatCurrency(totals.remainingAmount)}
                strong
              />
              <SidebarSummaryRow
                label="COD 到付"
                value={formatCurrency(totals.codAmount)}
              />
              <SidebarSummaryRow
                label="保价金额"
                value={formatCurrency(totals.insuranceAmount)}
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
            <p className="crm-eyebrow">Readiness</p>
            <h2 className="mt-1 text-[0.98rem] font-semibold text-foreground">
              提交前检查
            </h2>
          </div>
          <div className="space-y-3 p-4">
            {submitReady ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-[13px] leading-5 text-emerald-700 dark:text-emerald-300">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  可以提交审核
                </div>
                <p className="mt-1 text-[12px] leading-5 opacity-85">
                  明细、支付与履约快照已经满足成交主单提交条件。
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {issueMessages.map((message) => (
                  <div
                    key={message}
                    className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-800 dark:text-amber-300"
                  >
                    <div className="flex gap-2">
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <span>{message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-2 text-[12px] leading-5 text-muted-foreground">
              <SidebarStatRow
                icon={ClipboardCheck}
                label="成交层商品行"
                value={computation.items.length}
              />
              <SidebarStatRow
                icon={Gift}
                label="赠品行"
                value={giftLineCount}
              />
              <SidebarStatRow
                icon={Truck}
                label="supplier 执行分组"
                value={computation.groups.length}
              />
              <SidebarStatRow
                icon={CircleDollarSign}
                label="待收金额"
                value={formatCurrency(totals.remainingAmount)}
              />
            </div>
          </div>
        </section>
      </aside>

      <div className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-border/70 bg-background/88 p-3 shadow-[var(--color-shell-shadow-md)] backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <SidebarStatusPill
                label={submitReady ? "审核材料已就绪" : "仍有检查项未完成"}
                tone={submitReady ? "success" : "warning"}
                icon={submitReady ? CheckCircle2 : AlertTriangle}
              />
              <SidebarStatusPill
                label={`成交 ${finalAmountText}`}
                icon={CircleDollarSign}
              />
            </div>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              保存草稿不会生成执行子单；提交审核后才会按 supplier 拆分并进入审批。
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="submit"
              formAction={saveDraftAction}
              className="crm-button crm-button-secondary h-10 px-4"
              disabled={isSubmitting}
            >
              保存草稿
            </button>
            <button
              type="submit"
              formAction={submitForReviewAction}
              className="crm-button crm-button-primary h-10 px-4"
              disabled={!submitReady || isSubmitting}
            >
              提交审核
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
