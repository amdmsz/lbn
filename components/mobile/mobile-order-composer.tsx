"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  LoaderCircle,
  MapPin,
  Minus,
  PackageCheck,
  Phone,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import type { CustomerListItem } from "@/lib/customers/queries";
import type { MobileCallTriggerSource } from "@/lib/calls/mobile-call-followup";
import {
  fetchMobileOrderOptions,
  searchMobileSkuOptions,
  submitMobileTradeOrder,
  type MobileOrderCustomerContext,
  type MobileOrderOptions,
  type MobilePaymentScheme,
  type MobileSkuOption,
} from "@/lib/mobile/client-api";
import { cn } from "@/lib/utils";

type MobileCallMode = "local-phone";

type MobileOrderLineState = {
  lineId: string;
  skuId: string;
  selectedSku: MobileSkuOption | null;
  qty: string;
  dealPrice: string;
  discountReason: string;
};

type MobileOrderSubmitAction = "save_draft" | "submit_for_review";

type MobileOrderComposerProps = {
  customer: CustomerListItem | null;
  onClose: () => void;
  onCompleted: (message: string, tradeNo: string) => void;
  onStartCall: (
    customer: CustomerListItem,
    triggerSource: MobileCallTriggerSource,
    mode: MobileCallMode,
  ) => void;
};

const paymentShortLabels: Record<MobilePaymentScheme, string> = {
  FULL_PREPAID: "全款",
  DEPOSIT_PLUS_BALANCE: "定金+尾款",
  FULL_COD: "到付",
  DEPOSIT_PLUS_COD: "定金+到付",
};

