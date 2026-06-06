"use client";

import { useState } from "react";
import { FileText, PackageCheck, Plus, UserRound } from "lucide-react";
import TradeOrderCartLine from "@/components/trade-orders/trade-order-cart-line";
import TradeOrderCustomerHeader from "@/components/trade-orders/trade-order-customer-header";
import TradeOrderGiftsPopover from "@/components/trade-orders/trade-order-gifts-popover";
import TradeOrderPaymentChipRow from "@/components/trade-orders/trade-order-payment-chip-row";
import TradeOrderReceiverPanel from "@/components/trade-orders/trade-order-receiver-panel";
import TradeOrderSummarySidebar from "@/components/trade-orders/trade-order-summary-sidebar";
import {
  buildTradeOrderDraftComputation,
  isTradeOrderDraftReadyForSubmit,
  type TradeOrderDraftComputation,
  type TradeOrderSkuOption,
  type TradeOrderWorkflowIssue,
} from "@/lib/trade-orders/workflow";
import type { SerializedVisibleSkuOption } from "@/lib/sales-orders/queries";

type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: { id: string; name: string; username: string } | null;
};

type SkuOption = SerializedVisibleSkuOption & TradeOrderSkuOption;

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
  unitSnapshot: string | null;
};

type DraftGiftLine = {
  id: string;
  skuId: string | null;
  qty: number;
  remark: string | null;
  unitSnapshot: string | null;
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
};

type DraftLineState = {
  lineId: string;
  skuId: string;
  qty: string;
  dealPrice: string;
  discountReason: string;
  unitSnapshot: string;
};

type DraftGiftLineState = {
  lineId: string;
  skuId: string;
  qty: string;
  remark: string;
  unitSnapshot: string;
};

