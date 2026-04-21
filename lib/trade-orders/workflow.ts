import {
  calculateSalesOrderPaymentBreakdown,
  calculateSalesOrderPricing,
  mapPaymentSchemeToLegacyPaymentMode,
  paymentSchemeRequiresDeposit,
  type SalesOrderPaymentSchemeValue,
} from "@/lib/sales-orders/workflow";

export type TradeOrderLineInput = {
  lineId: string;
  skuId: string;
  qty: number;
  dealPrice: number;
  discountReason: string;
};

export type TradeOrderGiftLineInput = {
  lineId: string;
  skuId: string;
  qty: number;
  remark: string;
};

export type TradeOrderBundleLineInput = {
  lineId: string;
  bundleId: string;
  qty: number;
  dealPrice: number;
  remark: string;
};

export type TradeOrderSkuOption = {
  id: string;
  skuName: string;
  defaultUnitPrice: string | number;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: string | number;
  product: {
    id: string;
    name: string;
    supplier: {
      id: string;
      name: string;
    };
  };
};

export type TradeOrderBundleOptionItem = {
  id: string;
  lineNo: number;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  skuId: string;
  skuName: string;
  qty: number;
  sortOrder: number;
  enabled: boolean;
  defaultUnitPrice: string | number;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: string | number;
};

export type TradeOrderBundleOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  defaultBundlePrice: string | number;
  version: number;
  items: TradeOrderBundleOptionItem[];
};

export type TradeOrderWorkflowIssueCode =
  | "LINE_SKU_REQUIRED"
  | "LINE_SKU_NOT_FOUND"
  | "LINE_SUPPLIER_UNRESOLVABLE"
  | "LINE_QTY_INVALID"
  | "LINE_DEAL_PRICE_INVALID"
  | "DISCOUNT_REASON_REQUIRED"
  | "GIFT_SKU_REQUIRED"
  | "GIFT_SKU_NOT_FOUND"
  | "GIFT_SUPPLIER_UNRESOLVABLE"
  | "GIFT_QTY_INVALID"
  | "BUNDLE_REQUIRED"
  | "BUNDLE_NOT_FOUND"
  | "BUNDLE_QTY_INVALID"
  | "BUNDLE_DEAL_PRICE_INVALID"
  | "BUNDLE_COMPONENTS_MISSING"
  | "BUNDLE_COMPONENT_SKU_NOT_FOUND"
  | "BUNDLE_COMPONENT_SUPPLIER_UNRESOLVABLE"
  | "COD_NOT_SUPPORTED"
  | "INSURANCE_NOT_SUPPORTED"
  | "INSURANCE_AMOUNT_REQUIRED"
  | "DEPOSIT_REQUIRED"
  | "DEPOSIT_TOO_LARGE"
  | "LINES_REQUIRED";

export type TradeOrderWorkflowIssue = {
  code: TradeOrderWorkflowIssueCode;
  lineId?: string;
  message: string;
};

export type TradeOrderResolvedComponent = {
  componentKey: string;
  lineId: string;
  lineNo: number;
  componentSeq: number;
  itemType: "SKU" | "GIFT" | "BUNDLE";
  componentType: "GOODS" | "GIFT";
  componentSourceType: "DIRECT_SKU" | "GIFT_COMPONENT" | "BUNDLE_COMPONENT";
  productId: string;
  skuId: string;
  supplierId: string;
  supplierName: string;
  productName: string;
  skuName: string;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: number;
  listUnitPrice: number;
  dealUnitPrice: number;
  qty: number;
  listAmount: number;
  dealAmount: number;
  finalAmount: number;
  discountAmount: number;
  discountReason: string;
  remark: string;
  title: string;
  exportDisplayName: string;
  parentTitle: string;
  parentBundleId?: string;
  parentBundleCode?: string;
  parentBundleName?: string;
  parentBundleVersion?: number;
};

