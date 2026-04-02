"use client";

import { useDeferredValue, useEffect, useState } from "react";

type CustomerOption = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  owner: {
    id: string;
    name: string;
    username: string;
  } | null;
};

type SkuOption = {
  id: string;
  skuCode: string;
  skuName: string;
  specText: string;
  unit: string;
  defaultUnitPrice: string;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: string;
  product: {
    id: string;
    name: string;
    supplier: {
      id: string;
      name: string;
    };
  };
};

type PaymentSchemeOption = {
  value:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  label: string;
  description: string;
};

type SalesOrderFormInitialValues = {
  id?: string;
  skuId?: string;
  qty?: number;
  dealPrice?: string;
  discountReason?: string;
  giftName?: string;
  giftQty?: number;
  giftRemark?: string;
  paymentScheme?:
    | "FULL_PREPAID"
    | "DEPOSIT_PLUS_BALANCE"
    | "FULL_COD"
    | "DEPOSIT_PLUS_COD";
  depositAmount?: string;
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  insuranceRequired?: boolean;
  insuranceAmount?: string;
  remark?: string;
};

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

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function paymentSchemeRequiresDeposit(
  paymentScheme: PaymentSchemeOption["value"],
) {
  return (
    paymentScheme === "DEPOSIT_PLUS_BALANCE" ||
    paymentScheme === "DEPOSIT_PLUS_COD"
  );
}

function calculateBreakdown(input: {
  paymentScheme: PaymentSchemeOption["value"];
  finalAmount: number;
  depositAmount: number;
}) {
  const finalAmount = roundCurrency(Math.max(input.finalAmount, 0));
  const depositAmount = paymentSchemeRequiresDeposit(input.paymentScheme)
    ? roundCurrency(Math.max(input.depositAmount, 0))
    : 0;

  switch (input.paymentScheme) {
    case "FULL_PREPAID":
      return {
        depositAmount: 0,
        collectedAmount: finalAmount,
        remainingAmount: 0,
        codAmount: 0,
      };
    case "FULL_COD":
      return {
        depositAmount: 0,
        collectedAmount: 0,
        remainingAmount: finalAmount,
        codAmount: finalAmount,
      };
    case "DEPOSIT_PLUS_BALANCE":
      return {
        depositAmount,
        collectedAmount: depositAmount,
        remainingAmount: roundCurrency(Math.max(finalAmount - depositAmount, 0)),
        codAmount: 0,
      };
    case "DEPOSIT_PLUS_COD":
      return {
        depositAmount,
        collectedAmount: depositAmount,
        remainingAmount: roundCurrency(Math.max(finalAmount - depositAmount, 0)),
        codAmount: roundCurrency(Math.max(finalAmount - depositAmount, 0)),
      };
    default:
      return {
        depositAmount: 0,
        collectedAmount: finalAmount,
        remainingAmount: 0,
        codAmount: 0,
      };
  }
}

