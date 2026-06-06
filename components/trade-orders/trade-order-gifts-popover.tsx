"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Gift, Plus, Trash2 } from "lucide-react";

import { ProductSkuSearchField } from "@/components/products/product-sku-search-field";
import type { SerializedVisibleSkuOption } from "@/lib/sales-orders/queries";
import type { TradeOrderSkuOption } from "@/lib/trade-orders/workflow";
import { cn } from "@/lib/utils";

type DraftGiftLineState = {
  lineId: string;
  skuId: string;
  qty: string;
  remark: string;
  unitSnapshot: string;
};

type SkuOption = SerializedVisibleSkuOption & TradeOrderSkuOption;

export type GiftsPopoverProps = Readonly<{
  giftLines: DraftGiftLineState[];
  skuOptions: SkuOption[];
  issueMessagesByLine: Map<string, string[]>;
  canRemove: boolean;
  onAddGiftLine: () => void;
  onUpdateGiftLine: (lineId: string, patch: Partial<DraftGiftLineState>) => void;
  onRemoveGiftLine: (lineId: string) => void;
  onUpsertOption: (option: SkuOption) => void;
}>;

type StatusPillTone = "default" | "success";

const statusPillToneClassName: Record<StatusPillTone, string> = {
  default: "border-border/60 bg-card text-muted-foreground",
  success:
    "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
};

