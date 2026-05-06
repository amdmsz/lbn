"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  FileText,
  Gift,
  MapPin,
  PackageCheck,
  Plus,
  ReceiptText,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { ProductSkuSearchField } from "@/components/products/product-sku-search-field";
import { TradeOrderSplitPreview } from "@/components/trade-orders/trade-order-split-preview";
import { cn } from "@/lib/utils";
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
};

type DraftGiftLine = {
  id: string;
  skuId: string | null;
  qty: number;
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

type Tone = "default" | "info" | "success" | "warning" | "danger";

const statusToneClassName: Record<Tone, string> = {
  default: "border-border/60 bg-card text-muted-foreground",
  info: "border-primary/15 bg-primary/5 text-primary",
  success:
    "border-emerald-500/15 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300",
  warning:
    "border-amber-500/18 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/15 bg-destructive/8 text-destructive",
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

function formatAmountForCell(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
    }));
  }

  if (draft?.giftItems.length) {
    return [];
  }

  return [
    { lineId: createLineId(), skuId: "", qty: "1", dealPrice: "", discountReason: "" },
  ];
}

function buildInitialGiftLines(draft: TradeOrderDraft | null) {
  return (draft?.giftItems ?? []).map((item) => ({
    lineId: item.id || createLineId("gift"),
    skuId: item.skuId ?? "",
    qty: String(item.qty),
    remark: item.remark ?? "",
  }));
}

function getOwnerLabel(customer: CustomerContext) {
  return customer.owner?.name || customer.owner?.username || "未分配";
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

function FormSection({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: Readonly<{
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-border/50 bg-muted/20 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="crm-eyebrow">{eyebrow}</p>
            <h2 className="mt-1 text-[0.98rem] font-semibold leading-5 text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="crm-toolbar-cluster md:justify-end">{actions}</div> : null}
      </div>
      <div className="p-3.5 md:p-4">{children}</div>
    </section>
  );
}

function StatusPill({
  label,
  tone = "default",
  icon: Icon,
}: Readonly<{
  label: string;
  tone?: Tone;
  icon?: LucideIcon;
}>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        statusToneClassName[tone],
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}

function MetricTile({
  label,
  value,
  note,
  tone = "default",
}: Readonly<{
  label: string;
  value: string;
  note: string;
  tone?: Tone;
}>) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-white/72 px-3.5 py-3 shadow-[0_1px_0_rgba(255,255,255,0.72)_inset]",
        tone === "info" ? "border-primary/15 bg-primary/5" : "border-border/55",
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 truncate text-[1.18rem] font-semibold tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] leading-4 text-muted-foreground">{note}</p>
    </div>
  );
}

