type ShippingExportProductInput = {
  id: string;
  exportDisplayNameSnapshot: string | null;
  productNameSnapshot: string;
  skuNameSnapshot: string;
  specSnapshot: string;
  qty: number;
  remark: string | null;
};

type ShippingTaskExportSnapshotInput = {
  codAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
  salesOrderRemark: string | null;
  tradeOrderRemark: string | null;
  shippingTaskRemark: string | null;
  items: ShippingExportProductInput[];
};

export type ShippingTaskProductExportSnapshot = {
  sourceItemId: string;
  itemSequence: number;
  productSummarySnapshot: string;
  pieceCountSnapshot: number;
  codAmountSnapshot: string;
  insuranceRequiredSnapshot: boolean;
  insuranceAmountSnapshot: string;
  remarkSnapshot: string | null;
};

function normalizeSnapshotText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function getProductExportName(item: ShippingExportProductInput) {
  return (
    normalizeSnapshotText(item.specSnapshot) ||
    normalizeSnapshotText(item.skuNameSnapshot) ||
    normalizeSnapshotText(item.exportDisplayNameSnapshot) ||
    normalizeSnapshotText(item.productNameSnapshot) ||
    "未命名商品"
  );
}

function buildRemarkSnapshot(input: {
  itemRemark: string | null;
  salesOrderRemark: string | null;
  tradeOrderRemark: string | null;
  shippingTaskRemark: string | null;
}) {
  const seenValues = new Set<string>();
  const parts: string[] = [];

  const append = (label: string, value: string | null) => {
    const normalized = normalizeSnapshotText(value);
    if (!normalized || seenValues.has(normalized)) {
      return;
    }

    seenValues.add(normalized);
    parts.push(`${label}：${normalized}`);
  };

  append("商品备注", input.itemRemark);
  append("订单备注", input.salesOrderRemark);
  append("父单备注", input.tradeOrderRemark);
  append("发货备注", input.shippingTaskRemark);

  return parts.length > 0 ? parts.join("；") : null;
}

export function buildShippingTaskProductExportSnapshots(
  input: ShippingTaskExportSnapshotInput,
): ShippingTaskProductExportSnapshot[] {
  return input.items.map((item, itemSequence) => {
    const carriesOrderAmounts = itemSequence === 0;

    return {
      sourceItemId: item.id,
      itemSequence,
      productSummarySnapshot: getProductExportName(item),
      pieceCountSnapshot: item.qty,
      codAmountSnapshot: carriesOrderAmounts ? input.codAmount : "0",
      insuranceRequiredSnapshot: carriesOrderAmounts
        ? input.insuranceRequired
        : false,
      insuranceAmountSnapshot: carriesOrderAmounts
        ? input.insuranceAmount
        : "0",
      remarkSnapshot: buildRemarkSnapshot({
        itemRemark: item.remark,
        salesOrderRemark: input.salesOrderRemark,
        tradeOrderRemark: input.tradeOrderRemark,
        shippingTaskRemark: input.shippingTaskRemark,
      }),
    };
  });
}
