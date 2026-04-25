type ShippingProductSummaryItem = {
  skuNameSnapshot: string;
  specSnapshot: string;
};

function normalizeSummaryValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function getExportSpecName(item: ShippingProductSummaryItem) {
  return (
    normalizeSummaryValue(item.specSnapshot) ||
    normalizeSummaryValue(item.skuNameSnapshot)
  );
}

export function buildShippingProductSummary(items: ShippingProductSummaryItem[]) {
  const specNames = items.map(getExportSpecName).filter(Boolean);
  const uniqueSpecNames = [...new Set(specNames)];

  return uniqueSpecNames.join("+");
}