function createLineId() {
  return `mobile-line-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyLine(): MobileOrderLineState {
  return {
    lineId: createLineId(),
    skuId: "",
    selectedSku: null,
    qty: "1",
    dealPrice: "",
    discountReason: "",
  };
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAmount(value: string | number) {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function isDepositScheme(value: MobilePaymentScheme) {
  return value === "DEPOSIT_PLUS_BALANCE" || value === "DEPOSIT_PLUS_COD";
}

function isCodScheme(value: MobilePaymentScheme) {
  return value === "FULL_COD" || value === "DEPOSIT_PLUS_COD";
}

function buildCustomerInitials(name: string) {
  return name.trim().slice(0, 1) || "客";
}

function getCustomerPhone(customer: CustomerListItem, context: MobileOrderCustomerContext | null) {
  return context?.phone || customer.phone || "";
}

function MobileOrderField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  multiline,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  multiline?: boolean;
}>) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a1af]">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className="mt-2 w-full resize-none rounded-[14px] border border-[#e5e7eb] bg-white px-3 py-2.5 text-[14px] leading-5 text-[#20242c] outline-none transition focus:border-[#1677ff]/50 focus:ring-4 focus:ring-[#1677ff]/10"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          inputMode={inputMode}
          className="mt-2 h-11 w-full rounded-[14px] border border-[#e5e7eb] bg-white px-3 text-[14px] text-[#20242c] outline-none transition placeholder:text-[#b4bac4] focus:border-[#1677ff]/50 focus:ring-4 focus:ring-[#1677ff]/10"
        />
      )}
    </label>
  );
}

function MobileOrderSection({
  icon: Icon,
  title,
  meta,
  children,
}: Readonly<{
  icon: typeof PackageCheck;
  title: string;
  meta?: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="lbn-mobile-card-radius overflow-hidden border border-black/[0.06] bg-white shadow-[0_14px_34px_rgba(16,24,40,0.055)]">
      <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] bg-[#fbfcfe] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf3ff] text-[#1677ff]">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <h3 className="truncate text-[15px] font-semibold text-[#20242c]">{title}</h3>
        </div>
        {meta ? <span className="shrink-0 text-[12px] text-[#98a1af]">{meta}</span> : null}
      </div>
      <div className="px-4 py-[var(--lbn-mobile-gap)]">{children}</div>
    </section>
  );
}

function MobileSkuSearch({
  selectedSku,
  disabled,
  onSelect,
}: Readonly<{
  selectedSku: MobileSkuOption | null;
  disabled?: boolean;
  onSelect: (sku: MobileSkuOption | null) => void;
}>) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());
  const [results, setResults] = useState<MobileSkuOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!deferredQuery || disabled) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setError("");
        const payload = await searchMobileSkuOptions(deferredQuery);
        if (!cancelled) {
          setResults(payload.items);
        }
      } catch (requestError) {
        if (!cancelled) {
          setResults([]);
          setError(requestError instanceof Error ? requestError.message : "商品搜索失败。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, disabled]);

  return (
    <div>
      <div className="flex min-h-11 items-center gap-2 rounded-[14px] border border-[#e5e7eb] bg-[#fbfcfe] px-3 transition focus-within:border-[#1677ff]/50 focus-within:bg-white focus-within:ring-4 focus-within:ring-[#1677ff]/10">
        <Search className="h-4 w-4 shrink-0 text-[#98a1af]" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            selectedSku
              ? `${selectedSku.product.name} / ${selectedSku.skuName}`
              : "搜索商品名或规格"
          }
          disabled={disabled}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[14px] text-[#20242c] outline-none placeholder:text-[#98a1af] disabled:cursor-not-allowed"
        />
        {loading ? (
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-[#98a1af]" aria-hidden />
        ) : null}
        {selectedSku ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              onSelect(null);
            }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#98a1af] active:bg-[#eef1f5]"
            aria-label="清空商品"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {selectedSku ? (
        <div className="mt-2 rounded-[14px] border border-[#1677ff]/15 bg-[#f2f8ff] px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[#20242c]">
                {selectedSku.product.name}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-[#667085]">
                {selectedSku.skuName} · 默认价 ¥{formatAmount(selectedSku.defaultUnitPrice)}
              </div>
            </div>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1677ff]" aria-hidden />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                selectedSku.codSupported
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-[#eef1f5] text-[#98a1af]",
              )}
            >
              {selectedSku.codSupported ? "支持到付" : "不可到付"}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                selectedSku.insuranceSupported
                  ? "bg-[#eaf3ff] text-[#1677ff]"
                  : "bg-[#eef1f5] text-[#98a1af]",
              )}
            >
              {selectedSku.insuranceSupported ? "支持保价" : "不可保价"}
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 rounded-[14px] bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </div>
      ) : null}

      {!error && deferredQuery && !loading && results.length === 0 ? (
        <div className="mt-2 rounded-[14px] border border-dashed border-[#d0d5dd] bg-white px-3 py-3 text-[12px] text-[#98a1af]">
          没有匹配的商品规格
        </div>
      ) : null}

      {!error && results.length > 0 ? (
        <div className="mt-2 overflow-hidden rounded-[16px] border border-black/[0.06] bg-white shadow-[0_10px_24px_rgba(16,24,40,0.07)]">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setQuery("");
                setResults([]);
                onSelect(item);
              }}
              className="flex w-full items-start justify-between gap-3 border-b border-black/[0.05] px-3 py-3 text-left last:border-b-0 active:bg-[#f7f8fb]"
            >
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-[#20242c]">
                  {item.product.name}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-[#667085]">
                  {item.skuName}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-semibold text-[#20242c]">
                ¥{formatAmount(item.defaultUnitPrice)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function MobileOrderComposer({
  customer,
  onClose,
  onCompleted,
  onStartCall,
}: Readonly<MobileOrderComposerProps>) {
  const [orderOptions, setOrderOptions] = useState<MobileOrderOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [lines, setLines] = useState<MobileOrderLineState[]>(() => [createEmptyLine()]);
  const [paymentScheme, setPaymentScheme] = useState<MobilePaymentScheme>("FULL_PREPAID");
  const [depositAmount, setDepositAmount] = useState("0");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [insuranceRequired, setInsuranceRequired] = useState(false);
  const [insuranceAmount, setInsuranceAmount] = useState("0");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState<MobileOrderSubmitAction | null>(null);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!customer) {
      return;
    }

    let cancelled = false;
    setLoadingOptions(true);
    setOptionsError("");
    setSubmitError("");
    setLines([createEmptyLine()]);
    setPaymentScheme("FULL_PREPAID");
    setDepositAmount("0");
    setInsuranceRequired(false);
    setInsuranceAmount("0");
    setRemark("");

    void fetchMobileOrderOptions(customer.id)
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setOrderOptions(payload);
        setReceiverName(payload.customer.name);
        setReceiverPhone(payload.customer.phone);
        setReceiverAddress(payload.customer.address ?? "");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setOrderOptions(null);
        setReceiverName(customer.name);
        setReceiverPhone(customer.phone);
        setReceiverAddress("");
        setOptionsError(error instanceof Error ? error.message : "移动端下单参数加载失败。");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customer]);

  const paymentSchemeOptions = orderOptions?.paymentSchemeOptions ?? [];
  const customerContext = orderOptions?.customer ?? null;
  const selectedPaymentScheme =
    paymentSchemeOptions.find((option) => option.value === paymentScheme) ??
    paymentSchemeOptions[0] ??
    null;
  const needsDeposit = isDepositScheme(paymentScheme);
  const isCod = isCodScheme(paymentScheme);
  const goodsTotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        return sum + Math.max(0, toNumber(line.qty)) * Math.max(0, toNumber(line.dealPrice));
      }, 0),
    [lines],
  );
  const effectiveDeposit = needsDeposit ? Math.max(0, toNumber(depositAmount)) : 0;
  const effectiveInsuranceAmount = insuranceRequired ? Math.max(0, toNumber(insuranceAmount)) : 0;
  const collectedAmount =
    paymentScheme === "FULL_PREPAID"
      ? goodsTotal + effectiveInsuranceAmount
      : paymentScheme === "DEPOSIT_PLUS_BALANCE" || paymentScheme === "DEPOSIT_PLUS_COD"
        ? effectiveDeposit
        : 0;
  const remainingAmount =
    paymentScheme === "FULL_PREPAID" ? 0 : Math.max(goodsTotal + effectiveInsuranceAmount - collectedAmount, 0);
  const orderTotal = goodsTotal + effectiveInsuranceAmount;

  const validationIssues = useMemo(() => {
    const issues: string[] = [];

    if (lines.length === 0) {
      issues.push("至少需要一条商品行。");
    }

    lines.forEach((line, index) => {
      const label = `第 ${index + 1} 行`;
      const defaultPrice = toNumber(line.selectedSku?.defaultUnitPrice);
      const dealPrice = toNumber(line.dealPrice);

      if (!line.selectedSku || !line.skuId) {
        issues.push(`${label} 还未选择商品。`);
      }

      if (toNumber(line.qty) < 1) {
        issues.push(`${label} 数量至少为 1。`);
      }

      if (dealPrice < 0) {
        issues.push(`${label} 成交单价不能为负数。`);
      }

      if (line.selectedSku && defaultPrice > 0 && dealPrice < defaultPrice && !line.discountReason.trim()) {
        issues.push(`${label} 低于默认价，需要填写优惠说明。`);
      }

      if (isCod && line.selectedSku && !line.selectedSku.codSupported) {
        issues.push(`${label} 当前商品不支持到付。`);
      }

      if (insuranceRequired && line.selectedSku && !line.selectedSku.insuranceSupported) {
        issues.push(`${label} 当前商品不支持保价。`);
      }
    });

    if (needsDeposit) {
      if (effectiveDeposit <= 0) {
        issues.push("当前支付方案需要填写定金。");
      }

      if (orderTotal > 0 && effectiveDeposit >= orderTotal) {
        issues.push("定金必须小于订单总额。");
      }
    }

    if (insuranceRequired && effectiveInsuranceAmount <= 0) {
      issues.push("开启保价后需要填写保价金额。");
    }

    if (!receiverName.trim()) {
      issues.push("请填写收货人。");
    }

    if (!receiverPhone.trim()) {
      issues.push("请填写收货电话。");
    }

    if (!receiverAddress.trim()) {
      issues.push("请填写收货地址。");
    }

    return Array.from(new Set(issues));
  }, [
    effectiveDeposit,
    effectiveInsuranceAmount,
    insuranceRequired,
    isCod,
    lines,
    needsDeposit,
    orderTotal,
    receiverAddress,
    receiverName,
    receiverPhone,
  ]);

  const submitReady = validationIssues.length === 0 && !loadingOptions && Boolean(orderOptions);

  if (!customer) {
    return null;
  }

  function updateLine(lineId: string, patch: Partial<MobileOrderLineState>) {
    setLines((current) =>
      current.map((line) => (line.lineId === lineId ? { ...line, ...patch } : line)),
    );
  }

  function removeLine(lineId: string) {
    setLines((current) =>
      current.length > 1 ? current.filter((line) => line.lineId !== lineId) : current,
    );
  }

  function selectSku(lineId: string, sku: MobileSkuOption | null) {
    updateLine(lineId, {
      skuId: sku?.id ?? "",
      selectedSku: sku,
      dealPrice: sku ? String(sku.defaultUnitPrice) : "",
      discountReason: "",
    });

    if (sku?.insuranceSupported && insuranceRequired && toNumber(insuranceAmount) <= 0) {
      setInsuranceAmount(String(sku.defaultInsuranceAmount));
    }
  }

  async function submitOrder(action: MobileOrderSubmitAction) {
    if (!customer || !submitReady || submitting) {
      return;
    }

    setSubmitting(action);
    setSubmitError("");

    try {
      const payload = await submitMobileTradeOrder({
        action,
        customerId: customer.id,
        lines: lines.map((line) => ({
          lineId: line.lineId,
          skuId: line.skuId,
          qty: Math.max(1, Math.trunc(toNumber(line.qty))),
          dealPrice: Math.max(0, toNumber(line.dealPrice)),
          discountReason: line.discountReason.trim(),
        })),
        paymentScheme,
        depositAmount: effectiveDeposit,
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim(),
        receiverAddress: receiverAddress.trim(),
        insuranceRequired,
        insuranceAmount: effectiveInsuranceAmount,
        remark: remark.trim(),
      });

      onCompleted(payload.message, payload.order.tradeNo);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "移动端订单提交失败。");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[72] bg-[#e9edf3]">
      <section className="lbn-mobile-panel mx-auto flex max-w-[520px] flex-col overflow-hidden bg-[#f6f7f9] text-[#20242c] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]">
        <header className="lbn-mobile-order-header shrink-0 border-b border-black/[0.06] bg-white/92 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[#f2f4f7] text-[#344054]"
              aria-label="返回"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98a1af]">
                Mobile Trade Order
              </div>
              <h2 className="mt-0.5 truncate text-[18px] font-semibold leading-6 text-[#20242c]">
                创建交易单
              </h2>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[11px] text-[#98a1af]">预估总额</div>
              <div className="text-[16px] font-semibold tabular-nums text-[#1677ff]">
                {formatCurrency(orderTotal)}
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-black/[0.06] bg-[#fbfcfe] px-3 py-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#20242c] text-[15px] font-semibold text-white">
              {buildCustomerInitials(customerContext?.name ?? customer.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-[#20242c]">
                {customerContext?.name ?? customer.name}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-[#667085]">
                {getCustomerPhone(customer, customerContext) || "未填写电话"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onStartCall(customer, "detail", "local-phone")}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#eaf3ff] text-[#1677ff]"
              aria-label="本机拨号客户"
            >
              <Phone className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="lbn-mobile-order-content min-h-0 flex-1 overflow-y-auto">
          {loadingOptions ? (
            <div className="mb-3 flex items-center gap-2 rounded-[16px] bg-white px-4 py-3 text-[13px] text-[#667085]">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              正在加载下单参数...
            </div>
          ) : null}

          {optionsError ? (
            <div className="mb-3 rounded-[16px] border border-red-100 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-700">
              {optionsError}
            </div>
          ) : null}

          <div className="lbn-mobile-stack">
            <MobileOrderSection
              icon={PackageCheck}
              title="商品行"
              meta={`${lines.length} 行 / ${formatCurrency(goodsTotal)}`}
            >
              <div className="grid gap-3">
                {lines.map((line, index) => {
                  const qty = Math.max(0, toNumber(line.qty));
                  const lineTotal = qty * Math.max(0, toNumber(line.dealPrice));
                  const belowDefaultPrice =
                    line.selectedSku &&
                    toNumber(line.dealPrice) < toNumber(line.selectedSku.defaultUnitPrice);

                  return (
                    <div
                      key={line.lineId}
                      className="rounded-[18px] border border-black/[0.06] bg-[#fbfcfe] px-3 py-3"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-[13px] font-semibold text-[#20242c]">
                          商品 {index + 1}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-semibold tabular-nums text-[#1677ff]">
                            {formatCurrency(lineTotal)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeLine(line.lineId)}
                            disabled={lines.length <= 1}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#98a1af] disabled:opacity-35"
                            aria-label="删除商品行"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </div>

                      <MobileSkuSearch
                        selectedSku={line.selectedSku}
                        disabled={loadingOptions}
                        onSelect={(sku) => selectSku(line.lineId, sku)}
                      />

                      <div className="lbn-mobile-order-line-grid mt-3 grid gap-3">
                        <div>
                          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#98a1af]">
                            数量
                          </span>
                          <div className="mt-2 flex h-11 items-center rounded-[14px] border border-[#e5e7eb] bg-white">
                            <button
                              type="button"
                              onClick={() =>
                                updateLine(line.lineId, {
                                  qty: String(Math.max(1, Math.trunc(qty) - 1)),
                                })
                              }
                              className="inline-flex h-full w-9 items-center justify-center text-[#667085]"
                              aria-label="减少数量"
                            >
                              <Minus className="h-4 w-4" aria-hidden />
                            </button>
                            <input
                              value={line.qty}
                              onChange={(event) =>
                                updateLine(line.lineId, { qty: event.target.value })
                              }
                              inputMode="numeric"
                              className="min-w-0 flex-1 bg-transparent text-center text-[14px] font-semibold tabular-nums text-[#20242c] outline-none"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateLine(line.lineId, {
                                  qty: String(Math.max(1, Math.trunc(qty)) + 1),
                                })
                              }
                              className="inline-flex h-full w-9 items-center justify-center text-[#667085]"
                              aria-label="增加数量"
                            >
                              <Plus className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>

                        <MobileOrderField
                          label="成交单价"
                          value={line.dealPrice}
                          onChange={(value) => updateLine(line.lineId, { dealPrice: value })}
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </div>

                      {belowDefaultPrice ? (
                        <div className="mt-3">
                          <MobileOrderField
                            label="优惠说明"
                            value={line.discountReason}
                            onChange={(value) =>
                              updateLine(line.lineId, { discountReason: value })
                            }
                            placeholder="例如：老客户复购优惠"
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setLines((current) => [...current, createEmptyLine()])}
                className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-dashed border-[#cfd6e2] bg-white text-[14px] font-semibold text-[#1677ff]"
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                添加商品行
              </button>
            </MobileOrderSection>

            <MobileOrderSection
              icon={CreditCard}
              title="收款方案"
              meta={selectedPaymentScheme?.label ?? "未选择"}
            >
              <div className="lbn-mobile-payment-grid grid gap-[var(--lbn-mobile-gap-sm)]">
                {paymentSchemeOptions.map((option) => {
                  const active = option.value === paymentScheme;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPaymentScheme(option.value)}
                      className={cn(
                        "min-h-[74px] rounded-[16px] border px-3 py-3 text-left transition",
                        active
                          ? "border-[#1677ff]/35 bg-[#f2f8ff] shadow-[0_10px_22px_rgba(22,119,255,0.10)]"
                          : "border-black/[0.06] bg-[#fbfcfe]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[14px] font-semibold text-[#20242c]">
                          {paymentShortLabels[option.value]}
                        </span>
                        {active ? (
                          <CheckCircle2 className="h-4 w-4 text-[#1677ff]" aria-hidden />
                        ) : null}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#667085]">
                        {option.description}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3">
                {needsDeposit ? (
                  <MobileOrderField
                    label="定金金额"
                    value={depositAmount}
                    onChange={setDepositAmount}
                    inputMode="decimal"
                    placeholder="0.00"
                  />
                ) : null}

                <div className="rounded-[16px] border border-black/[0.06] bg-[#fbfcfe] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-[#20242c]">保价</div>
                      <div className="mt-0.5 text-[12px] text-[#667085]">
                        高客单或易损品可开启，提交时服务端再次校验
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !insuranceRequired;
                        setInsuranceRequired(next);
                        if (!next) {
                          setInsuranceAmount("0");
                          return;
                        }

                        const firstInsuranceSku = lines.find(
                          (line) => line.selectedSku?.insuranceSupported,
                        )?.selectedSku;
                        if (firstInsuranceSku && toNumber(insuranceAmount) <= 0) {
                          setInsuranceAmount(String(firstInsuranceSku.defaultInsuranceAmount));
                        }
                      }}
                      className={cn(
                        "relative h-7 w-12 rounded-full transition",
                        insuranceRequired ? "bg-[#1677ff]" : "bg-[#d0d5dd]",
                      )}
                      aria-pressed={insuranceRequired}
                    >
                      <span
                        className={cn(
                          "absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition",
                          insuranceRequired ? "left-6" : "left-1",
                        )}
                      />
                    </button>
                  </div>

                  {insuranceRequired ? (
                    <div className="mt-3">
                      <MobileOrderField
                        label="保价金额"
                        value={insuranceAmount}
                        onChange={setInsuranceAmount}
                        inputMode="decimal"
                        placeholder="0.00"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            </MobileOrderSection>

            <MobileOrderSection icon={MapPin} title="收货信息" meta="随订单快照保存">
              <div className="grid gap-3">
                <MobileOrderField
                  label="收货人"
                  value={receiverName}
                  onChange={setReceiverName}
                  placeholder="收货人姓名"
                />
                <MobileOrderField
                  label="联系电话"
                  value={receiverPhone}
                  onChange={setReceiverPhone}
                  inputMode="tel"
                  placeholder="收货手机号"
                />
                <MobileOrderField
                  label="收货地址"
                  value={receiverAddress}
                  onChange={setReceiverAddress}
                  placeholder="省市区 + 详细地址"
                  multiline
                />
              </div>
            </MobileOrderSection>

            <MobileOrderSection icon={ClipboardCheck} title="预检与备注" meta="提交前检查">
              <div className="lbn-mobile-summary-grid grid gap-[var(--lbn-mobile-gap-sm)]">
                {[
                  { label: "商品", value: formatCurrency(goodsTotal), icon: PackageCheck },
                  { label: "已收", value: formatCurrency(collectedAmount), icon: CreditCard },
                  { label: "尾款", value: formatCurrency(remainingAmount), icon: Truck },
                ].map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.label} className="rounded-[14px] bg-[#f7f8fb] px-3 py-2.5">
                      <Icon className="mb-1 h-3.5 w-3.5 text-[#98a1af]" aria-hidden />
                      <div className="truncate text-[12px] text-[#98a1af]">{item.label}</div>
                      <div className="mt-0.5 truncate text-[13px] font-semibold tabular-nums text-[#20242c]">
                        {item.value}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3">
                <MobileOrderField
                  label="订单备注"
                  value={remark}
                  onChange={setRemark}
                  placeholder="可填写客户承诺、发货偏好或审核说明"
                  multiline
                />
              </div>

              <div className="mt-3 rounded-[16px] border border-black/[0.06] bg-[#fbfcfe] px-3 py-3">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#20242c]">
                  {validationIssues.length === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden />
                  )}
                  {validationIssues.length === 0 ? "可以提交" : `还有 ${validationIssues.length} 项待处理`}
                </div>
                {validationIssues.length > 0 ? (
                  <div className="mt-2 space-y-1.5">
                    {validationIssues.slice(0, 4).map((issue) => (
                      <div key={issue} className="text-[12px] leading-5 text-[#667085]">
                        {issue}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[12px] leading-5 text-[#667085]">
                    服务端仍会执行 RBAC、商品可见性、拆单与支付规则校验。
                  </p>
                )}
              </div>
            </MobileOrderSection>
          </div>
        </div>

        {submitError ? (
          <div className="lbn-mobile-order-error absolute z-10 rounded-[16px] border border-red-100 bg-white px-4 py-3 text-[13px] leading-5 text-red-700 shadow-[0_16px_34px_rgba(16,24,40,0.16)]">
            {submitError}
          </div>
        ) : null}

        <footer className="lbn-mobile-order-footer shrink-0 border-t border-black/[0.06] bg-white/94 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] text-[#98a1af]">订单总额</div>
              <div className="truncate text-[20px] font-semibold tabular-nums text-[#20242c]">
                {formatCurrency(orderTotal)}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-[#667085]">
              <ShieldCheck className="h-4 w-4 text-[#1677ff]" aria-hidden />
              服务端复核
            </div>
          </div>
          <div className="grid grid-cols-[0.9fr_1.2fr] gap-[var(--lbn-mobile-gap-sm)]">
            <button
              type="button"
              onClick={() => void submitOrder("save_draft")}
              disabled={!submitReady || Boolean(submitting)}
              className="inline-flex h-12 items-center justify-center rounded-[15px] border border-[#d9e2ef] bg-white text-[14px] font-semibold text-[#344054] disabled:bg-[#eef1f5] disabled:text-[#98a1af]"
            >
              {submitting === "save_draft" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden />
              )}
              草稿
            </button>
            <button
              type="button"
              onClick={() => void submitOrder("submit_for_review")}
              disabled={!submitReady || Boolean(submitting)}
              className="inline-flex h-12 items-center justify-center rounded-[15px] bg-[#1677ff] text-[14px] font-semibold text-white shadow-[0_14px_28px_rgba(22,119,255,0.22)] disabled:bg-[#cfd6e2] disabled:shadow-none"
            >
              {submitting === "submit_for_review" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="mr-2 h-4 w-4" aria-hidden />
              )}
              提交审核
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
