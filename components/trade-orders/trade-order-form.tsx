"use client";

import { useState } from "react";
import {
  buildTradeOrderDraftComputation,
  isTradeOrderDraftReadyForSubmit,
  type TradeOrderDraftComputation,
  type TradeOrderBundleOption,
  type TradeOrderSkuOption,
} from "@/lib/trade-orders/workflow";
import { TradeOrderSplitPreview } from "@/components/trade-orders/trade-order-split-preview";

type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: { id: string; name: string; username: string } | null;
};

type SkuOption = TradeOrderSkuOption;
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
  const [lines, setLines] = useState<DraftLineState[]>(() => buildInitialLines(draft));
  const [giftLines, setGiftLines] = useState<DraftGiftLineState[]>(() =>
    buildInitialGiftLines(draft),
  );
  const [bundleLines, setBundleLines] = useState<DraftBundleLineState[]>(() =>
    buildInitialBundleLines(draft),
  );
  const [paymentScheme, setPaymentScheme] = useState<
    PaymentSchemeOption["value"]
  >(draft?.paymentScheme ?? "FULL_PREPAID");
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
    skuOptions,
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
              支持多 SKU、标准 SKU 赠品和套餐行。提交审核时会先展开套餐组件，再按 supplier 自动拆子单。
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
            <div className="mt-1 text-xs text-black/50">地址：{customer.address || "未填写"}</div>
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
              <input name="receiverName" value={receiverName} onChange={(event) => setReceiverName(event.target.value)} className="crm-input" />
            </label>
            <label className="space-y-2">
              <span className="crm-label">联系电话</span>
              <input name="receiverPhone" value={receiverPhone} onChange={(event) => setReceiverPhone(event.target.value)} className="crm-input" />
            </label>
            <label className="space-y-2 sm:col-span-2">
              <span className="crm-label">收件地址</span>
              <textarea name="receiverAddress" rows={3} value={receiverAddress} onChange={(event) => setReceiverAddress(event.target.value)} className="crm-textarea" />
            </label>
            <label className="flex items-center gap-2 rounded-2xl border border-black/8 bg-white/78 px-4 py-3 text-sm text-black/70">
              <input type="checkbox" name="insuranceRequired" checked={insuranceRequired} onChange={(event) => setInsuranceRequired(event.target.checked)} className="h-4 w-4 rounded border-black/15 text-black" />
              开启保价
            </label>
            <label className="space-y-2">
              <span className="crm-label">保价金额</span>
              <input name="insuranceAmount" type="number" min="0" step="0.01" value={effectiveInsuranceAmount} onChange={(event) => setInsuranceAmount(event.target.value)} disabled={!insuranceRequired} className="crm-input disabled:cursor-not-allowed disabled:bg-black/5" />
            </label>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/78 px-4 py-4">
            <div className="text-sm font-medium text-black/82">金额摘要</div>
            <div className="mt-3 space-y-2 text-sm text-black/66">
              <div className="flex items-center justify-between"><span>SKU 行</span><span>{computation.totals.skuLineCount}</span></div>
              <div className="flex items-center justify-between"><span>套餐行</span><span>{computation.totals.bundleLineCount}</span></div>
              <div className="flex items-center justify-between"><span>赠品行</span><span>{computation.totals.giftLineCount}</span></div>
              <div className="flex items-center justify-between"><span>展开后总件数</span><span>{computation.totals.qtyTotal}</span></div>
              <div className="flex items-center justify-between"><span>成交金额</span><span>{formatCurrency(computation.totals.finalAmount)}</span></div>
              <div className="flex items-center justify-between"><span>优惠金额</span><span>{formatCurrency(computation.totals.discountAmount)}</span></div>
              <div className="flex items-center justify-between"><span>定金</span><span>{formatCurrency(computation.totals.depositAmount)}</span></div>
              <div className="flex items-center justify-between"><span>待收</span><span>{formatCurrency(computation.totals.remainingAmount)}</span></div>
              <div className="flex items-center justify-between"><span>COD</span><span>{formatCurrency(computation.totals.codAmount)}</span></div>
            </div>
          </div>
        </div>
        <label className="space-y-2">
          <span className="crm-label">备注</span>
          <textarea name="remark" rows={3} value={remark} onChange={(event) => setRemark(event.target.value)} placeholder="记录本次成交的补充说明" className="crm-textarea" />
        </label>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-sm font-medium text-black/82">SKU 行</div><p className="mt-1 text-xs leading-6 text-black/55">每条付费 SKU 会生成一条 SKU 父行和一条 GOODS component。</p></div>
          <button type="button" className="crm-button crm-button-secondary" onClick={() => setLines((current) => [...current, { lineId: createLineId(), skuId: "", qty: "1", dealPrice: "", discountReason: "" }])}>新增 SKU 行</button>
        </div>
        <div className="space-y-3">
          {lines.length > 0 ? lines.map((line, index) => {
            const selectedSku = skuOptions.find((option) => option.id === line.skuId) ?? null;
            return (
              <div key={line.lineId} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-medium text-black/82">SKU 行 {index + 1}</div>
                  <button type="button" className="text-xs font-medium text-black/52 transition hover:text-black/72 disabled:cursor-not-allowed disabled:text-black/28" disabled={!canRemoveSkuLine} onClick={() => setLines((current) => canRemoveSkuLine ? current.filter((item) => item.lineId !== line.lineId) : current)}>删除</button>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_120px_140px]">
                  <label className="space-y-2">
                    <span className="crm-label">SKU</span>
                    <select value={line.skuId} onChange={(event) => {
                      const nextSkuId = event.target.value;
                      const nextSku = skuOptions.find((option) => option.id === nextSkuId) ?? null;
                      setLines((current) =>
                        current.map((item) =>
                          item.lineId === line.lineId
                            ? {
                                ...item,
                                skuId: nextSkuId,
                                dealPrice:
                                  nextSku && !item.dealPrice
                                    ? String(nextSku.defaultUnitPrice)
                                    : item.dealPrice,
                              }
                            : item,
                        ),
                      );
                      if (nextSku && nextSku.insuranceSupported && insuranceRequired && (!insuranceAmount || toNumber(insuranceAmount) <= 0)) {
                        setInsuranceAmount(String(nextSku.defaultInsuranceAmount));
                      }
                    }} className="crm-select">
                      <option value="">选择 SKU</option>
                      {skuOptions.map((option) => <option key={option.id} value={option.id}>{option.product.supplier.name} / {option.product.name} / {option.skuName}</option>)}
                    </select>
                    <div className="text-xs text-black/50">{selectedSku ? `${selectedSku.product.name} / ${selectedSku.specText} / 列表价 ${formatCurrency(toNumber(selectedSku.defaultUnitPrice))}` : "请选择标准 SKU。"}</div>
                  </label>
                  <label className="space-y-2"><span className="crm-label">数量</span><input type="number" min="1" step="1" value={line.qty} onChange={(event) => setLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, qty: event.target.value } : item))} className="crm-input" /></label>
                  <label className="space-y-2"><span className="crm-label">成交单价</span><input type="number" min="0" step="0.01" value={line.dealPrice} onChange={(event) => setLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, dealPrice: event.target.value } : item))} className="crm-input" /></label>
                </div>
                <label className="mt-3 block space-y-2"><span className="crm-label">优惠原因</span><textarea rows={2} value={line.discountReason} onChange={(event) => setLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, discountReason: event.target.value } : item))} placeholder="仅当成交价低于列表价时填写" className="crm-textarea" /></label>
              </div>
            );
          }) : <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-4 text-sm leading-7 text-black/55">当前未添加付费 SKU 行。你可以继续添加 SKU，或只保留下方的赠品 / 套餐行。</div>}
        </div>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-sm font-medium text-black/82">赠品行</div><p className="mt-1 text-xs leading-6 text-black/55">赠品必须选择标准 SKU，supplier 从 SKU 自动继承。</p></div>
          <button type="button" className="crm-button crm-button-secondary" onClick={() => setGiftLines((current) => [...current, { lineId: createLineId("gift"), skuId: "", qty: "1", remark: "" }])}>新增赠品行</button>
        </div>
        <div className="space-y-3">
          {giftLines.length > 0 ? giftLines.map((line, index) => {
            const selectedSku = skuOptions.find((option) => option.id === line.skuId) ?? null;
            return (
              <div key={line.lineId} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-medium text-black/82">赠品行 {index + 1}</div>
                  <button type="button" className="text-xs font-medium text-black/52 transition hover:text-black/72 disabled:cursor-not-allowed disabled:text-black/28" disabled={!canRemoveGiftLine} onClick={() => setGiftLines((current) => canRemoveGiftLine ? current.filter((item) => item.lineId !== line.lineId) : current)}>删除</button>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_120px]">
                  <label className="space-y-2">
                    <span className="crm-label">赠品 SKU</span>
                    <select value={line.skuId} onChange={(event) => setGiftLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, skuId: event.target.value } : item))} className="crm-select">
                      <option value="">选择标准 SKU</option>
                      {skuOptions.map((option) => <option key={option.id} value={option.id}>{option.product.supplier.name} / {option.product.name} / {option.skuName}</option>)}
                    </select>
                    <div className="text-xs text-black/50">{selectedSku ? `供应商：${selectedSku.product.supplier.name} / ${selectedSku.product.name} / ${selectedSku.specText}` : "赠品新写路径只支持标准 SKU，不支持自由文本。"}</div>
                  </label>
                  <label className="space-y-2"><span className="crm-label">数量</span><input type="number" min="1" step="1" value={line.qty} onChange={(event) => setGiftLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, qty: event.target.value } : item))} className="crm-input" /></label>
                </div>
                <label className="mt-3 block space-y-2"><span className="crm-label">赠品备注</span><textarea rows={2} value={line.remark} onChange={(event) => setGiftLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, remark: event.target.value } : item))} placeholder="可选，用于补充赠品说明" className="crm-textarea" /></label>
              </div>
            );
          }) : <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-4 text-sm leading-7 text-black/55">如需和订单一起发货的标准 SKU 赠品，可在这里新增赠品行。</div>}
        </div>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-sm font-medium text-black/82">套餐行</div><p className="mt-1 text-xs leading-6 text-black/55">套餐先写 BUNDLE 父行，再展开成多个 GOODS component。</p></div>
          <button type="button" className="crm-button crm-button-secondary" onClick={() => setBundleLines((current) => [...current, { lineId: createLineId("bundle"), bundleId: "", qty: "1", dealPrice: "", remark: "" }])}>新增套餐行</button>
        </div>
        <div className="space-y-3">
          {bundleLines.length > 0 ? bundleLines.map((line, index) => {
            const selectedBundle = bundleOptions.find((option) => option.id === line.bundleId) ?? null;
            const supplierCount = selectedBundle ? new Set(selectedBundle.items.map((item) => item.supplierId)).size : 0;
            return (
              <div key={line.lineId} className="rounded-2xl border border-black/8 bg-white/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-medium text-black/82">套餐行 {index + 1}</div>
                  <button type="button" className="text-xs font-medium text-black/52 transition hover:text-black/72 disabled:cursor-not-allowed disabled:text-black/28" disabled={!canRemoveBundleLine} onClick={() => setBundleLines((current) => canRemoveBundleLine ? current.filter((item) => item.lineId !== line.lineId) : current)}>删除</button>
                </div>
                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_120px_160px]">
                  <label className="space-y-2">
                    <span className="crm-label">套餐</span>
                    <select value={line.bundleId} onChange={(event) => {
                      const nextBundleId = event.target.value;
                      const nextBundle = bundleOptions.find((option) => option.id === nextBundleId) ?? null;
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
                    }} className="crm-select">
                      <option value="">选择套餐</option>
                      {bundleOptions.map((option) => <option key={option.id} value={option.id}>{option.name} / {option.code}</option>)}
                    </select>
                    <div className="text-xs text-black/50">{selectedBundle ? `${selectedBundle.items.length} 个组件 / ${supplierCount} 个 supplier / 默认价 ${formatCurrency(toNumber(selectedBundle.defaultBundlePrice))}` : "仅允许选择 enabled=true 且 ACTIVE 的标准套餐。"}</div>
                  </label>
                  <label className="space-y-2"><span className="crm-label">数量</span><input type="number" min="1" step="1" value={line.qty} onChange={(event) => setBundleLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, qty: event.target.value } : item))} className="crm-input" /></label>
                  <label className="space-y-2"><span className="crm-label">套餐成交单价</span><input type="number" min="0" step="0.01" value={line.dealPrice} onChange={(event) => setBundleLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, dealPrice: event.target.value } : item))} className="crm-input" /></label>
                </div>
                {selectedBundle ? <div className="mt-3 rounded-2xl border border-black/7 bg-[rgba(249,250,252,0.72)] px-4 py-3"><div className="text-xs font-medium uppercase tracking-[0.12em] text-black/40">套餐组件预览</div><div className="mt-2 grid gap-2">{selectedBundle.items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-black/58"><div>{item.productName} / {item.skuName} / {item.specText || "无规格"}</div><div>{item.supplierName} / 每套 {item.qty}{item.unit || "件"}</div></div>)}</div></div> : null}
                <label className="mt-3 block space-y-2"><span className="crm-label">套餐备注</span><textarea rows={2} value={line.remark} onChange={(event) => setBundleLines((current) => current.map((item) => item.lineId === line.lineId ? { ...item, remark: event.target.value } : item))} placeholder="可选，用于记录套餐成交说明" className="crm-textarea" /></label>
              </div>
            );
          }) : <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-4 text-sm leading-7 text-black/55">如需销售套餐，可在这里新增套餐行。套餐会在预览和提交审核时自动展开成组件。</div>}
        </div>
      </section>

      <TradeOrderSplitPreview computation={computation} />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button formAction={saveDraftAction} className="crm-button crm-button-secondary">保存草稿</button>
        <button formAction={submitForReviewAction} className="crm-button crm-button-primary" disabled={!submitReady}>提交审核</button>
      </div>
    </form>
  );
}