export function SalesOrderForm({
  saveAction,
  skuOptions,
  paymentSchemeOptions,
  initialValues,
  fixedCustomer,
  submitLabel,
  helperText,
  redirectTo,
}: Readonly<{
  saveAction: (formData: FormData) => Promise<void>;
  skuOptions: SkuOption[];
  paymentSchemeOptions: PaymentSchemeOption[];
  initialValues?: SalesOrderFormInitialValues;
  fixedCustomer?: CustomerOption | null;
  submitLabel: string;
  helperText: string;
  redirectTo: string;
}>) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(
    fixedCustomer ?? null,
  );
  const [customerKeyword, setCustomerKeyword] = useState(
    fixedCustomer ? `${fixedCustomer.name} ${fixedCustomer.phone}` : "",
  );
  const deferredCustomerKeyword = useDeferredValue(customerKeyword.trim());
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState("");
  const [skuId, setSkuId] = useState(initialValues?.skuId ?? "");
  const [qty, setQty] = useState(String(initialValues?.qty ?? 1));
  const [dealPrice, setDealPrice] = useState(initialValues?.dealPrice ?? "0");
  const [paymentScheme, setPaymentScheme] = useState<
    PaymentSchemeOption["value"]
  >(initialValues?.paymentScheme ?? "FULL_PREPAID");
  const [depositAmount, setDepositAmount] = useState(
    initialValues?.depositAmount ?? "0",
  );
  const [receiverName, setReceiverName] = useState(
    initialValues?.receiverName ?? fixedCustomer?.name ?? "",
  );
  const [receiverPhone, setReceiverPhone] = useState(
    initialValues?.receiverPhone ?? fixedCustomer?.phone ?? "",
  );
  const [receiverAddress, setReceiverAddress] = useState(
    initialValues?.receiverAddress ?? fixedCustomer?.address ?? "",
  );
  const [insuranceRequired, setInsuranceRequired] = useState(
    initialValues?.insuranceRequired ?? false,
  );
  const [insuranceAmount, setInsuranceAmount] = useState(
    initialValues?.insuranceAmount ?? "0",
  );

  const selectedSku = skuOptions.find((item) => item.id === skuId) ?? null;
  const listUnitPrice = toNumber(selectedSku?.defaultUnitPrice);
  const dealUnitPrice = toNumber(dealPrice);
  const qtyValue = Math.max(1, toNumber(qty));
  const listAmount = roundCurrency(listUnitPrice * qtyValue);
  const dealAmount = roundCurrency(dealUnitPrice * qtyValue);
  const discountAmount = roundCurrency(Math.max(listAmount - dealAmount, 0));
  const paymentBreakdown = calculateBreakdown({
    paymentScheme,
    finalAmount: dealAmount,
    depositAmount: toNumber(depositAmount),
  });
  const selectedPaymentSchemeMeta =
    paymentSchemeOptions.find((item) => item.value === paymentScheme) ??
    paymentSchemeOptions[0];

  useEffect(() => {
    if (fixedCustomer || selectedCustomer || !deferredCustomerKeyword) {
      setCustomerResults([]);
      setCustomerSearchLoading(false);
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        setCustomerSearchLoading(true);
        setCustomerSearchError("");
        const response = await fetch(
          `/api/customers/order-search?q=${encodeURIComponent(deferredCustomerKeyword)}`,
          {
            method: "GET",
            credentials: "same-origin",
          },
        );

        if (!response.ok) {
          throw new Error("客户搜索失败，请稍后重试。");
        }

        const payload = (await response.json()) as { items: CustomerOption[] };
        if (!cancelled) {
          setCustomerResults(payload.items);
        }
      } catch (error) {
        if (!cancelled) {
          setCustomerSearchError(
            error instanceof Error ? error.message : "客户搜索失败，请稍后重试。",
          );
          setCustomerResults([]);
        }
      } finally {
        if (!cancelled) {
          setCustomerSearchLoading(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [deferredCustomerKeyword, fixedCustomer, selectedCustomer]);

  useEffect(() => {
    if (!selectedSku) {
      setInsuranceRequired(false);
      setInsuranceAmount("0");
      return;
    }

    if (!selectedSku.insuranceSupported) {
      setInsuranceRequired(false);
      setInsuranceAmount("0");
      return;
    }

    if (
      insuranceRequired &&
      (!insuranceAmount || Number(insuranceAmount) <= 0)
    ) {
      setInsuranceAmount(selectedSku.defaultInsuranceAmount);
    }
  }, [insuranceAmount, insuranceRequired, selectedSku]);

  return (
    <form action={saveAction} className="mt-6 space-y-5">
      <input type="hidden" name="id" value={initialValues?.id ?? ""} />
      <input type="hidden" name="customerId" value={selectedCustomer?.id ?? ""} />
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-black/85">{submitLabel}</h3>
        <p className="text-sm leading-7 text-black/60">{helperText}</p>
      </div>

      <section className="crm-subtle-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="crm-detail-label">下单客户</p>
            <p className="mt-1 text-sm text-black/60">
              主入口建议从客户详情页发起。订单中心直建时，只支持远程搜索客户。
            </p>
          </div>
          {!fixedCustomer && selectedCustomer ? (
            <button
              type="button"
              className="crm-button crm-button-secondary"
              onClick={() => {
                setSelectedCustomer(null);
                setCustomerKeyword("");
                setCustomerResults([]);
              }}
            >
              重新搜索客户
            </button>
          ) : null}
        </div>

        {selectedCustomer ? (
          <div className="rounded-2xl border border-black/8 bg-white/75 p-4 text-sm text-black/70">
            <div className="font-medium text-black/85">
              {selectedCustomer.name} / {selectedCustomer.phone}
            </div>
            <div className="mt-1 text-xs text-black/50">
              当前负责人：
              {selectedCustomer.owner?.name ||
                selectedCustomer.owner?.username ||
                "未分配"}
            </div>
            <div className="mt-1 text-xs text-black/50">
              地址：{selectedCustomer.address || "未填写"}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="space-y-2">
              <span className="crm-label">远程搜索客户</span>
              <input
                value={customerKeyword}
                onChange={(event) => setCustomerKeyword(event.target.value)}
                placeholder="输入姓名、手机号或当前负责人"
                className="crm-input"
              />
            </label>

            {customerSearchLoading ? (
              <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm text-black/55">
                正在搜索客户…
              </div>
            ) : null}

            {customerSearchError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {customerSearchError}
              </div>
            ) : null}

            {!customerSearchLoading &&
            !customerSearchError &&
            deferredCustomerKeyword &&
            customerResults.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/10 bg-white/55 p-4 text-sm text-black/55">
                没有匹配客户，请检查姓名、手机号或负责人关键词。
              </div>
            ) : null}

            {customerResults.length > 0 ? (
              <div className="grid gap-3">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    className="rounded-2xl border border-black/8 bg-white/75 p-4 text-left transition hover:border-black/15"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setCustomerKeyword(`${customer.name} ${customer.phone}`);
                      setCustomerResults([]);
                      setReceiverName(customer.name);
                      setReceiverPhone(customer.phone);
                      setReceiverAddress(customer.address ?? "");
                    }}
                  >
                    <div className="font-medium text-black/85">
                      {customer.name} / {customer.phone}
                    </div>
                    <div className="mt-1 text-xs text-black/50">
                      当前负责人：
                      {customer.owner?.name || customer.owner?.username || "未分配"}
                    </div>
                    <div className="mt-1 text-xs text-black/50">
                      地址：{customer.address || "未填写"}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="crm-subtle-panel grid gap-4 xl:grid-cols-2">
        <label className="space-y-2">
          <span className="crm-label">商品 SKU</span>
          <select
            name="skuId"
            required
            value={skuId}
            onChange={(event) => setSkuId(event.target.value)}
            className="crm-select"
          >
            <option value="">选择商品 SKU</option>
            {skuOptions.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.product.supplier.name} / {sku.product.name} / {sku.skuName} /{" "}
                {sku.specText}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="crm-label">数量</span>
          <input
            type="number"
            name="qty"
            min="1"
            step="1"
            required
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            className="crm-input"
          />
        </label>

        <label className="space-y-2">
          <span className="crm-label">商品原价</span>
          <input
            readOnly
            value={
              selectedSku
                ? `${formatCurrency(listUnitPrice)} / ${selectedSku.unit}`
                : "请选择 SKU"
            }
            className="crm-input bg-black/[0.03]"
          />
        </label>

        <label className="space-y-2">
          <span className="crm-label">成交单价</span>
          <input
            type="number"
            name="dealPrice"
            min="0"
            step="0.01"
            required
            value={dealPrice}
            onChange={(event) => setDealPrice(event.target.value)}
            className="crm-input"
          />
        </label>

        <label className="space-y-2">
          <span className="crm-label">自动优惠金额</span>
          <input
            readOnly
            value={formatCurrency(discountAmount)}
            className="crm-input bg-black/[0.03]"
          />
        </label>

        <label className="space-y-2">
          <span className="crm-label">优惠原因</span>
          <input
            name="discountReason"
            defaultValue={initialValues?.discountReason ?? ""}
            required={dealUnitPrice < listUnitPrice}
            className="crm-input"
            placeholder={
              dealUnitPrice < listUnitPrice
                ? "成交价低于原价时必须填写"
                : "如无优惠可留空"
            }
          />
        </label>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div>
          <p className="crm-detail-label">收款方案</p>
          <p className="mt-1 text-sm text-black/60">
            只维护本阶段需要的订单结算结构，后续可平滑扩展到 PaymentPlan / PaymentRecord。
          </p>
        </div>

        <label className="space-y-2">
          <span className="crm-label">paymentScheme</span>
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
        </label>

        <div className="rounded-2xl border border-black/8 bg-white/75 p-4 text-sm text-black/65">
          {selectedPaymentSchemeMeta?.description}
        </div>

        {paymentSchemeRequiresDeposit(paymentScheme) ? (
          <label className="space-y-2">
            <span className="crm-label">已收定金</span>
            <input
              type="number"
              name="depositAmount"
              min="0"
              step="0.01"
              required
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
              className="crm-input"
            />
          </label>
        ) : (
          <input type="hidden" name="depositAmount" value="0" />
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-black/8 bg-white/75 p-4 text-sm text-black/70">
            <div className="crm-detail-label">已收金额</div>
            <div className="mt-2 font-medium text-black/85">
              {formatCurrency(paymentBreakdown.collectedAmount)}
            </div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/75 p-4 text-sm text-black/70">
            <div className="crm-detail-label">待收金额</div>
            <div className="mt-2 font-medium text-black/85">
              {formatCurrency(paymentBreakdown.remainingAmount)}
            </div>
          </div>
          <div className="rounded-2xl border border-black/8 bg-white/75 p-4 text-sm text-black/70">
            <div className="crm-detail-label">代收金额</div>
            <div className="mt-2 font-medium text-black/85">
              {formatCurrency(paymentBreakdown.codAmount)}
            </div>
          </div>
        </div>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div>
          <p className="crm-detail-label">随单赠品与保价</p>
          <p className="mt-1 text-sm text-black/60">
            随单赠品写入 SalesOrderGiftItem，不复用 GiftRecord。
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="crm-label">赠品名称</span>
            <input
              name="giftName"
              defaultValue={initialValues?.giftName ?? ""}
              className="crm-input"
            />
          </label>
          <label className="space-y-2">
            <span className="crm-label">赠品数量</span>
            <input
              type="number"
              name="giftQty"
              min="0"
              step="1"
              defaultValue={initialValues?.giftQty ?? 0}
              className="crm-input"
            />
          </label>
          <label className="space-y-2">
            <span className="crm-label">赠品备注</span>
            <input
              name="giftRemark"
              defaultValue={initialValues?.giftRemark ?? ""}
              className="crm-input"
            />
          </label>
        </div>

        <div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)]">
          <label className="flex items-center gap-3 rounded-2xl border border-black/8 bg-white/75 px-4 py-3 text-sm text-black/70">
            <input
              type="checkbox"
              name="insuranceRequired"
              checked={insuranceRequired}
              disabled={!selectedSku?.insuranceSupported}
              onChange={(event) => {
                const nextChecked = event.target.checked;
                setInsuranceRequired(nextChecked);
                if (nextChecked && selectedSku) {
                  setInsuranceAmount(
                    Number(insuranceAmount) > 0
                      ? insuranceAmount
                      : selectedSku.defaultInsuranceAmount,
                  );
                }
              }}
            />
            <span>
              {selectedSku?.insuranceSupported
                ? "需要保价"
                : "当前 SKU 不支持保价"}
            </span>
          </label>

          <label className="space-y-2">
            <span className="crm-label">保价金额</span>
            <input
              type="number"
              name="insuranceAmount"
              min="0"
              step="0.01"
              value={insuranceAmount}
              disabled={!insuranceRequired}
              onChange={(event) => setInsuranceAmount(event.target.value)}
              className="crm-input"
            />
          </label>
        </div>
      </section>

      <section className="crm-subtle-panel space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-2">
            <span className="crm-label">收件人</span>
            <input
              name="receiverName"
              required
              value={receiverName}
              onChange={(event) => setReceiverName(event.target.value)}
              className="crm-input"
            />
          </label>
          <label className="space-y-2">
            <span className="crm-label">联系电话</span>
            <input
              name="receiverPhone"
              required
              value={receiverPhone}
              onChange={(event) => setReceiverPhone(event.target.value)}
              className="crm-input"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="crm-label">收货地址</span>
          <textarea
            name="receiverAddress"
            rows={3}
            required
            value={receiverAddress}
            onChange={(event) => setReceiverAddress(event.target.value)}
            className="crm-textarea"
          />
        </label>

        <label className="block space-y-2">
          <span className="crm-label">订单备注</span>
          <textarea
            name="remark"
            rows={3}
            defaultValue={initialValues?.remark ?? ""}
            className="crm-textarea"
          />
        </label>
      </section>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-black/10 bg-white/55 px-4 py-3 text-sm text-black/55">
        <span>
          订单提交后将进入待审核。审核通过才进入发货池，回填物流单号后才进入已发货。
        </span>
        <button
          type="submit"
          className="crm-button crm-button-primary"
          disabled={!selectedCustomer || !selectedSku}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