function toNumber(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDefaultOrderQuantity(option: { defaultOrderQuantity?: number }) {
  const quantity = Number(option.defaultOrderQuantity);
  return Number.isInteger(quantity) && quantity >= 1 ? quantity : 1;
}

function StatusPill({
  label,
  tone = "default",
  icon: Icon,
}: Readonly<{
  label: string;
  tone?: StatusPillTone;
  icon?: LucideIcon;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        statusPillToneClassName[tone],
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

function FormSection({
  icon: Icon,
  title,
  actions,
  children,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border/50 bg-card px-4 py-2.5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-semibold leading-5 text-foreground">
              {title}
            </h2>
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2 md:justify-end">{actions}</div> : null}
      </div>
      <div className="p-3.5 md:p-4">{children}</div>
    </section>
  );
}

export default function TradeOrderGiftsPopover({
  giftLines,
  skuOptions,
  issueMessagesByLine,
  canRemove,
  onAddGiftLine,
  onUpdateGiftLine,
  onRemoveGiftLine,
  onUpsertOption,
}: GiftsPopoverProps) {
  const giftCount = giftLines.length;
  const totalUnits = giftLines.reduce((sum, line) => sum + Math.max(toNumber(line.qty), 0), 0);

  return (
    <details className="group overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-border/50 bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Gift className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-[0.95rem] font-semibold leading-5 text-foreground">
              赠品 {giftCount} 行 / {totalUnits} 件
            </h2>
            <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
              赠品只进入 supplier 履约，不计入收款金额
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition group-open:rotate-180">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </summary>

      <div className="space-y-4 p-3.5 md:p-4">
        <FormSection
          icon={Gift}
          title="赠品行"
          actions={
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              onClick={onAddGiftLine}
              aria-label="新增赠品行"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          }
        >
          {giftLines.length > 0 ? (
            <div className="space-y-3">
              {giftLines.map((line, index) => {
                const selectedSku =
                  skuOptions.find((option) => option.id === line.skuId) ?? null;
                const giftIssues = issueMessagesByLine.get(line.lineId) ?? [];

                return (
                  <div
                    key={line.lineId}
                    className={cn(
                      "rounded-xl border border-dashed border-border/60 bg-card p-3.5 shadow-sm",
                      giftIssues.length > 0 && "border-amber-500/25 bg-amber-500/5",
                    )}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                      <div className="flex items-center justify-between gap-3 lg:w-12 lg:justify-center lg:pt-6">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-card text-[12px] font-semibold tabular-nums text-foreground shadow-sm">
                          G{index + 1}
                        </span>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 text-[12px] font-medium text-muted-foreground transition hover:border-destructive/25 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35 lg:hidden"
                          disabled={!canRemove}
                          onClick={() => onRemoveGiftLine(line.lineId)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          删除
                        </button>
                      </div>

                      <div className="min-w-0 flex-1">
                        <ProductSkuSearchField
                          label="赠品 SKU"
                          placeholder="搜索赠品商品、SKU、规格或供应商"
                          value={line.skuId}
                          selectedOption={selectedSku}
                          onSelect={(option) => {
                            if (!option) {
                              onUpdateGiftLine(line.lineId, { skuId: "" });
                              return;
                            }

                            onUpsertOption(option as SkuOption);
                            onUpdateGiftLine(line.lineId, {
                              skuId: option.id,
                              qty:
                                !line.skuId || toNumber(line.qty) <= 1
                                  ? String(getDefaultOrderQuantity(option as SkuOption))
                                  : line.qty,
                            });
                          }}
                          helper={
                            <div className="flex flex-wrap items-center gap-2">
                              {selectedSku ? (
                                <>
                                  <StatusPill label={selectedSku.product.supplier.name} />
                                  <StatusPill label={`${selectedSku.product.name}`} />
                                  <StatusPill
                                    label={`默认 ${selectedSku.defaultOrderQuantity} 件`}
                                  />
                                  <StatusPill label="金额 0" tone="success" />
                                </>
                              ) : (
                                <span className="text-[12px] leading-5 text-muted-foreground">
                                  赠品行只支持标准 SKU。
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
                        onClick={() => onRemoveGiftLine(line.lineId)}
                        aria-label={`删除第 ${index + 1} 行赠品`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-[8rem_7rem_minmax(0,1fr)]">
                      <label className="block">
                        <span className="crm-label">数量</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.qty}
                          onChange={(event) =>
                            onUpdateGiftLine(line.lineId, { qty: event.target.value })
                          }
                          className="crm-input text-right tabular-nums"
                        />
                      </label>

                      <label className="block">
                        <span className="crm-label">数量规格</span>
                        <input
                          type="text"
                          value={line.unitSnapshot}
                          onChange={(event) =>
                            onUpdateGiftLine(line.lineId, { unitSnapshot: event.target.value })
                          }
                          className="crm-input"
                          placeholder="盒 / 瓶 / 箱"
                        />
                      </label>

                      <div className="rounded-lg border border-border/55 bg-[var(--color-shell-surface-soft)] px-3.5 py-2.5 md:text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          行金额
                        </p>
                        <p className="mt-1 text-base font-semibold tabular-nums text-foreground">
                          ¥0.00
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          只进入 supplier 履约，不计入收款金额
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <label className="block">
                        <span className="crm-label">赠品备注</span>
                        <textarea
                          rows={2}
                          value={line.remark}
                          onChange={(event) =>
                            onUpdateGiftLine(line.lineId, { remark: event.target.value })
                          }
                          placeholder="可选，用于补充赠品说明"
                          className="crm-textarea min-h-[4.25rem]"
                        />
                      </label>

                      {giftIssues.length > 0 ? (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-800 dark:text-amber-300">
                          {giftIssues.map((message) => (
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
              })}

              <button
                type="button"
                onClick={onAddGiftLine}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-[var(--color-shell-surface-soft)] text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                添加赠品
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-dashed border-border/70 bg-[var(--color-shell-surface-soft)] px-4 py-4 text-[13px] leading-6 text-muted-foreground">
                如需和成交单一起发货的标准 SKU 赠品，可在这里新增赠品行。
              </div>
              <button
                type="button"
                onClick={onAddGiftLine}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-[var(--color-shell-surface-soft)] text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                添加赠品
              </button>
            </div>
          )}
        </FormSection>
      </div>
    </details>
  );
}
