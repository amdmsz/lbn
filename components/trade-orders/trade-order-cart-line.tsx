"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

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
  const [editingSku, setEditingSku] = useState(false);
  const qty = Math.max(0, toNumber(line.qty));
  const dealPrice = toNumber(line.dealPrice);
  const fallbackLineTotal = qty * Math.max(0, dealPrice);
  const lineTotal = resolvedItem?.finalAmount ?? fallbackLineTotal;
  const listAmount = selectedSku ? qty * toNumber(selectedSku.defaultUnitPrice) : 0;
  const discountAmount = Math.max(0, listAmount - fallbackLineTotal);
  const hasDiscount = discountAmount > 0;
  const hasIssues = issueMessages.length > 0;
  const showDiscountField = hasDiscount || hasIssues || Boolean(line.discountReason);

  const handleQtyStep = (delta: number) => {
    const next = Math.max(1, Math.floor(toNumber(line.qty) || 0) + delta);
    onUpdate(line.lineId, { qty: String(next) });
  };

  const handleSkuSelect = (option: SkuOption | null) => {
    if (!option) {
      onUpdate(line.lineId, { skuId: "" });
      setEditingSku(false);
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
    setEditingSku(false);

    if (
      option.insuranceSupported &&
      insuranceRequired &&
      onSeedInsuranceAmount &&
      (!insuranceAmount || toNumber(insuranceAmount) <= 0)
    ) {
      onSeedInsuranceAmount(String(option.defaultInsuranceAmount));
    }
  };

  const indexBadge = (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card text-[11px] font-semibold tabular-nums text-foreground">
      {index + 1}
    </span>
  );

  const removeButton = (
    <button
      type="button"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-transparent text-muted-foreground transition hover:border-destructive/25 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35"
      disabled={!canRemove}
      onClick={() => onRemove(line.lineId)}
      aria-label={`删除第 ${index + 1} 行商品`}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  );

  // 未选 SKU 或正在切换 SKU: 显示搜索器
  if (!selectedSku || editingSku) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border/60 bg-card p-3.5",
          hasIssues && "border-amber-500/30 bg-amber-500/5",
        )}
      >
        <div className="flex items-start gap-3">
          {indexBadge}
          <div className="min-w-0 flex-1">
            <ProductSkuSearchField
              label=""
              placeholder="搜索商品、SKU、规格或供应商"
              value={line.skuId}
              selectedOption={selectedSku}
              onSelect={(option) => handleSkuSelect(option as SkuOption | null)}
              helper={
                <span className="text-[11.5px] leading-5 text-muted-foreground">
                  搜索后选择具体 SKU；多个独立酒请分别添加为多条商品行
                </span>
              }
            />
          </div>
          {removeButton}
        </div>
        {hasIssues ? <IssueList messages={issueMessages} /> : null}
      </div>
    );
  }

  // 已选 SKU: 真正的购物车 row
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card p-3.5 transition hover:border-border",
        hasIssues && "border-amber-500/30 bg-amber-500/5",
      )}
    >
      {/* 上排: 序号 + 商品信息 + 操作 */}
      <div className="flex items-start gap-3">
        {indexBadge}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold text-foreground">
            {selectedSku.product.name} · {selectedSku.skuName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] leading-4 text-muted-foreground">
            <span>供货 {selectedSku.product.supplier.name}</span>
            <span>列表价 ¥{formatAmountForCell(toNumber(selectedSku.defaultUnitPrice))}</span>
            <span>默认 {selectedSku.defaultOrderQuantity} 件</span>
            {selectedSku.codSupported ? (
              <span className="text-emerald-700 dark:text-emerald-300">支持到付</span>
            ) : null}
            {selectedSku.insuranceSupported ? (
              <span className="text-emerald-700 dark:text-emerald-300">支持保价</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditingSku(true)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-border/60 bg-card px-2.5 text-[11.5px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary"
          aria-label="切换 SKU"
        >
          <Pencil className="h-3 w-3" aria-hidden="true" />
          换 SKU
        </button>
        {removeButton}
      </div>

      {/* 中排: 数量步进 + 规格 + 单价 + 行金额, 真正一行 */}
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-border/40 pt-3">
        <div className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            数量
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleQtyStep(-1)}
              disabled={qty <= 1}
              aria-label="减少数量"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <input
              type="number"
              min="1"
              step="1"
              value={line.qty}
              onChange={(event) => onUpdate(line.lineId, { qty: event.target.value })}
              className="crm-input h-8 w-14 text-center tabular-nums"
            />
            <button
              type="button"
              onClick={() => handleQtyStep(1)}
              aria-label="增加数量"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            规格
          </span>
          <input
            type="text"
            value={line.unitSnapshot}
            onChange={(event) => onUpdate(line.lineId, { unitSnapshot: event.target.value })}
            className="crm-input h-8 w-24 text-center text-[12.5px]"
            placeholder="盒/瓶/箱"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            成交单价
          </span>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
              ¥
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={line.dealPrice}
              onChange={(event) => onUpdate(line.lineId, { dealPrice: event.target.value })}
              className="crm-input h-8 w-28 pl-6 text-right tabular-nums"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            行金额
          </span>
          <p className="text-lg font-semibold tabular-nums leading-7 text-foreground">
            ¥{formatAmountForCell(lineTotal)}
          </p>
          {hasDiscount ? (
            <p className="text-[10.5px] tabular-nums leading-3 text-emerald-700 dark:text-emerald-300">
              已优惠 ¥{formatAmountForCell(discountAmount)}
            </p>
          ) : null}
        </div>
      </div>

      {/* 折叠区: 优惠原因 — 只在有 issue/有值/有 discount 时展示 */}
      {showDiscountField ? (
        <div className="mt-3 border-t border-border/40 pt-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-muted-foreground">
              优惠 / 特批原因
            </span>
            <textarea
              rows={2}
              value={line.discountReason}
              onChange={(event) =>
                onUpdate(line.lineId, { discountReason: event.target.value })
              }
              placeholder="成交价低于列表价时填写；无优惠可留空"
              className="crm-textarea mt-1 min-h-[3.25rem] text-[12.5px]"
            />
          </label>
        </div>
      ) : null}

      {hasIssues ? <IssueList messages={issueMessages} /> : null}
    </div>
  );
}

function IssueList({ messages }: Readonly<{ messages: string[] }>) {
  return (
    <div className="mt-3 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11.5px] leading-4 text-amber-800 dark:text-amber-300">
      {messages.map((message) => (
        <div key={message} className="flex items-start gap-1.5">
          <AlertTriangle
            className="mt-0.5 h-3 w-3 shrink-0"
            aria-hidden="true"
          />
          <span>{message}</span>
        </div>
      ))}
    </div>
  );
}