export type TradeOrderResolvedItem = {
  lineId: string;
  lineNo: number;
  itemType: "SKU" | "GIFT" | "BUNDLE";
  productId?: string;
  skuId?: string;
  bundleId?: string;
  bundleCode?: string;
  bundleName?: string;
  bundleVersion?: number;
  supplierIds: string[];
  supplierNames: string[];
  title: string;
  productName?: string;
  skuName?: string;
  listUnitPrice: number;
  dealUnitPrice: number;
  qty: number;
  listAmount: number;
  dealAmount: number;
  finalAmount: number;
  discountAmount: number;
  discountReason: string;
  remark: string;
  exportDisplayName: string;
  components: TradeOrderResolvedComponent[];
};

export type TradeOrderSupplierGroup = {
  supplierId: string;
  supplierName: string;
  lineCount: number;
  componentCount: number;
  skuLineCount: number;
  giftLineCount: number;
  bundleLineCount: number;
  bundleComponentCount: number;
  qtyTotal: number;
  goodsQtyTotal: number;
  giftQtyTotal: number;
  listAmount: number;
  dealAmount: number;
  finalAmount: number;
  discountAmount: number;
  depositAmount: number;
  collectedAmount: number;
  remainingAmount: number;
  codAmount: number;
  insuranceAmount: number;
  components: TradeOrderResolvedComponent[];
};

export type TradeOrderDraftComputation = {
  issues: TradeOrderWorkflowIssue[];
  items: TradeOrderResolvedItem[];
  components: TradeOrderResolvedComponent[];
  skuItems: TradeOrderResolvedItem[];
  giftItems: TradeOrderResolvedItem[];
  bundleItems: TradeOrderResolvedItem[];
  groups: TradeOrderSupplierGroup[];
  totals: {
    lineCount: number;
    skuLineCount: number;
    giftLineCount: number;
    bundleLineCount: number;
    qtyTotal: number;
    goodsQtyTotal: number;
    giftQtyTotal: number;
    listAmount: number;
    dealAmount: number;
    goodsAmount: number;
    discountAmount: number;
    finalAmount: number;
    depositAmount: number;
    collectedAmount: number;
    remainingAmount: number;
    codAmount: number;
    insuranceAmount: number;
  };
};

