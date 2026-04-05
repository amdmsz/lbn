export type LogisticsBadgeVariant = "neutral" | "info" | "success" | "warning" | "danger";

export type LogisticsProviderOption = {
  code: string;
  label: string;
  aliases: string[];
};

export const COMMON_LOGISTICS_PROVIDERS: LogisticsProviderOption[] = [
  { code: "SF", label: "顺丰速运", aliases: ["顺丰", "顺丰速运", "sf", "shunfeng"] },
  { code: "JD", label: "京东物流", aliases: ["京东", "京东物流", "jd", "jingdong"] },
  { code: "ZTO", label: "中通快递", aliases: ["中通", "中通快递", "zto"] },
  { code: "YTO", label: "圆通速递", aliases: ["圆通", "圆通速递", "yto"] },
  { code: "STO", label: "申通快递", aliases: ["申通", "申通快递", "sto"] },
  { code: "YUNDA", label: "韵达快递", aliases: ["韵达", "韵达快递", "yd", "yunda"] },
  { code: "JT", label: "极兔速递", aliases: ["极兔", "极兔速递", "jt", "jitu"] },
  { code: "EMS", label: "中国邮政 EMS", aliases: ["邮政", "ems", "中国邮政", "邮政ems"] },
  { code: "DBKD", label: "德邦快递", aliases: ["德邦", "德邦快递", "deppon", "dbkd", "dbl"] },
  { code: "HTKY", label: "百世快递", aliases: ["百世", "百世快递", "best", "htky", "bestjt"] },
  { code: "TTKDEX", label: "天天快递", aliases: ["天天", "天天快递", "ttkd", "ttkdex"] },
];

export type LogisticsTraceMode =
  | "remote"
  | "missing_tracking"
  | "not_configured"
  | "query_failed";

function normalizeProviderText(value: string) {
  return value.replace(/\s+/g, "").trim().toLowerCase();
}

export function inferLogisticsCarrierCode(
  shippingProvider?: string | null,
  carrier?: string | null,
) {
  const candidate = carrier?.trim() || shippingProvider?.trim();
  if (!candidate) {
    return null;
  }

  const normalized = normalizeProviderText(candidate);
  const exactOption = COMMON_LOGISTICS_PROVIDERS.find(
    (option) => option.code.toLowerCase() === normalized,
  );
  if (exactOption) {
    return exactOption.code;
  }

  const matched = COMMON_LOGISTICS_PROVIDERS.find((option) =>
    option.aliases.some((alias) => normalizeProviderText(alias) === normalized),
  );
  if (matched) {
    return matched.code;
  }

  const fuzzyMatched = COMMON_LOGISTICS_PROVIDERS.find((option) =>
    option.aliases.some((alias) => normalized.includes(normalizeProviderText(alias))),
  );

  return fuzzyMatched?.code ?? null;
}

export function getLogisticsCarrierLabel(
  shippingProvider?: string | null,
  carrierCode?: string | null,
) {
  if (shippingProvider?.trim()) {
    return shippingProvider.trim();
  }

  const matched = COMMON_LOGISTICS_PROVIDERS.find((option) => option.code === carrierCode);
  return matched?.label ?? "未知承运商";
}

export function getNormalizedTrackingNumber(trackingNumber?: string | null) {
  if (!trackingNumber?.trim()) {
    return null;
  }

  return trackingNumber.replace(/\s+/g, "").trim();
}

export function getTrackingTail(trackingNumber?: string | null) {
  const normalizedTrackingNumber = getNormalizedTrackingNumber(trackingNumber);
  if (!normalizedTrackingNumber) {
    return null;
  }

  return normalizedTrackingNumber.length <= 4
    ? normalizedTrackingNumber
    : normalizedTrackingNumber.slice(-4);
}

export function getTrackingDisplayText(trackingNumber?: string | null) {
  const tail = getTrackingTail(trackingNumber);
  return tail ?? "未回填单号";
}

export function maskTrackingNumber(trackingNumber?: string | null) {
  return getTrackingDisplayText(trackingNumber);
}

export function getReceiverPhoneTail(phone?: string | null) {
  if (!phone?.trim()) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function getLogisticsStatusMeta(statusCode?: string | null, fallbackLabel?: string | null) {
  switch ((statusCode ?? "").toUpperCase()) {
    case "SIGN":
    case "SIGNED":
      return { label: "已签收", variant: "success" as LogisticsBadgeVariant };
    case "DISPATCH":
    case "DELIVERING":
      return { label: "派送中", variant: "warning" as LogisticsBadgeVariant };
    case "TRANSPORT":
    case "IN_TRANSIT":
      return { label: "运输中", variant: "info" as LogisticsBadgeVariant };
    case "COLLECT":
    case "ACCEPT":
      return { label: "已揽收", variant: "info" as LogisticsBadgeVariant };
    case "RETURN":
    case "REJECT":
      return { label: "退回 / 异常", variant: "danger" as LogisticsBadgeVariant };
    case "PROBLEM":
    case "FAIL":
      return { label: "查询失败", variant: "danger" as LogisticsBadgeVariant };
    default:
      return {
        label: fallbackLabel?.trim() || "暂无轨迹",
        variant: "neutral" as LogisticsBadgeVariant,
      };
  }
}

export function getLogisticsServiceModeMeta(mode?: LogisticsTraceMode | null) {
  switch (mode) {
    case "not_configured":
      return { label: "未配置物流服务", variant: "neutral" as LogisticsBadgeVariant };
    case "query_failed":
      return { label: "查询失败", variant: "danger" as LogisticsBadgeVariant };
    case "missing_tracking":
      return { label: "暂无轨迹", variant: "neutral" as LogisticsBadgeVariant };
    default:
      return null;
  }
}

export function getShippingLogisticsStatusMeta(input: {
  shippingStatus?: string | null;
  trackingNumber?: string | null;
  traceMode?: LogisticsTraceMode | null;
  traceStatusCode?: string | null;
  traceStatusLabel?: string | null;
}) {
  const serviceModeMeta = getLogisticsServiceModeMeta(input.traceMode);
  if (serviceModeMeta) {
    return serviceModeMeta;
  }

  if (input.traceStatusCode || input.traceStatusLabel) {
    return getLogisticsStatusMeta(input.traceStatusCode, input.traceStatusLabel);
  }

  if (!input.trackingNumber?.trim()) {
    return { label: "暂无轨迹", variant: "neutral" as LogisticsBadgeVariant };
  }

  switch ((input.shippingStatus ?? "").toUpperCase()) {
    case "DELIVERED":
    case "COMPLETED":
      return { label: "已签收", variant: "success" as LogisticsBadgeVariant };
    case "SHIPPED":
      return { label: "运输中", variant: "info" as LogisticsBadgeVariant };
    default:
      return { label: "运输中", variant: "info" as LogisticsBadgeVariant };
  }
}

export function getShippingLogisticsSummaryText(input: {
  shippingProvider?: string | null;
  carrierCode?: string | null;
  trackingNumber?: string | null;
}) {
  return `${getLogisticsCarrierLabel(input.shippingProvider, input.carrierCode)} / ${maskTrackingNumber(
    input.trackingNumber,
  )}`;
}
