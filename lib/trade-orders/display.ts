function normalizeDisplayText(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function formatTradeOrderQuantity(qty: number, unitSnapshot?: string | null) {
  const unit = normalizeDisplayText(unitSnapshot);
  return unit ? `${qty}${unit}` : `${qty}`;
}

export function formatTradeOrderLineSummary(input: {
  titleSnapshot?: string | null;
  exportDisplayNameSnapshot?: string | null;
  productNameSnapshot?: string | null;
  skuNameSnapshot?: string | null;
  specSnapshot?: string | null;
  qty: number;
  unitSnapshot?: string | null;
}) {
  const label =
    normalizeDisplayText(input.exportDisplayNameSnapshot) ||
    normalizeDisplayText(input.productNameSnapshot) ||
    normalizeDisplayText(input.titleSnapshot) ||
    normalizeDisplayText(input.skuNameSnapshot) ||
    "未命名商品";
  const spec = normalizeDisplayText(input.specSnapshot);
  const quantity = formatTradeOrderQuantity(input.qty, input.unitSnapshot);

  return `${label}${spec ? `【${spec}】` : ""}（*${quantity}）`;
}