type DraftResolvedItem = Omit<TradeOrderResolvedItem, "lineNo">;

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toNumber(value: string | number | undefined | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function allocateAmountByWeight(total: number, weights: number[]) {
  if (weights.length === 0 || total <= 0) {
    return weights.map(() => 0);
  }

  const normalizedWeights = weights.map((weight) => Math.max(weight, 0));
  const weightSum = normalizedWeights.reduce((sum, value) => sum + value, 0);
  if (weightSum <= 0) {
    return weights.map(() => 0);
  }

  const cents = Math.round(total * 100);
  const provisional = normalizedWeights.map((weight) => {
    const exact = (weight / weightSum) * cents;
    return {
      base: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let allocated = provisional.reduce((sum, item) => sum + item.base, 0);
  const result = provisional.map((item) => item.base);

  const rankedIndexes = provisional
    .map((item, index) => ({ index, remainder: item.remainder }))
    .sort((left, right) => {
      if (right.remainder === left.remainder) {
        return left.index - right.index;
      }

      return right.remainder - left.remainder;
    });

  let cursor = 0;
  while (allocated < cents) {
    const target = rankedIndexes[cursor % rankedIndexes.length]?.index ?? 0;
    result[target] += 1;
    allocated += 1;
    cursor += 1;
  }

  return result.map((value) => roundCurrency(value / 100));
}

function createComponentKey(lineId: string, componentSeq: number) {
  return `${lineId}::${componentSeq}`;
}

function buildDirectSkuItem(line: TradeOrderLineInput, sku: TradeOrderSkuOption) {
  const pricing = calculateSalesOrderPricing({
    listUnitPrice: toNumber(sku.defaultUnitPrice),
    dealUnitPrice: Number(line.dealPrice),
    qty: Math.max(0, Number(line.qty)),
  });

  const discountReason = line.discountReason.trim();
  const title = `${sku.product.name} / ${sku.skuName}`;

  const component: TradeOrderResolvedComponent = {
    componentKey: createComponentKey(line.lineId, 1),
    lineId: line.lineId,
    lineNo: 0,
    componentSeq: 1,
    itemType: "SKU",
    componentType: "GOODS",
    componentSourceType: "DIRECT_SKU",
    productId: sku.product.id,
    skuId: sku.id,
    supplierId: sku.product.supplier.id,
    supplierName: sku.product.supplier.name,
    productName: sku.product.name,
    skuName: sku.skuName,
    codSupported: sku.codSupported,
    insuranceSupported: sku.insuranceSupported,
    defaultInsuranceAmount: toNumber(sku.defaultInsuranceAmount),
    listUnitPrice: pricing.listUnitPrice,
    dealUnitPrice: pricing.dealUnitPrice,
    qty: pricing.qty,
    listAmount: pricing.listAmount,
    dealAmount: pricing.dealAmount,
    finalAmount: pricing.finalAmount,
    discountAmount: pricing.discountAmount,
    discountReason,
    remark: discountReason,
    title,
    exportDisplayName: sku.product.name,
    parentTitle: title,
  };

  const item: DraftResolvedItem = {
    lineId: line.lineId,
    itemType: "SKU",
    productId: sku.product.id,
    skuId: sku.id,
    supplierIds: [sku.product.supplier.id],
    supplierNames: [sku.product.supplier.name],
    title,
    productName: sku.product.name,
    skuName: sku.skuName,
    listUnitPrice: pricing.listUnitPrice,
    dealUnitPrice: pricing.dealUnitPrice,
    qty: pricing.qty,
    listAmount: pricing.listAmount,
    dealAmount: pricing.dealAmount,
    finalAmount: pricing.finalAmount,
    discountAmount: pricing.discountAmount,
    discountReason,
    remark: discountReason,
    exportDisplayName: sku.product.name,
    components: [component],
  };

  return item;
}

function buildGiftItem(line: TradeOrderGiftLineInput, sku: TradeOrderSkuOption) {
  const title = `${sku.product.name} / ${sku.skuName}`;

  const component: TradeOrderResolvedComponent = {
    componentKey: createComponentKey(line.lineId, 1),
    lineId: line.lineId,
    lineNo: 0,
    componentSeq: 1,
    itemType: "GIFT",
    componentType: "GIFT",
    componentSourceType: "GIFT_COMPONENT",
    productId: sku.product.id,
    skuId: sku.id,
    supplierId: sku.product.supplier.id,
    supplierName: sku.product.supplier.name,
    productName: sku.product.name,
    skuName: sku.skuName,
    codSupported: false,
    insuranceSupported: false,
    defaultInsuranceAmount: 0,
    listUnitPrice: 0,
    dealUnitPrice: 0,
    qty: Math.max(0, Number(line.qty)),
    listAmount: 0,
    dealAmount: 0,
    finalAmount: 0,
    discountAmount: 0,
    discountReason: "",
    remark: line.remark.trim(),
    title,
    exportDisplayName: sku.product.name,
    parentTitle: title,
  };

  const item: DraftResolvedItem = {
    lineId: line.lineId,
    itemType: "GIFT",
    productId: sku.product.id,
    skuId: sku.id,
    supplierIds: [sku.product.supplier.id],
    supplierNames: [sku.product.supplier.name],
    title,
    productName: sku.product.name,
    skuName: sku.skuName,
    listUnitPrice: 0,
    dealUnitPrice: 0,
    qty: Math.max(0, Number(line.qty)),
    listAmount: 0,
    dealAmount: 0,
    finalAmount: 0,
    discountAmount: 0,
    discountReason: "",
    remark: line.remark.trim(),
    exportDisplayName: sku.product.name,
    components: [component],
  };

  return item;
}

function buildBundleItem(
  line: TradeOrderBundleLineInput,
  bundle: TradeOrderBundleOption,
) {
  const qty = Math.max(0, Number(line.qty));
  const listUnitPrice = roundCurrency(
    toNumber(bundle.defaultBundlePrice) > 0
      ? toNumber(bundle.defaultBundlePrice)
      : bundle.items.reduce(
          (sum, item) => sum + toNumber(item.defaultUnitPrice) * item.qty,
          0,
        ),
  );
  const pricing = calculateSalesOrderPricing({
    listUnitPrice,
    dealUnitPrice: Number(line.dealPrice),
    qty,
  });

  const parentTitle = `${bundle.name}（套餐）`;
  const baseWeights = bundle.items.map((item) =>
    roundCurrency(toNumber(item.defaultUnitPrice) * item.qty * qty),
  );
  const fallbackWeights = bundle.items.map((item) => item.qty * qty);
  const useFallbackWeights = baseWeights.every((weight) => weight <= 0);
  const allocationWeights = useFallbackWeights ? fallbackWeights : baseWeights;
  const listShares = allocateAmountByWeight(pricing.listAmount, allocationWeights);
  const dealShares = allocateAmountByWeight(pricing.finalAmount, allocationWeights);

  const components: TradeOrderResolvedComponent[] = bundle.items.map((item, index) => {
    const componentQty = item.qty * qty;
    const listAmount = listShares[index] ?? 0;
    const finalAmount = dealShares[index] ?? 0;
    const listUnit = componentQty > 0 ? roundCurrency(listAmount / componentQty) : 0;
    const dealUnit = componentQty > 0 ? roundCurrency(finalAmount / componentQty) : 0;

    return {
      componentKey: createComponentKey(line.lineId, index + 1),
      lineId: line.lineId,
      lineNo: 0,
      componentSeq: index + 1,
      itemType: "BUNDLE",
      componentType: "GOODS",
      componentSourceType: "BUNDLE_COMPONENT",
      productId: item.productId,
      skuId: item.skuId,
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      productName: item.productName,
      skuName: item.skuName,
      codSupported: item.codSupported,
      insuranceSupported: item.insuranceSupported,
      defaultInsuranceAmount: toNumber(item.defaultInsuranceAmount),
      listUnitPrice: listUnit,
      dealUnitPrice: dealUnit,
      qty: componentQty,
      listAmount,
      dealAmount: finalAmount,
      finalAmount,
      discountAmount: roundCurrency(listAmount - finalAmount),
      discountReason: "",
      remark: line.remark.trim(),
      title: `${bundle.name} / ${item.productName} / ${item.skuName}`,
      exportDisplayName: item.productName,
      parentTitle,
      parentBundleId: bundle.id,
      parentBundleCode: bundle.code,
      parentBundleName: bundle.name,
      parentBundleVersion: bundle.version,
    };
  });

  const item: DraftResolvedItem = {
    lineId: line.lineId,
    itemType: "BUNDLE",
    bundleId: bundle.id,
    bundleCode: bundle.code,
    bundleName: bundle.name,
    bundleVersion: bundle.version,
    supplierIds: [...new Set(bundle.items.map((item) => item.supplierId))],
    supplierNames: [...new Set(bundle.items.map((item) => item.supplierName))],
    title: parentTitle,
    listUnitPrice: pricing.listUnitPrice,
    dealUnitPrice: pricing.dealUnitPrice,
    qty: pricing.qty,
    listAmount: pricing.listAmount,
    dealAmount: pricing.dealAmount,
    finalAmount: pricing.finalAmount,
    discountAmount: pricing.discountAmount,
    discountReason: "",
    remark: line.remark.trim(),
    exportDisplayName: bundle.name,
    components,
  };

  return item;
}

function withLineNumbers(items: DraftResolvedItem[]) {
  return items.map((item, index) => {
    const lineNo = index + 1;
    return {
      ...item,
      lineNo,
      components: item.components.map((component) => ({
        ...component,
        lineNo,
      })),
    };
  });
}

export function buildTradeOrderDraftComputation(input: {
  lines: TradeOrderLineInput[];
  giftLines: TradeOrderGiftLineInput[];
  bundleLines: TradeOrderBundleLineInput[];
  skuOptions: TradeOrderSkuOption[];
  bundleOptions: TradeOrderBundleOption[];
  paymentScheme: SalesOrderPaymentSchemeValue;
  depositAmount: number;
  insuranceRequired: boolean;
  insuranceAmount: number;
}) {
  const issues: TradeOrderWorkflowIssue[] = [];
  const skuMap = new Map(input.skuOptions.map((sku) => [sku.id, sku]));
  const bundleMap = new Map(input.bundleOptions.map((bundle) => [bundle.id, bundle]));
  const resolvedSkuItems: DraftResolvedItem[] = [];
  const resolvedGiftItems: DraftResolvedItem[] = [];
  const resolvedBundleItems: DraftResolvedItem[] = [];

  for (const [index, rawLine] of input.lines.entries()) {
    const lineId = rawLine.lineId || `line-${index + 1}`;
    const qty = Math.max(0, Number(rawLine.qty));
    const dealPrice = Number(rawLine.dealPrice);

    if (!rawLine.skuId) {
      issues.push({
        code: "LINE_SKU_REQUIRED",
        lineId,
        message: "Please select a SKU.",
      });
      continue;
    }

    const sku = skuMap.get(rawLine.skuId);
    if (!sku) {
      issues.push({
        code: "LINE_SKU_NOT_FOUND",
        lineId,
        message: "Selected SKU is unavailable.",
      });
      continue;
    }

    if (!sku.product?.supplier?.id) {
      issues.push({
        code: "LINE_SUPPLIER_UNRESOLVABLE",
        lineId,
        message: "Selected SKU cannot resolve a supplier.",
      });
      continue;
    }

    if (!Number.isFinite(qty) || qty < 1) {
      issues.push({
        code: "LINE_QTY_INVALID",
        lineId,
        message: "Quantity must be at least 1.",
      });
      continue;
    }

    if (!Number.isFinite(dealPrice) || dealPrice < 0) {
      issues.push({
        code: "LINE_DEAL_PRICE_INVALID",
        lineId,
        message: "Deal price cannot be negative.",
      });
      continue;
    }

    const item = buildDirectSkuItem({ ...rawLine, lineId, qty, dealPrice }, sku);

    if (item.dealUnitPrice < item.listUnitPrice && !item.discountReason) {
      issues.push({
        code: "DISCOUNT_REASON_REQUIRED",
        lineId,
        message: "Discount reason is required when deal price is below list price.",
      });
    }

    if (
      (input.paymentScheme === "FULL_COD" || input.paymentScheme === "DEPOSIT_PLUS_COD") &&
      !sku.codSupported
    ) {
      issues.push({
        code: "COD_NOT_SUPPORTED",
        lineId,
        message: `${sku.product.name} / ${sku.skuName} does not support COD.`,
      });
    }

    if (input.insuranceRequired && !sku.insuranceSupported) {
      issues.push({
        code: "INSURANCE_NOT_SUPPORTED",
        lineId,
        message: `${sku.product.name} / ${sku.skuName} does not support insurance.`,
      });
    }

    resolvedSkuItems.push(item);
  }

  for (const [index, rawLine] of input.giftLines.entries()) {
    const lineId = rawLine.lineId || `gift-${index + 1}`;
    const qty = Math.max(0, Number(rawLine.qty));

    if (!rawLine.skuId) {
      issues.push({
        code: "GIFT_SKU_REQUIRED",
        lineId,
        message: "Please select a standard SKU for the gift line.",
      });
      continue;
    }

    const sku = skuMap.get(rawLine.skuId);
    if (!sku) {
      issues.push({
        code: "GIFT_SKU_NOT_FOUND",
        lineId,
        message: "Selected gift SKU is unavailable.",
      });
      continue;
    }

    if (!sku.product?.supplier?.id) {
      issues.push({
        code: "GIFT_SUPPLIER_UNRESOLVABLE",
        lineId,
        message: "Selected gift SKU cannot resolve a supplier.",
      });
      continue;
    }

    if (!Number.isFinite(qty) || qty < 1) {
      issues.push({
        code: "GIFT_QTY_INVALID",
        lineId,
        message: "Gift quantity must be at least 1.",
      });
      continue;
    }

    resolvedGiftItems.push(buildGiftItem({ ...rawLine, lineId, qty }, sku));
  }

  for (const [index, rawLine] of input.bundleLines.entries()) {
    const lineId = rawLine.lineId || `bundle-${index + 1}`;
    const qty = Math.max(0, Number(rawLine.qty));
    const dealPrice = Number(rawLine.dealPrice);

    if (!rawLine.bundleId) {
      issues.push({
        code: "BUNDLE_REQUIRED",
        lineId,
        message: "Please select a bundle.",
      });
      continue;
    }

    const bundle = bundleMap.get(rawLine.bundleId);
    if (!bundle) {
      issues.push({
        code: "BUNDLE_NOT_FOUND",
        lineId,
        message: "Selected bundle is unavailable.",
      });
      continue;
    }

    if (!Number.isFinite(qty) || qty < 1) {
      issues.push({
        code: "BUNDLE_QTY_INVALID",
        lineId,
        message: "Bundle quantity must be at least 1.",
      });
      continue;
    }

    if (!Number.isFinite(dealPrice) || dealPrice < 0) {
      issues.push({
        code: "BUNDLE_DEAL_PRICE_INVALID",
        lineId,
        message: "Bundle deal price cannot be negative.",
      });
      continue;
    }

    if (bundle.items.length === 0) {
      issues.push({
        code: "BUNDLE_COMPONENTS_MISSING",
        lineId,
        message: "Selected bundle has no active components.",
      });
      continue;
    }

    const invalidComponent = bundle.items.find(
      (item) => !item.supplierId || !item.skuId || !item.productId,
    );
    if (invalidComponent) {
      issues.push({
        code: "BUNDLE_COMPONENT_SUPPLIER_UNRESOLVABLE",
        lineId,
        message: "Selected bundle contains an invalid component.",
      });
      continue;
    }

    const item = buildBundleItem({ ...rawLine, lineId, qty, dealPrice }, bundle);

    if (
      (input.paymentScheme === "FULL_COD" || input.paymentScheme === "DEPOSIT_PLUS_COD") &&
      item.components.some((component) => !component.codSupported)
    ) {
      issues.push({
        code: "COD_NOT_SUPPORTED",
        lineId,
        message: `${bundle.name} contains components that do not support COD.`,
      });
    }

    if (
      input.insuranceRequired &&
      item.components.some((component) => !component.insuranceSupported)
    ) {
      issues.push({
        code: "INSURANCE_NOT_SUPPORTED",
        lineId,
        message: `${bundle.name} contains components that do not support insurance.`,
      });
    }

    resolvedBundleItems.push(item);
  }

  const resolvedItems = withLineNumbers([
    ...resolvedSkuItems,
    ...resolvedGiftItems,
    ...resolvedBundleItems,
  ]);
  const resolvedSkuLineItems = resolvedItems.filter((item) => item.itemType === "SKU");
  const resolvedGiftLineItems = resolvedItems.filter((item) => item.itemType === "GIFT");
  const resolvedBundleLineItems = resolvedItems.filter((item) => item.itemType === "BUNDLE");
  const resolvedComponents = resolvedItems.flatMap((item) => item.components);

  if (resolvedItems.length === 0) {
    issues.push({
      code: "LINES_REQUIRED",
      message: "At least one SKU, gift, or bundle line is required.",
    });
  }

  const payableItems = resolvedItems.filter((item) => item.itemType !== "GIFT");
  const moneyTotals = payableItems.reduce(
    (summary, item) => ({
      listAmount: roundCurrency(summary.listAmount + item.listAmount),
      dealAmount: roundCurrency(summary.dealAmount + item.dealAmount),
      goodsAmount: roundCurrency(summary.goodsAmount + item.finalAmount),
      discountAmount: roundCurrency(summary.discountAmount + item.discountAmount),
      finalAmount: roundCurrency(summary.finalAmount + item.finalAmount),
    }),
    {
      listAmount: 0,
      dealAmount: 0,
      goodsAmount: 0,
      discountAmount: 0,
      finalAmount: 0,
    },
  );
  const hasPayableItems = payableItems.length > 0;

  if (hasPayableItems && input.insuranceRequired && toNumber(input.insuranceAmount) <= 0) {
    issues.push({
      code: "INSURANCE_AMOUNT_REQUIRED",
      message: "Insurance amount is required when insurance is enabled.",
    });
  }

  if (hasPayableItems && paymentSchemeRequiresDeposit(input.paymentScheme)) {
    if (input.depositAmount <= 0) {
      issues.push({
        code: "DEPOSIT_REQUIRED",
        message: "Deposit is required for the selected payment scheme.",
      });
    }

    if (moneyTotals.finalAmount > 0 && input.depositAmount >= moneyTotals.finalAmount) {
      issues.push({
        code: "DEPOSIT_TOO_LARGE",
        message: "Deposit must be smaller than the final amount.",
      });
    }
  }

  const overallPayment = calculateSalesOrderPaymentBreakdown({
    paymentScheme: input.paymentScheme,
    finalAmount: moneyTotals.finalAmount,
    depositAmount: hasPayableItems ? input.depositAmount : 0,
  });

  const supplierGroups = new Map<
    string,
    TradeOrderSupplierGroup & {
      skuLineIds: Set<string>;
      giftLineIds: Set<string>;
      bundleLineIds: Set<string>;
    }
  >();

  for (const component of resolvedComponents) {
    const existingGroup = supplierGroups.get(component.supplierId);
    if (!existingGroup) {
      const nextGroup: TradeOrderSupplierGroup & {
        skuLineIds: Set<string>;
        giftLineIds: Set<string>;
        bundleLineIds: Set<string>;
      } = {
        supplierId: component.supplierId,
        supplierName: component.supplierName,
        lineCount: 0,
        componentCount: 1,
        skuLineCount: 0,
        giftLineCount: 0,
        bundleLineCount: 0,
        bundleComponentCount: component.itemType === "BUNDLE" ? 1 : 0,
        qtyTotal: component.qty,
        goodsQtyTotal: component.componentType === "GOODS" ? component.qty : 0,
        giftQtyTotal: component.componentType === "GIFT" ? component.qty : 0,
        listAmount: component.componentType === "GOODS" ? component.listAmount : 0,
        dealAmount: component.componentType === "GOODS" ? component.dealAmount : 0,
        finalAmount: component.componentType === "GOODS" ? component.finalAmount : 0,
        discountAmount: component.componentType === "GOODS" ? component.discountAmount : 0,
        depositAmount: 0,
        collectedAmount: 0,
        remainingAmount: 0,
        codAmount: 0,
        insuranceAmount: 0,
        components: [component],
        skuLineIds: new Set(),
        giftLineIds: new Set(),
        bundleLineIds: new Set(),
      };

      if (component.itemType === "SKU") {
        nextGroup.skuLineIds.add(component.lineId);
      } else if (component.itemType === "GIFT") {
        nextGroup.giftLineIds.add(component.lineId);
      } else {
        nextGroup.bundleLineIds.add(component.lineId);
      }

      nextGroup.lineCount =
        nextGroup.skuLineIds.size + nextGroup.giftLineIds.size + nextGroup.bundleLineIds.size;
      nextGroup.skuLineCount = nextGroup.skuLineIds.size;
      nextGroup.giftLineCount = nextGroup.giftLineIds.size;
      nextGroup.bundleLineCount = nextGroup.bundleLineIds.size;

      supplierGroups.set(component.supplierId, nextGroup);
      continue;
    }

    existingGroup.componentCount += 1;
    existingGroup.bundleComponentCount += component.itemType === "BUNDLE" ? 1 : 0;
    existingGroup.qtyTotal += component.qty;
    existingGroup.goodsQtyTotal += component.componentType === "GOODS" ? component.qty : 0;
    existingGroup.giftQtyTotal += component.componentType === "GIFT" ? component.qty : 0;
    existingGroup.listAmount = roundCurrency(
      existingGroup.listAmount +
        (component.componentType === "GOODS" ? component.listAmount : 0),
    );
    existingGroup.dealAmount = roundCurrency(
      existingGroup.dealAmount +
        (component.componentType === "GOODS" ? component.dealAmount : 0),
    );
    existingGroup.finalAmount = roundCurrency(
      existingGroup.finalAmount +
        (component.componentType === "GOODS" ? component.finalAmount : 0),
    );
    existingGroup.discountAmount = roundCurrency(
      existingGroup.discountAmount +
        (component.componentType === "GOODS" ? component.discountAmount : 0),
    );
    existingGroup.components.push(component);

    if (component.itemType === "SKU") {
      existingGroup.skuLineIds.add(component.lineId);
    } else if (component.itemType === "GIFT") {
      existingGroup.giftLineIds.add(component.lineId);
    } else {
      existingGroup.bundleLineIds.add(component.lineId);
    }

    existingGroup.lineCount =
      existingGroup.skuLineIds.size +
      existingGroup.giftLineIds.size +
      existingGroup.bundleLineIds.size;
    existingGroup.skuLineCount = existingGroup.skuLineIds.size;
    existingGroup.giftLineCount = existingGroup.giftLineIds.size;
    existingGroup.bundleLineCount = existingGroup.bundleLineIds.size;
  }

  const groups = [...supplierGroups.values()]
    .sort((left, right) => left.supplierName.localeCompare(right.supplierName, "zh-CN"))
    .map((supplierGroup) => ({
      supplierId: supplierGroup.supplierId,
      supplierName: supplierGroup.supplierName,
      lineCount: supplierGroup.lineCount,
      componentCount: supplierGroup.componentCount,
      skuLineCount: supplierGroup.skuLineCount,
      giftLineCount: supplierGroup.giftLineCount,
      bundleLineCount: supplierGroup.bundleLineCount,
      bundleComponentCount: supplierGroup.bundleComponentCount,
      qtyTotal: supplierGroup.qtyTotal,
      goodsQtyTotal: supplierGroup.goodsQtyTotal,
      giftQtyTotal: supplierGroup.giftQtyTotal,
      listAmount: supplierGroup.listAmount,
      dealAmount: supplierGroup.dealAmount,
      finalAmount: supplierGroup.finalAmount,
      discountAmount: supplierGroup.discountAmount,
      depositAmount: supplierGroup.depositAmount,
      collectedAmount: supplierGroup.collectedAmount,
      remainingAmount: supplierGroup.remainingAmount,
      codAmount: supplierGroup.codAmount,
      insuranceAmount: supplierGroup.insuranceAmount,
      components: supplierGroup.components,
    }));

  const weightList = groups.map((group) => group.finalAmount);
  const depositShares = allocateAmountByWeight(overallPayment.depositAmount, weightList);
  const collectedShares = allocateAmountByWeight(
    overallPayment.collectedAmount,
    weightList,
  );
  const remainingShares = allocateAmountByWeight(
    overallPayment.remainingAmount,
    weightList,
  );
  const codShares = allocateAmountByWeight(overallPayment.codAmount, weightList);
  const insuranceTotal =
    hasPayableItems && input.insuranceRequired ? toNumber(input.insuranceAmount) : 0;
  const insuranceShares = allocateAmountByWeight(insuranceTotal, weightList);

  for (const [index, group] of groups.entries()) {
    group.depositAmount = depositShares[index] ?? 0;
    group.collectedAmount = collectedShares[index] ?? 0;
    group.remainingAmount = remainingShares[index] ?? 0;
    group.codAmount = codShares[index] ?? 0;
    group.insuranceAmount = insuranceShares[index] ?? 0;
  }

  return {
    issues,
    items: resolvedItems,
    components: resolvedComponents,
    skuItems: resolvedSkuLineItems,
    giftItems: resolvedGiftLineItems,
    bundleItems: resolvedBundleLineItems,
    groups,
    totals: {
      lineCount: resolvedItems.length,
      skuLineCount: resolvedSkuLineItems.length,
      giftLineCount: resolvedGiftLineItems.length,
      bundleLineCount: resolvedBundleLineItems.length,
      qtyTotal: resolvedComponents.reduce((sum, component) => sum + component.qty, 0),
      goodsQtyTotal: resolvedComponents
        .filter((component) => component.componentType === "GOODS")
        .reduce((sum, component) => sum + component.qty, 0),
      giftQtyTotal: resolvedGiftLineItems.reduce((sum, item) => sum + item.qty, 0),
      ...moneyTotals,
      depositAmount: overallPayment.depositAmount,
      collectedAmount: overallPayment.collectedAmount,
      remainingAmount: overallPayment.remainingAmount,
      codAmount: overallPayment.codAmount,
      insuranceAmount: insuranceTotal,
    },
  } satisfies TradeOrderDraftComputation;
}

export function isTradeOrderDraftReadyForSubmit(
  computation: TradeOrderDraftComputation,
) {
  return computation.items.length > 0 && computation.issues.length === 0;
}

export {
  allocateAmountByWeight,
  calculateSalesOrderPaymentBreakdown,
  mapPaymentSchemeToLegacyPaymentMode,
  paymentSchemeRequiresDeposit,
  type SalesOrderPaymentSchemeValue as TradeOrderPaymentSchemeValue,
};
