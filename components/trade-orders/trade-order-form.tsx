"use client";

import { useState } from "react";
import { ProductSkuSearchField } from "@/components/products/product-sku-search-field";
import {
  buildTradeOrderDraftComputation,
  isTradeOrderDraftReadyForSubmit,
  type TradeOrderBundleOption,
  type TradeOrderDraftComputation,
  type TradeOrderSkuOption,
} from "@/lib/trade-orders/workflow";
import type { SerializedVisibleSkuOption } from "@/lib/sales-orders/queries";
import { TradeOrderSplitPreview } from "@/components/trade-orders/trade-order-split-preview";

type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: { id: string; name: string; username: string } | null;
};

type SkuOption = SerializedVisibleSkuOption & TradeOrderSkuOption;
type BundleOption = TradeOrderBundleOption;

type PaymentSchemeOption = {
  value:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  label: string;
  description: string;
};

type DraftLine = {
  id: string;
  skuId: string | null;
  qty: number;
  dealUnitPriceSnapshot: string;
  remark: string | null;
};

type DraftGiftLine = {
  id: string;
  skuId: string | null;
  qty: number;
  remark: string | null;
};

type DraftBundleLine = {
  id: string;
  bundleId: string | null;
  qty: number;
  dealUnitPriceSnapshot: string;
  remark: string | null;
};

type TradeOrderDraft = {
  id: string;
  tradeNo: string;
  paymentScheme:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  depositAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
  receiverNameSnapshot: string;
  receiverPhoneSnapshot: string;
  receiverAddressSnapshot: string;
  remark: string | null;
  rejectReason: string | null;
  items: DraftLine[];
  giftItems: DraftGiftLine[];
  bundleItems: DraftBundleLine[];
};

type DraftLineState = {
  lineId: string;
  skuId: string;
  qty: string;
  dealPrice: string;
  discountReason: string;
};

type DraftGiftLineState = {
  lineId: string;
  skuId: string;
  qty: string;
  remark: string;
};

type DraftBundleLineState = {
  lineId: string;
  bundleId: string;
  qty: string;
  dealPrice: string;
  remark: string;
};

function createLineId(prefix = "line") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toNumber(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
}

function buildInitialLines(draft: TradeOrderDraft | null) {
  if (draft?.items.length) {
    return draft.items.map((item) => ({
      lineId: item.id || createLineId(),
      skuId: item.skuId ?? "",
      qty: String(item.qty),
      dealPrice: item.dealUnitPriceSnapshot,
      discountReason: item.remark ?? "",
    }));
  }

  if (draft?.giftItems.length || draft?.bundleItems.length) {
    return [];
  }

  return [{ lineId: createLineId(), skuId: "", qty: "1", dealPrice: "", discountReason: "" }];
}

function buildInitialGiftLines(draft: TradeOrderDraft | null) {
  return (draft?.giftItems ?? []).map((item) => ({
    lineId: item.id || createLineId("gift"),
    skuId: item.skuId ?? "",
    qty: String(item.qty),
    remark: item.remark ?? "",
  }));
}

function buildInitialBundleLines(draft: TradeOrderDraft | null) {
  return (draft?.bundleItems ?? []).map((item) => ({
    lineId: item.id || createLineId("bundle"),
    bundleId: item.bundleId ?? "",
    qty: String(item.qty),
    dealPrice: item.dealUnitPriceSnapshot,
    remark: item.remark ?? "",
  }));
}

function SummaryItem({
  label,
  value,
}: Readonly<{
  label: string;
  value: string;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-black/66">
      <span>{label}</span>
      <span className="font-medium text-black/82">{value}</span>
    </div>
  );
}

