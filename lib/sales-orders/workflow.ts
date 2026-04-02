export const salesOrderPaymentSchemeValues = [
  "FULL_PREPAID",
  "DEPOSIT_PLUS_BALANCE",
  "FULL_COD",
  "DEPOSIT_PLUS_COD",
] as const;

export type SalesOrderPaymentSchemeValue =
  (typeof salesOrderPaymentSchemeValues)[number];

export function mapPaymentSchemeToLegacyPaymentMode(
  paymentScheme: SalesOrderPaymentSchemeValue,
) {
  switch (paymentScheme) {
    case "FULL_PREPAID":
      return "FULL_PAYMENT" as const;
    case "FULL_COD":
      return "COD" as const;
    case "DEPOSIT_PLUS_BALANCE":
    case "DEPOSIT_PLUS_COD":
    default:
      return "DEPOSIT" as const;
  }
}

export function paymentSchemeRequiresDeposit(
  paymentScheme: SalesOrderPaymentSchemeValue,
) {
  return (
    paymentScheme === "DEPOSIT_PLUS_BALANCE" ||
    paymentScheme === "DEPOSIT_PLUS_COD"
  );
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateSalesOrderPricing(input: {
  listUnitPrice: number;
  dealUnitPrice: number;
  qty: number;
}) {
  const listUnitPrice = Math.max(input.listUnitPrice, 0);
  const dealUnitPrice = Math.max(input.dealUnitPrice, 0);
  const qty = Math.max(input.qty, 0);
  const listAmount = roundCurrency(listUnitPrice * qty);
  const dealAmount = roundCurrency(dealUnitPrice * qty);
  const discountAmount = roundCurrency(Math.max(listAmount - dealAmount, 0));

  return {
    listUnitPrice,
    dealUnitPrice,
    qty,
    listAmount,
    dealAmount,
    discountAmount,
    finalAmount: dealAmount,
  };
}

export function calculateSalesOrderPaymentBreakdown(input: {
  paymentScheme: SalesOrderPaymentSchemeValue;
  finalAmount: number;
  depositAmount?: number;
}) {
  const finalAmount = roundCurrency(Math.max(input.finalAmount, 0));
  const depositAmount = paymentSchemeRequiresDeposit(input.paymentScheme)
    ? roundCurrency(Math.max(input.depositAmount ?? 0, 0))
    : 0;

  switch (input.paymentScheme) {
    case "FULL_PREPAID":
      return {
        paymentScheme: input.paymentScheme,
        depositAmount: 0,
        collectedAmount: finalAmount,
        remainingAmount: 0,
        codAmount: 0,
      };
    case "FULL_COD":
      return {
        paymentScheme: input.paymentScheme,
        depositAmount: 0,
        collectedAmount: 0,
        remainingAmount: finalAmount,
        codAmount: finalAmount,
      };
    case "DEPOSIT_PLUS_BALANCE":
      return {
        paymentScheme: input.paymentScheme,
        depositAmount,
        collectedAmount: depositAmount,
        remainingAmount: roundCurrency(Math.max(finalAmount - depositAmount, 0)),
        codAmount: 0,
      };
    case "DEPOSIT_PLUS_COD":
      return {
        paymentScheme: input.paymentScheme,
        depositAmount,
        collectedAmount: depositAmount,
        remainingAmount: roundCurrency(Math.max(finalAmount - depositAmount, 0)),
        codAmount: roundCurrency(Math.max(finalAmount - depositAmount, 0)),
      };
    default:
      return {
        paymentScheme: "FULL_PREPAID" as const,
        depositAmount: 0,
        collectedAmount: finalAmount,
        remainingAmount: 0,
        codAmount: 0,
      };
  }
}
