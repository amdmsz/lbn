"use client";

import { AlertTriangle, Minus, Plus, Trash2, type LucideIcon } from "lucide-react";

import { ProductSkuSearchField } from "@/components/products/product-sku-search-field";
import type { SerializedVisibleSkuOption } from "@/lib/sales-orders/queries";
import type {
  TradeOrderResolvedItem,
  TradeOrderSkuOption,
} from "@/lib/trade-orders/workflow";
import { cn } from "@/lib/utils";

type DraftLineState = {
  lineId: string;
  skuId: string;
  qty: string;
  dealPrice: string;
  discountReason: string;
  unitSnapshot: string;
};

type SkuOption = SerializedVisibleSkuOption & TradeOrderSkuOption;

type PillTone = "default" | "info" | "success" | "warning" | "danger";

const pillToneClassName: Record<PillTone, string> = {
  default: "border-border/60 bg-card text-muted-foreground",
  info: "border-primary/15 bg-primary/5 text-primary",
  success:
    "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/18 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/15 bg-destructive/8 text-destructive",
};

function StatusPill({
  label,
  tone = "default",
  icon: Icon,
}: Readonly<{
  label: string;
  tone?: PillTone;
  icon?: LucideIcon;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        pillToneClassName[tone],
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

function toNumber(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDefaultOrderQuantity(option: { defaultOrderQuantity?: number }) {
  const quantity = Number(option.defaultOrderQuantity);
  return Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
}

function formatAmountForCell(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

export type CartLineProps = Readonly<{
  index: number;
  line: DraftLineState;
  resolvedItem: TradeOrderResolvedItem | undefined;
  issueMessages: string[];
  skuOptions: SkuOption[];
  canRemove: boolean;
  onUpdate: (lineId: string, patch: Partial<DraftLineState>) => void;
  onRemove: (lineId: string) => void;
  onUpsertOption: (option: SkuOption) => void;
  insuranceRequired?: boolean;
  insuranceAmount?: string;
  onSeedInsuranceAmount?: (amount: string) => void;
}>;

export default function TradeOrderCartLine({
  index,
  line,
  resolvedItem,
  issueMessages,
  skuOptions,
  canRemove,
  onUpdate,
  onRemove,
  onUpsertOption,
  insuranceRequired,
  insuranceAmount,
  onSeedInsuranceAmount,
}: CartLineProps) {
  const selectedSku = skuOptions.find((option) => option.id === line.skuId) ?? null;
  const qty = Math.max(0, toNumber(line.qty));
  const dealPrice = toNumber(line.dealPrice);
  const fallbackLineTotal = qty * Math.max(0, dealPrice);
  const lineTotal = resolvedItem?.finalAmount ?? fallbackLineTotal;
  const listAmount = selectedSku ? qty * toNumber(selectedSku.defaultUnitPrice) : 0;
  const discountAmount = Math.max(0, listAmount - fallbackLineTotal);
  const hasIssues = issueMessages.length > 0;

  const handleQtyStep = (delta: number) => {
    const next = Math.max(1, Math.floor(toNumber(line.qty) || 0) + delta);
    onUpdate(line.lineId, { qty: String(next) });
  };

  const handleSkuSelect = (option: SkuOption | null) => {
    if (!option) {
      onUpdate(line.lineId, { skuId: "" });
      return;
    }

    onUpsertOption(option);
    onUpdate(line.lineId, {
      skuId: option.id,
      qty:
        !line.skuId || toNumber(line.qty) <= 1
          ? String(getDefaultOrderQuantity(option))
          : line.qty,
      dealPrice: line.dealPrice ? line.dealPrice : String(option.defaultUnitPrice),
    });

    if (
      option.insuranceSupported &&
      insuranceRequired &&
      onSeedInsuranceAmount &&
      (!insuranceAmount || toNumber(insuranceAmount) <= 0)
    ) {
      onSeedInsuranceAmount(String(option.defaultInsuranceAmount));
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition hover:ring-1 hover:ring-border/60",
        hasIssues && "border-amber-500/25 bg-amber-500/5 hover:ring-amber-500/30",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex items-center justify-between gap-3 lg:w-12 lg:justify-center lg:pt-6">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card text-[12px] font-semibold tabular-nums text-foreground shadow-sm">
            {index + 1}
          </span>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 text-[12px] font-medium text-muted-foreground transition hover:border-destructive/25 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35 lg:hidden"
            disabled={!canRemove}
            onClick={() => onRemove(line.lineId)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            删除
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <ProductSkuSearchField
            label="选择 SKU"
            placeholder="搜索商品、SKU、规格或供应商"
            value={line.skuId}
            selectedOption={selectedSku}
            onSelect={(option) => handleSkuSelect(option as SkuOption | null)}
            helper={
              <div className="flex flex-wrap items-center gap-2">
                {selectedSku ? (
                  <>
                    <StatusPill label={selectedSku.product.supplier.name} />
                    <StatusPill
                      label={`列表价 ${formatCurrency(toNumber(selectedSku.defaultUnitPrice))}`}
                    />
                    <StatusPill label={`默认 ${selectedSku.defaultOrderQuantity} 件`} />
                    <StatusPill
                      label={selectedSku.codSupported ? "支持到付" : "不可到付"}
                      tone={selectedSku.codSupported ? "success" : "warning"}
                    />
                    <StatusPill
                      label={selectedSku.insuranceSupported ? "支持保价" : "不可保价"}
                      tone={selectedSku.insuranceSupported ? "success" : "warning"}
                    />
                  </>
                ) : (
                  <span className="text-[12px] leading-5 text-muted-foreground">
                    搜索后选择具体 SKU；多个独立酒请分别添加为多条商品行。
                  </span>
                )}
              </div>
            }
          />
        </div>

        <button
          type="button"
          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:border-destructive/25 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35 lg:mt-6 lg:inline-flex"
          disabled={!canRemove}
          onClick={() => onRemove(line.lineId)}
          aria-label={`删除第 ${index + 1} 行商品`}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_8rem_10rem_minmax(0,1fr)]">
        <div className="block">
          <span className="crm-label">数量</span>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleQtyStep(-1)}
              disabled={qty <= 1}
              aria-label="减少数量"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:border-primary/25 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </button>
            <input
              type="number"
              min="1"
              step="1"
              value={line.qty}
              onChange={(event) => onUpdate(line.lineId, { qty: event.target.value })}
              className="crm-input w-16 text-center tabular-nums"
            />
            <button
              type="button"
              onClick={() => handleQtyStep(1)}
              aria-label="增加数量"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:border-primary/25 hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <label className="block">
          <span className="crm-label">数量规格</span>
          <input
            type="text"
            value={line.unitSnapshot}
            onChange={(event) => onUpdate(line.lineId, { unitSnapshot: event.target.value })}
            className="crm-input"
            placeholder="盒 / 瓶 / 箱"
          />
        </label>

        <label className="block">
          <span className="crm-label">成交单价</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
              ¥
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.dealPrice}
              onChange={(event) => onUpdate(line.lineId, { dealPrice: event.target.value })}
              className="crm-input pl-7 text-right tabular-nums"
              placeholder="0.00"
            />
          </div>
        </label>

        <div className="rounded-xl border border-border/55 bg-muted/20 px-3.5 py-2.5 md:text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            行金额
          </p>
          <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
            ¥{formatAmountForCell(lineTotal)}
          </p>
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            列表价 ¥{formatAmountForCell(listAmount)} / 优惠 ¥
            {formatAmountForCell(discountAmount)}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <label className="block">
          <span className="crm-label">优惠 / 特批原因</span>
          <textarea
            rows={2}
            value={line.discountReason}
            onChange={(event) =>
              onUpdate(line.lineId, { discountReason: event.target.value })
            }
            placeholder="成交价低于列表价时填写；无优惠可留空"
            className="crm-textarea min-h-[4.25rem]"
          />
        </label>

        {hasIssues ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-800 dark:text-amber-300">
            {issueMessages.map((message) => (
              <div key={message} className="flex gap-2">
                <AlertTriangle
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{message}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