export function TradeOrderForm({
  customer,
  paymentSchemeOptions,
  skuOptions,
  bundleOptions,
  draft,
  saveDraftAction,
  submitForReviewAction,
}: Readonly<{
  customer: CustomerContext;
  paymentSchemeOptions: PaymentSchemeOption[];
  skuOptions: SkuOption[];
  bundleOptions: BundleOption[];
  draft: TradeOrderDraft | null;
  saveDraftAction: (formData: FormData) => Promise<void>;
  submitForReviewAction: (formData: FormData) => Promise<void>;
}>) {
  const [availableSkuOptions, setAvailableSkuOptions] = useState<SkuOption[]>(skuOptions);
  const [lines, setLines] = useState<DraftLineState[]>(() => buildInitialLines(draft));
  const [giftLines, setGiftLines] = useState<DraftGiftLineState[]>(() =>
    buildInitialGiftLines(draft),
  );
  const [bundleLines, setBundleLines] = useState<DraftBundleLineState[]>(() =>
    buildInitialBundleLines(draft),
  );
  const [paymentScheme, setPaymentScheme] = useState<PaymentSchemeOption["value"]>(
    draft?.paymentScheme ?? "FULL_PREPAID",
  );
  const [depositAmount, setDepositAmount] = useState(draft?.depositAmount ?? "0");
  const [receiverName, setReceiverName] = useState(
    draft?.receiverNameSnapshot ?? customer.name,
  );
  const [receiverPhone, setReceiverPhone] = useState(
    draft?.receiverPhoneSnapshot ?? customer.phone,
  );
  const [receiverAddress, setReceiverAddress] = useState(
    draft?.receiverAddressSnapshot ?? customer.address ?? "",
  );
  const [insuranceRequired, setInsuranceRequired] = useState(
    draft?.insuranceRequired ?? false,
  );
  const [insuranceAmount, setInsuranceAmount] = useState(draft?.insuranceAmount ?? "0");
  const [remark, setRemark] = useState(draft?.remark ?? "");

  const effectiveDepositAmount =
    paymentScheme === "DEPOSIT_PLUS_BALANCE" || paymentScheme === "DEPOSIT_PLUS_COD"
      ? depositAmount
      : "0";
  const effectiveInsuranceAmount = insuranceRequired ? insuranceAmount : "0";

  const computation: TradeOrderDraftComputation = buildTradeOrderDraftComputation({
    lines: lines.map((line) => ({
      lineId: line.lineId,
      skuId: line.skuId,
      qty: Math.max(0, toNumber(line.qty)),
      dealPrice: toNumber(line.dealPrice),
      discountReason: line.discountReason,
    })),
    giftLines: giftLines.map((line) => ({
      lineId: line.lineId,
      skuId: line.skuId,
      qty: Math.max(0, toNumber(line.qty)),
      remark: line.remark,
    })),
    bundleLines: bundleLines.map((line) => ({
      lineId: line.lineId,
      bundleId: line.bundleId,
      qty: Math.max(0, toNumber(line.qty)),
      dealPrice: toNumber(line.dealPrice),
      remark: line.remark,
    })),
    skuOptions: availableSkuOptions,
    bundleOptions,
    paymentScheme,
    depositAmount: toNumber(effectiveDepositAmount),
    insuranceRequired,
    insuranceAmount: toNumber(effectiveInsuranceAmount),
  });

  const submitReady = isTradeOrderDraftReadyForSubmit(computation);
  const selectedPaymentScheme =
    paymentSchemeOptions.find((option) => option.value === paymentScheme) ??
    paymentSchemeOptions[0];
  const canRemoveSkuLine = lines.length > 1 || giftLines.length > 0 || bundleLines.length > 0;
  const canRemoveGiftLine =
    giftLines.length > 1 || lines.length > 0 || bundleLines.length > 0;
  const canRemoveBundleLine =
    bundleLines.length > 1 || lines.length > 0 || giftLines.length > 0;

  function upsertSkuOption(option: SkuOption) {
    setAvailableSkuOptions((current) => {
      const existingIndex = current.findIndex((item) => item.id === option.id);
      if (existingIndex >= 0) {
        return current.map((item) => (item.id === option.id ? option : item));
      }

      return [...current, option];
    });
  }

  return (
    <form className="space-y-5">
      <input type="hidden" name="id" value={draft?.id ?? ""} />
      <input type="hidden" name="customerId" value={customer.id} />
      <input
        type="hidden"
        name="linesJson"
        value={JSON.stringify(
          lines.map((line) => ({
            lineId: line.lineId,
            skuId: line.skuId,
            qty: Math.max(0, toNumber(line.qty)),
            dealPrice: toNumber(line.dealPrice),
            discountReason: line.discountReason,
          })),
        )}
      />
      <input
        type="hidden"
        name="giftLinesJson"
        value={JSON.stringify(
          giftLines.map((line) => ({
            lineId: line.lineId,
            skuId: line.skuId,
            qty: Math.max(0, toNumber(line.qty)),
            remark: line.remark,
          })),
        )}
      />
      <input
        type="hidden"
        name="bundleLinesJson"
        value={JSON.stringify(
          bundleLines.map((line) => ({
            lineId: line.lineId,
            bundleId: line.bundleId,
            qty: Math.max(0, toNumber(line.qty)),
            dealPrice: toNumber(line.dealPrice),
            remark: line.remark,
          })),
        )}
      />

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-black/82">成交主单表单</div>
            <p className="text-xs leading-6 text-black/55">
              当前入口统一承接成交主单建单，支持多商品与标准 SKU 赠品，并在提交审核时自动按
              supplier 拆分子单。
            </p>
          </div>
          {draft ? (
            <div className="rounded-full border border-black/8 bg-white/76 px-3 py-1.5 text-xs text-black/60">
              草稿编号：{draft.tradeNo}
            </div>
          ) : null}
        </div>
        {draft?.rejectReason ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            上次驳回原因：{draft.rejectReason}
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-black/8 bg-white/78 px-4 py-3">
            <div className="text-sm font-medium text-black/82">
              {customer.name} / {customer.phone}
            </div>
            <div className="mt-1 text-xs text-black/50">
              负责人：{customer.owner?.name || customer.owner?.username || "未分配"}
            </div>
            <div className="mt-1 text-xs text-black/50">
              地址：{customer.address || "未填写"}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="crm-label">支付方案</span>
              <select
                name="paymentScheme"
                value={paymentScheme}
                onChange={(event) =>
                  setPaymentScheme(event.target.value as PaymentSchemeOption["value"])
                }
                className="crm-select"
              >
                {paymentSchemeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-black/50">{selectedPaymentScheme?.description}</span>
            </label>
            <label className="space-y-2">
              <span className="crm-label">定金金额</span>
              <input
                name="depositAmount"
                type="number"
                min="0"
                step="0.01"
                value={effectiveDepositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                disabled={
                  paymentScheme !== "DEPOSIT_PLUS_BALANCE" &&
                  paymentScheme !== "DEPOSIT_PLUS_COD"
                }
                className="crm-input disabled:cursor-not-allowed disabled:bg-black/5"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="crm-label">收件人</span>
              <input
                name="receiverName"
                value={receiverName}
                onChange={(event) => setReceiverName(event.target.value)}
                className="crm-input"
              />
            </label>
            <label className="space-y-2">
              <span className="crm-label">联系电话</span>
              <input
                name="receiverPhone"
                value={receiverPhone}
                onChange={(event) => setReceiverPhone(event.target.value)}
                className="crm-input"
              />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="crm-label">收件地址</span>
              <textarea
                name="receiverAddress"
                rows={3}
                value={receiverAddress}
                onChange={(event) => setReceiverAddress(event.target.value)}
                className="crm-textarea"
              />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-black/8 bg-white/78 px-4 py-3 text-sm text-black/70">
              <input
                type="checkbox"
                name="insuranceRequired"
                checked={insuranceRequired}
                onChange={(event) => setInsuranceRequired(event.target.checked)}
                className="h-4 w-4 rounded border-black/15 text-black"
              />
              开启保价
            </label>
            <label className="space-y-2">
              <span className="crm-label">保价金额</span>
              <input
                name="insuranceAmount"
                type="number"
                min="0"
                step="0.01"
                value={effectiveInsuranceAmount}
                onChange={(event) => setInsuranceAmount(event.target.value)}
                disabled={!insuranceRequired}
                className="crm-input disabled:cursor-not-allowed disabled:bg-black/5"
              />
            </label>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/78 px-4 py-4">
            <div className="text-sm font-medium text-black/82">金额摘要</div>
            <div className="mt-3 space-y-2">
              <SummaryItem
                label="商品行"
                value={String(computation.totals.skuLineCount + computation.totals.bundleLineCount)}
              />
              <SummaryItem label="赠品行" value={String(computation.totals.giftLineCount)} />
              <SummaryItem label="展开后总件数" value={String(computation.totals.qtyTotal)} />
              <SummaryItem
                label="成交金额"
                value={formatCurrency(computation.totals.finalAmount)}
              />
              <SummaryItem
                label="优惠金额"
                value={formatCurrency(computation.totals.discountAmount)}
              />
              <SummaryItem label="定金" value={formatCurrency(computation.totals.depositAmount)} />
              <SummaryItem label="待收" value={formatCurrency(computation.totals.remainingAmount)} />
              <SummaryItem label="COD" value={formatCurrency(computation.totals.codAmount)} />
            </div>
          </div>
        </div>
        <label className="space-y-2">
          <span className="crm-label">备注</span>
          <textarea
            name="remark"
            rows={3}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="记录本次成交的补充说明"
            className="crm-textarea"
          />
        </label>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-black/82">商品行</div>
            <p className="mt-1 text-xs leading-6 text-black/55">
              每条成交商品都会进入成交主单，并在提交审核时按 supplier 自动拆分为子单执行。
            </p>
          </div>
          <button
            type="button"
            className="crm-button crm-button-secondary"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  lineId: createLineId(),
                  skuId: "",
                  qty: "1",
                  dealPrice: "",
                  discountReason: "",
                },
              ])
            }
          >
            新增商品行
          </button>
        </div>
        <div className="space-y-3">
          {lines.length > 0 ? (
            lines.map((line, index) => {
              const selectedSku =
                availableSkuOptions.find((option) => option.id === line.skuId) ?? null;

              return (
                <div key={line.lineId} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium text-black/82">商品行 {index + 1}</div>
                    <button
                      type="button"
                      className="text-xs font-medium text-black/52 transition hover:text-black/72 disabled:cursor-not-allowed disabled:text-black/28"
                      disabled={!canRemoveSkuLine}
                      onClick={() =>
                        setLines((current) =>
                          canRemoveSkuLine
                            ? current.filter((item) => item.lineId !== line.lineId)
                            : current,
                        )
                      }
                    >
                      删除
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_120px_140px]">
                    <ProductSkuSearchField
                      label="SKU"
                      placeholder="搜索商品名、SKU、规格或供应商"
                      value={line.skuId}
                      selectedOption={selectedSku}
                      onSelect={(option) => {
                        if (!option) {
                          setLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId ? { ...item, skuId: "" } : item,
                            ),
                          );
                          return;
                        }

                        upsertSkuOption(option);
                        setLines((current) =>
                          current.map((item) =>
                            item.lineId === line.lineId
                              ? {
                                  ...item,
                                  skuId: option.id,
                                  dealPrice:
                                    option && !item.dealPrice
                                      ? String(option.defaultUnitPrice)
                                      : item.dealPrice,
                                }
                              : item,
                          ),
                        );

                        if (
                          option.insuranceSupported &&
                          insuranceRequired &&
                          (!insuranceAmount || toNumber(insuranceAmount) <= 0)
                        ) {
                          setInsuranceAmount(String(option.defaultInsuranceAmount));
                        }
                      }}
                      helper={
                        <div className="text-xs text-black/50">
                          {selectedSku
                            ? `${selectedSku.product.name} / ${selectedSku.skuName} / 列表价 ${formatCurrency(
                                toNumber(selectedSku.defaultUnitPrice),
                              )}`
                            : "多个独立酒必须分别选成多条商品行。"}
                        </div>
                      }
                    />
                    <label className="space-y-2">
                      <span className="crm-label">数量</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.qty}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId
                                ? { ...item, qty: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="crm-input"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">成交单价</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.dealPrice}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId
                                ? { ...item, dealPrice: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="crm-input"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block space-y-2">
                    <span className="crm-label">优惠原因</span>
                    <textarea
                      rows={2}
                      value={line.discountReason}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((item) =>
                            item.lineId === line.lineId
                              ? { ...item, discountReason: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="仅当成交价低于列表价时填写"
                      className="crm-textarea"
                    />
                  </label>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-4 text-sm leading-7 text-black/55">
              当前还没有添加付费商品行。你可以继续新增商品行，或只保留下方的赠品行。
            </div>
          )}
        </div>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-black/82">套餐行</div>
            <p className="mt-1 text-xs leading-6 text-black/55">
              只有明确套餐/组合装时才走 bundle 行；多个独立酒不要压成一条套餐。
            </p>
          </div>
          <button
            type="button"
            className="crm-button crm-button-secondary"
            onClick={() =>
              setBundleLines((current) => [
                ...current,
                {
                  lineId: createLineId("bundle"),
                  bundleId: "",
                  qty: "1",
                  dealPrice: "",
                  remark: "",
                },
              ])
            }
          >
            新增套餐行
          </button>
        </div>
        <div className="space-y-3">
          {bundleLines.length > 0 ? (
            bundleLines.map((line, index) => {
              const selectedBundle =
                bundleOptions.find((option) => option.id === line.bundleId) ?? null;
              const supplierCount = selectedBundle
                ? new Set(selectedBundle.items.map((item) => item.supplierId)).size
                : 0;

              return (
                <div
                  key={line.lineId}
                  className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium text-black/82">套餐行 {index + 1}</div>
                    <button
                      type="button"
                      className="text-xs font-medium text-black/52 transition hover:text-black/72 disabled:cursor-not-allowed disabled:text-black/28"
                      disabled={!canRemoveBundleLine}
                      onClick={() =>
                        setBundleLines((current) =>
                          canRemoveBundleLine
                            ? current.filter((item) => item.lineId !== line.lineId)
                            : current,
                        )
                      }
                    >
                      删除
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_120px_140px]">
                    <label className="space-y-2">
                      <span className="crm-label">套餐</span>
                      <select
                        value={line.bundleId}
                        onChange={(event) => {
                          const nextBundleId = event.target.value;
                          const nextBundle =
                            bundleOptions.find((option) => option.id === nextBundleId) ?? null;

                          setBundleLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId
                                ? {
                                    ...item,
                                    bundleId: nextBundleId,
                                    dealPrice:
                                      nextBundle && !item.dealPrice
                                        ? String(nextBundle.defaultBundlePrice)
                                        : item.dealPrice,
                                  }
                                : item,
                            ),
                          );
                        }}
                        className="crm-select"
                      >
                        <option value="">选择套餐</option>
                        {bundleOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} / {option.code}
                          </option>
                        ))}
                      </select>
                      <div className="text-xs text-black/50">
                        {selectedBundle
                          ? `${selectedBundle.items.length} 个组件 / ${supplierCount} 个供应商 / 默认套餐价 ${formatCurrency(
                              toNumber(selectedBundle.defaultBundlePrice),
                            )}`
                          : "只有明确套餐时才选择 bundle。"}
                      </div>
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">数量</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.qty}
                        onChange={(event) =>
                          setBundleLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId
                                ? { ...item, qty: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="crm-input"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="crm-label">成交单价</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.dealPrice}
                        onChange={(event) =>
                          setBundleLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId
                                ? { ...item, dealPrice: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="crm-input"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block space-y-2">
                    <span className="crm-label">套餐备注</span>
                    <textarea
                      rows={2}
                      value={line.remark}
                      onChange={(event) =>
                        setBundleLines((current) =>
                          current.map((item) =>
                            item.lineId === line.lineId
                              ? { ...item, remark: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="用于说明套餐口径、活动说明或组合备注"
                      className="crm-textarea"
                    />
                  </label>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-4 text-sm leading-7 text-black/55">
              当前没有套餐行。没有明确套餐时，保持上方多条独立商品行即可。
            </div>
          )}
        </div>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-black/82">赠品行</div>
            <p className="mt-1 text-xs leading-6 text-black/55">
              赠品必须选择标准 SKU，supplier 和 SKU 信息自动继承。
            </p>
          </div>
          <button
            type="button"
            className="crm-button crm-button-secondary"
            onClick={() =>
              setGiftLines((current) => [
                ...current,
                { lineId: createLineId("gift"), skuId: "", qty: "1", remark: "" },
              ])
            }
          >
            新增赠品行
          </button>
        </div>
        <div className="space-y-3">
          {giftLines.length > 0 ? (
            giftLines.map((line, index) => {
              const selectedSku =
                availableSkuOptions.find((option) => option.id === line.skuId) ?? null;

              return (
                <div key={line.lineId} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium text-black/82">赠品行 {index + 1}</div>
                    <button
                      type="button"
                      className="text-xs font-medium text-black/52 transition hover:text-black/72 disabled:cursor-not-allowed disabled:text-black/28"
                      disabled={!canRemoveGiftLine}
                      onClick={() =>
                        setGiftLines((current) =>
                          canRemoveGiftLine
                            ? current.filter((item) => item.lineId !== line.lineId)
                            : current,
                        )
                      }
                    >
                      删除
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_120px]">
                    <ProductSkuSearchField
                      label="赠品 SKU"
                      placeholder="搜索赠品 SKU"
                      value={line.skuId}
                      selectedOption={selectedSku}
                      onSelect={(option) => {
                        if (!option) {
                          setGiftLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId ? { ...item, skuId: "" } : item,
                            ),
                          );
                          return;
                        }

                        upsertSkuOption(option);
                        setGiftLines((current) =>
                          current.map((item) =>
                            item.lineId === line.lineId
                              ? { ...item, skuId: option.id }
                              : item,
                          ),
                        );
                      }}
                      helper={
                        <div className="text-xs text-black/50">
                          {selectedSku
                            ? `${selectedSku.product.name} / ${selectedSku.skuName}`
                            : "赠品也必须对应标准 SKU，不能把多酒写成自由文本。"}
                        </div>
                      }
                    />
                    <label className="space-y-2">
                      <span className="crm-label">数量</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={line.qty}
                        onChange={(event) =>
                          setGiftLines((current) =>
                            current.map((item) =>
                              item.lineId === line.lineId
                                ? { ...item, qty: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="crm-input"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block space-y-2">
                    <span className="crm-label">赠品备注</span>
                    <textarea
                      rows={2}
                      value={line.remark}
                      onChange={(event) =>
                        setGiftLines((current) =>
                          current.map((item) =>
                            item.lineId === line.lineId
                              ? { ...item, remark: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="可选，用于补充赠品说明"
                      className="crm-textarea"
                    />
                  </label>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-4 text-sm leading-7 text-black/55">
              如需和订单一起发货的标准 SKU 赠品，可在这里新增赠品行。
            </div>
          )}
        </div>
      </section>

      <TradeOrderSplitPreview computation={computation} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button formAction={saveDraftAction} className="crm-button crm-button-secondary">
          保存草稿
        </button>
        <button
          formAction={submitForReviewAction}
          className="crm-button crm-button-primary"
          disabled={!submitReady}
        >
          提交审核
        </button>
      </div>
    </form>
  );
}