function createLineId(prefix = "line") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toNumber(value: string | number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDepositScheme(value: PaymentSchemeOption["value"]) {
  return value === "DEPOSIT_PLUS_BALANCE" || value === "DEPOSIT_PLUS_COD";
}

function buildInitialLines(draft: TradeOrderDraft | null) {
  if (draft?.items.length) {
      return draft.items.map((item) => ({
      lineId: item.id || createLineId(),
      skuId: item.skuId ?? "",
      qty: String(item.qty),
      dealPrice: item.dealUnitPriceSnapshot,
      discountReason: item.remark ?? "",
      unitSnapshot: item.unitSnapshot ?? "",
    }));
  }

  if (draft?.giftItems.length) {
    return [];
  }

  return [
    {
      lineId: createLineId(),
      skuId: "",
      qty: "1",
      dealPrice: "",
      discountReason: "",
      unitSnapshot: "",
    },
  ];
}

function buildInitialGiftLines(draft: TradeOrderDraft | null) {
  return (draft?.giftItems ?? []).map((item) => ({
    lineId: item.id || createLineId("gift"),
    skuId: item.skuId ?? "",
    qty: String(item.qty),
    remark: item.remark ?? "",
    unitSnapshot: item.unitSnapshot ?? "",
  }));
}

function getTranslatedIssueMessage(
  issue: TradeOrderWorkflowIssue,
  lineLabelById: Map<string, string>,
) {
  const lineLabel = issue.lineId
    ? (lineLabelById.get(issue.lineId) ?? "当前行")
    : "订单";

  switch (issue.code) {
    case "LINE_SKU_REQUIRED":
      return `${lineLabel} 还未选择 SKU。`;
    case "LINE_SKU_NOT_FOUND":
      return `${lineLabel} 选择的 SKU 已不可用。`;
    case "LINE_SUPPLIER_UNRESOLVABLE":
      return `${lineLabel} 无法解析 supplier。`;
    case "LINE_QTY_INVALID":
      return `${lineLabel} 数量必须至少为 1。`;
    case "LINE_DEAL_PRICE_INVALID":
      return `${lineLabel} 成交单价不能为负。`;
    case "GIFT_SKU_REQUIRED":
      return `${lineLabel} 还未选择赠品 SKU。`;
    case "GIFT_SKU_NOT_FOUND":
      return `${lineLabel} 选择的赠品 SKU 已不可用。`;
    case "GIFT_SUPPLIER_UNRESOLVABLE":
      return `${lineLabel} 无法解析 supplier。`;
    case "GIFT_QTY_INVALID":
      return `${lineLabel} 数量必须至少为 1。`;
    case "DISCOUNT_REASON_REQUIRED":
      return `${lineLabel} 成交价低于列表价，需要填写优惠原因。`;
    case "COD_NOT_SUPPORTED":
      return `${lineLabel} 当前 SKU 不支持到付。`;
    case "INSURANCE_NOT_SUPPORTED":
      return `${lineLabel} 当前 SKU 不支持保价。`;
    case "INSURANCE_AMOUNT_REQUIRED":
      return "开启保价后必须填写保价金额。";
    case "DEPOSIT_REQUIRED":
      return "当前支付方案需要填写定金。";
    case "DEPOSIT_TOO_LARGE":
      return "定金必须小于成交金额。";
    case "LINES_REQUIRED":
      return "至少需要一条有效商品行或赠品行。";
    default:
      return issue.message;
  }
}

export function TradeOrderForm({
  customer,
  paymentSchemeOptions,
  skuOptions,
  draft,
  saveDraftAction,
  submitForReviewAction,
}: Readonly<{
  customer: CustomerContext;
  paymentSchemeOptions: PaymentSchemeOption[];
  skuOptions: SkuOption[];
  draft: TradeOrderDraft | null;
  saveDraftAction: (formData: FormData) => Promise<void>;
  submitForReviewAction: (formData: FormData) => Promise<void>;
}>) {
  const [availableSkuOptions, setAvailableSkuOptions] = useState<SkuOption[]>(skuOptions);
  const [lines, setLines] = useState<DraftLineState[]>(() => buildInitialLines(draft));
  const [giftLines, setGiftLines] = useState<DraftGiftLineState[]>(() =>
    buildInitialGiftLines(draft),
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

  const effectiveDepositAmount = isDepositScheme(paymentScheme) ? depositAmount : "0";
  const effectiveInsuranceAmount = insuranceRequired ? insuranceAmount : "0";

  const computation: TradeOrderDraftComputation = buildTradeOrderDraftComputation({
    lines: lines.map((line) => ({
      lineId: line.lineId,
      skuId: line.skuId,
      qty: Math.max(0, toNumber(line.qty)),
      dealPrice: toNumber(line.dealPrice),
      discountReason: line.discountReason,
      unitSnapshot: line.unitSnapshot.trim(),
    })),
    giftLines: giftLines.map((line) => ({
      lineId: line.lineId,
      skuId: line.skuId,
      qty: Math.max(0, toNumber(line.qty)),
      remark: line.remark,
      unitSnapshot: line.unitSnapshot.trim(),
    })),
    bundleLines: [],
    skuOptions: availableSkuOptions,
    bundleOptions: [],
    paymentScheme,
    depositAmount: toNumber(effectiveDepositAmount),
    insuranceRequired,
    insuranceAmount: toNumber(effectiveInsuranceAmount),
  });

  const lineLabelById = new Map([
    ...lines.map((line, index) => [line.lineId, `商品行 ${index + 1}`] as const),
    ...giftLines.map((line, index) => [line.lineId, `赠品行 ${index + 1}`] as const),
  ]);
  const issueMessages = computation.issues.map((issue) =>
    getTranslatedIssueMessage(issue, lineLabelById),
  );
  const issueMessagesByLine = new Map<string, string[]>();

  for (const issue of computation.issues) {
    if (!issue.lineId) {
      continue;
    }

    const existing = issueMessagesByLine.get(issue.lineId) ?? [];
    existing.push(getTranslatedIssueMessage(issue, lineLabelById));
    issueMessagesByLine.set(issue.lineId, existing);
  }

  const resolvedItemByLineId = new Map(
    computation.items.map((item) => [item.lineId, item] as const),
  );

  const submitReady = isTradeOrderDraftReadyForSubmit(computation);
  const selectedPaymentScheme =
    paymentSchemeOptions.find((option) => option.value === paymentScheme) ??
    paymentSchemeOptions[0];
  const canRemoveSkuLine = lines.length > 1 || giftLines.length > 0;
  const canRemoveGiftLine = giftLines.length > 1 || lines.length > 0;

  function upsertSkuOption(option: SkuOption) {
    setAvailableSkuOptions((current) => {
      const existingIndex = current.findIndex((item) => item.id === option.id);
      if (existingIndex >= 0) {
        return current.map((item) => (item.id === option.id ? option : item));
      }

      return [...current, option];
    });
  }

  function addLine() {
    setLines((current) => [
      ...current,
      {
        lineId: createLineId(),
        skuId: "",
        qty: "1",
        dealPrice: "",
        discountReason: "",
        unitSnapshot: "",
      },
    ]);
  }

  function addGiftLine() {
    setGiftLines((current) => [
      ...current,
      {
        lineId: createLineId("gift"),
        skuId: "",
        qty: "1",
        remark: "",
        unitSnapshot: "",
      },
    ]);
  }

  function updateLine(lineId: string, patch: Partial<DraftLineState>) {
    setLines((current) =>
      current.map((item) => (item.lineId === lineId ? { ...item, ...patch } : item)),
    );
  }

  function updateGiftLine(lineId: string, patch: Partial<DraftGiftLineState>) {
    setGiftLines((current) =>
      current.map((item) => (item.lineId === lineId ? { ...item, ...patch } : item)),
    );
  }

  function removeLine(lineId: string) {
    setLines((current) =>
      current.length > 1 || giftLines.length > 0
        ? current.filter((item) => item.lineId !== lineId)
        : current,
    );
  }

  function removeGiftLine(lineId: string) {
    setGiftLines((current) =>
      current.length > 1 || lines.length > 0
        ? current.filter((item) => item.lineId !== lineId)
        : current,
    );
  }

  function handleInsuranceToggle(checked: boolean) {
    setInsuranceRequired(checked);

    if (!checked || toNumber(insuranceAmount) > 0) {
      return;
    }

    const defaultAmount = Math.max(
      0,
      ...lines
        .map((line) => availableSkuOptions.find((option) => option.id === line.skuId))
        .filter((option): option is SkuOption => Boolean(option?.insuranceSupported))
        .map((option) => toNumber(option.defaultInsuranceAmount)),
    );

    if (defaultAmount > 0) {
      setInsuranceAmount(String(defaultAmount));
    }
  }

  return (
    <form className="space-y-4">
      <input type="hidden" name="id" value={draft?.id ?? ""} />
      <input type="hidden" name="customerId" value={customer.id} />
      <input type="hidden" name="paymentScheme" value={paymentScheme} />
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
            unitSnapshot: line.unitSnapshot,
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
            unitSnapshot: line.unitSnapshot,
          })),
        )}
      />
      <input type="hidden" name="bundleLinesJson" value={JSON.stringify([])} />

      <TradeOrderCustomerHeader customer={customer} />

      {draft?.rejectReason ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-[12px] leading-5 text-amber-800 dark:text-amber-300">
          <span className="font-semibold">上次驳回：</span>
          {draft.rejectReason}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {/* STEP 1 商品行 */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-6 text-foreground">
                <PackageCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                商品行
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {lines.length}
                </span>
              </h2>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 text-[12px] font-medium text-muted-foreground transition hover:border-primary/30 hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                添加商品
              </button>
            </div>
            <div className="space-y-2.5">
              {lines.map((line, index) => (
                <TradeOrderCartLine
                  key={line.lineId}
                  index={index}
                  line={line}
                  resolvedItem={resolvedItemByLineId.get(line.lineId)}
                  issueMessages={issueMessagesByLine.get(line.lineId) ?? []}
                  skuOptions={availableSkuOptions}
                  canRemove={canRemoveSkuLine}
                  onUpdate={updateLine}
                  onRemove={removeLine}
                  onUpsertOption={upsertSkuOption}
                  insuranceRequired={insuranceRequired}
                  insuranceAmount={insuranceAmount}
                  onSeedInsuranceAmount={setInsuranceAmount}
                />
              ))}

              <button
                type="button"
                onClick={addLine}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/25 bg-primary/5 text-[12.5px] font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/8"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                继续加商品
              </button>
            </div>
          </section>

          {/* STEP 2 收件 */}
          <TradeOrderReceiverPanel
            customer={customer}
            receiverName={receiverName}
            receiverPhone={receiverPhone}
            receiverAddress={receiverAddress}
            onReceiverNameChange={setReceiverName}
            onReceiverPhoneChange={setReceiverPhone}
            onReceiverAddressChange={setReceiverAddress}
            insuranceRequired={insuranceRequired}
            insuranceAmount={insuranceAmount}
            onInsuranceRequiredChange={handleInsuranceToggle}
            onInsuranceAmountChange={setInsuranceAmount}
          />

          {/* STEP 3 支付方式 — chip 流, 无外层卡 */}
          <section className="space-y-2.5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-6 text-foreground">
              <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              支付方式
            </h2>
            <TradeOrderPaymentChipRow
              schemes={paymentSchemeOptions}
              paymentScheme={paymentScheme}
              onPaymentSchemeChange={setPaymentScheme}
              depositAmount={effectiveDepositAmount}
              onDepositAmountChange={setDepositAmount}
            />
          </section>

          {/* 折叠区: 赠品 + 备注 */}
          <TradeOrderGiftsPopover
            giftLines={giftLines}
            skuOptions={availableSkuOptions}
            issueMessagesByLine={issueMessagesByLine}
            canRemove={canRemoveGiftLine}
            onAddGiftLine={addGiftLine}
            onUpdateGiftLine={updateGiftLine}
            onRemoveGiftLine={removeGiftLine}
            onUpsertOption={upsertSkuOption}
          />

          <details className="group rounded-xl border border-border/60 bg-card">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] font-semibold text-foreground transition hover:text-primary">
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                订单备注
                {remark.trim() ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    已填写
                  </span>
                ) : null}
              </span>
            </summary>
            <div className="border-t border-border/40 p-3.5">
              <textarea
                name="remark"
                rows={3}
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="记录补充说明"
                className="crm-textarea min-h-[5rem]"
              />
            </div>
          </details>
        </div>

        <TradeOrderSummarySidebar
          computation={computation}
          selectedPaymentScheme={selectedPaymentScheme}
          submitReady={submitReady}
          issueMessages={issueMessages}
          saveDraftAction={saveDraftAction}
          submitForReviewAction={submitForReviewAction}
        />
      </div>
    </form>
  );
}