function SummaryRow({
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
    })),
    giftLines: giftLines.map((line) => ({
      lineId: line.lineId,
      skuId: line.skuId,
      qty: Math.max(0, toNumber(line.qty)),
      remark: line.remark,
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
      },
    ]);
  }

  function addGiftLine() {
    setGiftLines((current) => [
      ...current,
      { lineId: createLineId("gift"), skuId: "", qty: "1", remark: "" },
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

  function resetReceiverToCustomer() {
    setReceiverName(customer.name);
    setReceiverPhone(customer.phone);
    setReceiverAddress(customer.address ?? "");
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
      <input type="hidden" name="bundleLinesJson" value={JSON.stringify([])} />

      <section className="overflow-hidden rounded-[1.25rem] border border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(247,249,252,0.9))] shadow-[var(--color-shell-shadow-sm)]">
        <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 md:px-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={draft ? `草稿 ${draft.tradeNo}` : "新建成交主单"}
                tone="info"
                icon={ReceiptText}
              />
              <StatusPill
                label={submitReady ? "可提交审核" : `待处理 ${computation.issues.length} 项`}
                tone={submitReady ? "success" : "warning"}
                icon={submitReady ? CheckCircle2 : AlertTriangle}
              />
              {selectedPaymentScheme ? (
                <StatusPill label={selectedPaymentScheme.label} icon={WalletCards} />
              ) : null}
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.01em] text-foreground">
                成交主单工作台
              </h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-6 text-muted-foreground">
                在一个界面完成客户确认、商品定价、支付策略、履约信息与 supplier
                执行拆分预检。
              </p>
            </div>
          </div>

          {draft?.rejectReason ? (
            <div className="max-w-xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3 text-[12px] leading-5 text-amber-800 dark:text-amber-300">
              <span className="font-semibold">上次驳回：</span>
              {draft.rejectReason}
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 p-3.5 md:grid-cols-2 md:p-4 xl:grid-cols-4">
          <MetricTile
            label="成交金额"
            value={formatCurrency(computation.totals.finalAmount)}
            note={`列表价 ${formatCurrency(computation.totals.listAmount)}`}
            tone="info"
          />
          <MetricTile
            label="待收 / COD"
            value={formatCurrency(computation.totals.remainingAmount)}
            note={`到付 ${formatCurrency(computation.totals.codAmount)}`}
          />
          <MetricTile
            label="行数 / 件数"
            value={`${computation.totals.lineCount} / ${computation.totals.qtyTotal}`}
            note={`商品 ${computation.totals.skuLineCount} / 赠品 ${computation.totals.giftLineCount}`}
          />
          <MetricTile
            label="执行分组"
            value={`${computation.groups.length} 个 supplier`}
            note={submitReady ? "提交后自动生成子单" : "明细完整后生成预览"}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <FormSection
            icon={UserRound}
            eyebrow="Customer / Payment"
            title="客户与支付策略"
            description="下单时先确认客户承接人和收款方式，避免后续支付与履约口径反复改。"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
              <div className="rounded-2xl border border-border/55 bg-muted/20 px-4 py-3.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Customer
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {customer.name}
                      </p>
                      <p className="mt-1 text-[13px] font-medium tabular-nums text-muted-foreground">
                        {customer.phone}
                      </p>
                    </div>
                    <StatusPill label={`归属 ${getOwnerLabel(customer)}`} />
                  </div>
                  <div className="flex items-start gap-2 border-t border-border/45 pt-3 text-[12px] leading-5 text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{customer.address || "客户档案暂未填写地址"}</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {paymentSchemeOptions.map((option) => {
                    const active = option.value === paymentScheme;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setPaymentScheme(option.value)}
                        className={cn(
                          "min-h-[5.4rem] rounded-2xl border px-3.5 py-3 text-left transition-[border-color,background-color,box-shadow,transform]",
                          active
                            ? "border-primary/35 bg-primary/8 shadow-[0_0_0_3px_rgba(37,99,235,0.08)]"
                            : "border-border/55 bg-white/68 hover:border-primary/25 hover:bg-white",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-foreground">
                            {option.label}
                          </span>
                          {active ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                          ) : (
                            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          )}
                        </div>
                        <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-muted-foreground">
                          {option.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                <label className="block">
                  <span className="crm-label">定金金额</span>
                  <input
                    name="depositAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={effectiveDepositAmount}
                    onChange={(event) => setDepositAmount(event.target.value)}
                    disabled={!isDepositScheme(paymentScheme)}
                    className="crm-input disabled:cursor-not-allowed disabled:bg-black/5"
                    placeholder="0.00"
                  />
                </label>
              </div>
            </div>
          </FormSection>

          <FormSection
            icon={Truck}
            eyebrow="Fulfillment"
            title="收件与履约信息"
            description="这里会成为后续 supplier 子单、发货任务和物流跟进的快照。"
            actions={
              <button
                type="button"
                className="crm-button crm-button-secondary h-9 px-3 text-[12px]"
                onClick={resetReceiverToCustomer}
              >
                同步客户资料
              </button>
            }
          >
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="crm-label">收件人</span>
                <input
                  name="receiverName"
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  className="crm-input"
                />
              </label>
              <label className="block">
                <span className="crm-label">联系电话</span>
                <input
                  name="receiverPhone"
                  value={receiverPhone}
                  onChange={(event) => setReceiverPhone(event.target.value)}
                  className="crm-input"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="crm-label">收件地址</span>
                <textarea
                  name="receiverAddress"
                  rows={3}
                  value={receiverAddress}
                  onChange={(event) => setReceiverAddress(event.target.value)}
                  className="crm-textarea min-h-[5.2rem]"
                />
              </label>

              <label className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-border/55 bg-muted/20 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/8 text-primary">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">订单保价</span>
                    <span className="block text-[12px] leading-4 text-muted-foreground">
                      开启后进入履约快照
                    </span>
                  </span>
                </span>
                <input
                  type="checkbox"
                  name="insuranceRequired"
                  checked={insuranceRequired}
                  onChange={(event) => handleInsuranceToggle(event.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary"
                />
              </label>

              <label className="block">
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
                  placeholder="0.00"
                />
              </label>
            </div>
          </FormSection>

          <FormSection
            icon={PackageCheck}
            eyebrow="Line Editor"
            title="商品行编辑"
            description="每瓶酒保持独立成交行，系统只在提交审核时按 supplier 拆分执行子单。"
            actions={
              <button
                type="button"
                className="crm-button crm-button-secondary h-9 px-3 text-[12px]"
                onClick={addLine}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                新增商品
              </button>
            }
          >
            <div className="space-y-3">
              {lines.map((line, index) => {
                const selectedSku =
                  availableSkuOptions.find((option) => option.id === line.skuId) ?? null;
                const resolvedItem = resolvedItemByLineId.get(line.lineId);
                const qty = Math.max(0, toNumber(line.qty));
                const dealPrice = toNumber(line.dealPrice);
                const fallbackLineTotal = qty * Math.max(0, dealPrice);
                const lineTotal = resolvedItem?.finalAmount ?? fallbackLineTotal;
                const listAmount = selectedSku
                  ? qty * toNumber(selectedSku.defaultUnitPrice)
                  : 0;
                const discountAmount = Math.max(0, listAmount - fallbackLineTotal);
                const lineIssues = issueMessagesByLine.get(line.lineId) ?? [];

                return (
                  <div
                    key={line.lineId}
                    className={cn(
                      "rounded-2xl border border-border/60 bg-white/78 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.76)_inset]",
                      lineIssues.length > 0 && "border-amber-500/25 bg-amber-500/5",
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
                          disabled={!canRemoveSkuLine}
                          onClick={() => removeLine(line.lineId)}
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
                          onSelect={(option) => {
                            if (!option) {
                              updateLine(line.lineId, { skuId: "" });
                              return;
                            }

                            upsertSkuOption(option);
                            updateLine(line.lineId, {
                              skuId: option.id,
                              dealPrice: line.dealPrice
                                ? line.dealPrice
                                : String(option.defaultUnitPrice),
                            });

                            if (
                              option.insuranceSupported &&
                              insuranceRequired &&
                              (!insuranceAmount || toNumber(insuranceAmount) <= 0)
                            ) {
                              setInsuranceAmount(String(option.defaultInsuranceAmount));
                            }
                          }}
                          helper={
                            <div className="flex flex-wrap items-center gap-2">
                              {selectedSku ? (
                                <>
                                  <StatusPill label={selectedSku.product.supplier.name} />
                                  <StatusPill
                                    label={`列表价 ${formatCurrency(
                                      toNumber(selectedSku.defaultUnitPrice),
                                    )}`}
                                  />
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
                        disabled={!canRemoveSkuLine}
                        onClick={() => removeLine(line.lineId)}
                        aria-label={`删除第 ${index + 1} 行商品`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-[8rem_10rem_minmax(0,1fr)]">
                      <label className="block">
                        <span className="crm-label">数量</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={line.qty}
                          onChange={(event) =>
                            updateLine(line.lineId, { qty: event.target.value })
                          }
                          className="crm-input text-right tabular-nums"
                        />
                      </label>

                      <label className="block">
                        <span className="crm-label">成交单价</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.dealPrice}
                          onChange={(event) =>
                            updateLine(line.lineId, { dealPrice: event.target.value })
                          }
                          className="crm-input text-right tabular-nums"
                          placeholder="0.00"
                        />
                      </label>

                      <div className="rounded-2xl border border-border/55 bg-muted/20 px-3.5 py-2.5 md:text-right">
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
                            updateLine(line.lineId, { discountReason: event.target.value })
                          }
                          placeholder="成交价低于列表价时填写；无优惠可留空"
                          className="crm-textarea min-h-[4.25rem]"
                        />
                      </label>

                      {lineIssues.length > 0 ? (
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-800 dark:text-amber-300">
                          {lineIssues.map((message) => (
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
            </div>
          </FormSection>

          <FormSection
            icon={Gift}
            eyebrow="Gift Lines"
            title="赠品行"
            description="赠品必须选择标准 SKU，金额恒为 0，并随对应 supplier 进入履约与导出。"
            actions={
              <button
                type="button"
                className="crm-button crm-button-secondary h-9 px-3 text-[12px]"
                onClick={addGiftLine}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                新增赠品
              </button>
            }
          >
            {giftLines.length > 0 ? (
              <div className="space-y-3">
                {giftLines.map((line, index) => {
                  const selectedSku =
                    availableSkuOptions.find((option) => option.id === line.skuId) ?? null;
                  const giftIssues = issueMessagesByLine.get(line.lineId) ?? [];

                  return (
                    <div
                      key={line.lineId}
                      className={cn(
                        "rounded-2xl border border-border/60 bg-white/78 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.76)_inset]",
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
                            disabled={!canRemoveGiftLine}
                            onClick={() => removeGiftLine(line.lineId)}
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
                                updateGiftLine(line.lineId, { skuId: "" });
                                return;
                              }

                              upsertSkuOption(option);
                              updateGiftLine(line.lineId, { skuId: option.id });
                            }}
                            helper={
                              <div className="flex flex-wrap items-center gap-2">
                                {selectedSku ? (
                                  <>
                                    <StatusPill label={selectedSku.product.supplier.name} />
                                    <StatusPill label={`${selectedSku.product.name}`} />
                                    <StatusPill label="金额 0" tone="success" />
                                  </>
                                ) : (
                                  <span className="text-[12px] leading-5 text-muted-foreground">
                                    赠品新写路径只支持标准 SKU，不支持自由文本赠品。
                                  </span>
                                )}
                              </div>
                            }
                          />
                        </div>

                        <button
                          type="button"
                          className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card text-muted-foreground transition hover:border-destructive/25 hover:bg-destructive/5 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-35 lg:mt-6 lg:inline-flex"
                          disabled={!canRemoveGiftLine}
                          onClick={() => removeGiftLine(line.lineId)}
                          aria-label={`删除第 ${index + 1} 行赠品`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-[8rem_minmax(0,1fr)]">
                        <label className="block">
                          <span className="crm-label">数量</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.qty}
                            onChange={(event) =>
                              updateGiftLine(line.lineId, { qty: event.target.value })
                            }
                            className="crm-input text-right tabular-nums"
                          />
                        </label>

                        <div className="rounded-2xl border border-border/55 bg-muted/20 px-3.5 py-2.5 md:text-right">
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
                              updateGiftLine(line.lineId, { remark: event.target.value })
                            }
                            placeholder="可选，用于补充赠品说明"
                            className="crm-textarea min-h-[4.25rem]"
                          />
                        </label>

                        {giftIssues.length > 0 ? (
                          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-800 dark:text-amber-300">
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
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-4 text-[13px] leading-6 text-muted-foreground">
                如需和成交单一起发货的标准 SKU 赠品，可在这里新增赠品行。
              </div>
            )}
          </FormSection>

          <FormSection icon={FileText} eyebrow="Notes" title="订单备注">
            <textarea
              name="remark"
              rows={3}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="记录本次成交的补充说明，例如客户特殊要求、内部协同说明等"
              className="crm-textarea min-h-[5.5rem]"
            />
          </FormSection>

          <TradeOrderSplitPreview computation={computation} />
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start">
          <section className="overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-sm">
            <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
              <p className="crm-eyebrow">Settlement</p>
              <h2 className="mt-1 text-[0.98rem] font-semibold text-foreground">
                收款与金额摘要
              </h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/75">
                  Final Amount
                </p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-foreground">
                  {formatCurrency(computation.totals.finalAmount)}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {selectedPaymentScheme?.label ?? "未选择支付方案"} / 商品{" "}
                  {computation.totals.skuLineCount} / 赠品{" "}
                  {computation.totals.giftLineCount}
                </p>
              </div>

              <div className="space-y-2.5">
                <SummaryRow label="列表金额" value={formatCurrency(computation.totals.listAmount)} />
                <SummaryRow
                  label="成交金额"
                  value={formatCurrency(computation.totals.finalAmount)}
                  strong
                />
                <SummaryRow
                  label="优惠金额"
                  value={formatCurrency(computation.totals.discountAmount)}
                />
                <SummaryRow label="赠品行" value={`${computation.totals.giftLineCount} 行`} />
                <SummaryRow label="定金" value={formatCurrency(computation.totals.depositAmount)} />
                <SummaryRow
                  label="待收金额"
                  value={formatCurrency(computation.totals.remainingAmount)}
                  strong
                />
                <SummaryRow label="COD 到付" value={formatCurrency(computation.totals.codAmount)} />
                <SummaryRow
                  label="保价金额"
                  value={formatCurrency(computation.totals.insuranceAmount)}
                />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-sm">
            <div className="border-b border-border/50 bg-muted/20 px-4 py-3">
              <p className="crm-eyebrow">Readiness</p>
              <h2 className="mt-1 text-[0.98rem] font-semibold text-foreground">
                提交前检查
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {submitReady ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-[13px] leading-5 text-emerald-700 dark:text-emerald-300">
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
                      className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-800 dark:text-amber-300"
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
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    成交层商品行
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {computation.items.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                    赠品行
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {computation.totals.giftLineCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                    supplier 执行分组
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {computation.groups.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2">
                    <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
                    待收金额
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatCurrency(computation.totals.remainingAmount)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-1 rounded-[1.15rem] border border-border/70 bg-background/88 p-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label={submitReady ? "审核材料已就绪" : "仍有检查项未完成"}
                tone={submitReady ? "success" : "warning"}
                icon={submitReady ? CheckCircle2 : AlertTriangle}
              />
              <StatusPill
                label={`成交 ${formatCurrency(computation.totals.finalAmount)}`}
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
            >
              保存草稿
            </button>
            <button
              type="submit"
              formAction={submitForReviewAction}
              className="crm-button crm-button-primary h-10 px-4"
              disabled={!submitReady}
            >
              提交审核
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
