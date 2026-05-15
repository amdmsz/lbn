export function parseTradeOrderDateTimeInput(value: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTradeOrderDateTimeInputValue(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function normalizeTradeOrderDateTimeInput(value: string) {
  const parsed = parseTradeOrderDateTimeInput(value);
  return parsed ? formatTradeOrderDateTimeInputValue(parsed) : "";
}

export function formatTradeOrderDateTimeRangeLabel(
  from: string,
  to: string,
  formatDateTime: (value: Date) => string,
) {
  const fromDate = parseTradeOrderDateTimeInput(from);
  const toDate = parseTradeOrderDateTimeInput(to);
  const fromLabel = fromDate ? formatDateTime(fromDate) : "";
  const toLabel = toDate ? formatDateTime(toDate) : "";

  if (!fromLabel && !toLabel) {
    return "全部下单时间";
  }

  if (fromLabel && toLabel) {
    return `${fromLabel} - ${toLabel}`;
  }

  if (fromLabel) {
    return `自 ${fromLabel}`;
  }

  return `至 ${toLabel}`;
}
