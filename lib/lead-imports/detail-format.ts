import type { Prisma } from "@prisma/client";
import {
  formatImportDateTime,
  isLeadImportBatchRollbackMode,
  type CustomerContinuationImportSummary,
  type LeadImportBatchRollbackMode,
  type LeadImportMappingConfig,
} from "@/lib/lead-imports/metadata";
import type { getLeadImportDetailData } from "@/lib/lead-imports/queries";

export type LeadImportDetailData = NonNullable<
  Awaited<ReturnType<typeof getLeadImportDetailData>>
>;
export type LeadImportDetailRow = LeadImportDetailData["rows"][number];
export type DuplicateReplacementSalesOption =
  LeadImportDetailData["duplicateReplacementSalesOptions"][number];

export function getHeaders(value: Prisma.JsonValue | null) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function getMapping(value: Prisma.JsonValue | null): LeadImportMappingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as LeadImportMappingConfig;
}

export function formatLeadMappedPreview(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  const previewKeys = [
    ["phone", "手机号"],
    ["name", "姓名"],
    ["address", "地址"],
    ["interestedProduct", "意向商品"],
    ["interestedAmount", "意向金额"],
    ["interestedAt", "意向时间"],
    ["campaignName", "活动标记"],
    ["sourceDetail", "来源详情"],
  ] as const;
  const entries = previewKeys.flatMap(([key, label]) => {
    const item = value[key];
    if (typeof item !== "string" || item.trim().length === 0) {
      return [];
    }

    // interestedAt 存的是 ISO 文本, 展示时转回本地可读时间
    const text = key === "interestedAt" ? formatOptionalDateTime(item) : item;
    return text !== "-" ? [`${label}: ${text}`] : [];
  });

  return entries.length > 0 ? entries.join(" / ") : "-";
}

export function getLeadMappedRemark(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  return typeof value.remark === "string" && value.remark.trim().length > 0
    ? value.remark
    : "-";
}

export function formatSummaryValue(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

export function formatOptionalDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : formatImportDateTime(date);
}

export function formatCustomerContinuationSummary(summary: CustomerContinuationImportSummary) {
  return [
    summary.latestPurchasedProduct ? `最近购买：${summary.latestPurchasedProduct}` : null,
    summary.latestIntent ? `最近意向：${summary.latestIntent}` : null,
    summary.latestFollowUpAt ? `最近跟进：${summary.latestFollowUpAt}` : null,
    summary.note ? `备注：${summary.note}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
}

export function getOwnerOutcomeLabel(value: string) {
  switch (value) {
    case "ASSIGNED":
      return "已匹配负责人";
    case "KEPT_EXISTING":
      return "保留原负责人";
    case "PUBLIC_POOL":
      return "进入公海";
    case "UNRESOLVED":
      return "负责人未识别";
    default:
      return value;
  }
}

export function buildDetailHref(
  batchId: string,
  mode: LeadImportDetailData["mode"],
  rollbackMode: LeadImportBatchRollbackMode,
) {
  const params = new URLSearchParams();

  if (mode === "customer_continuation") {
    params.set("mode", "customer_continuation");
  }
  if (mode === "lead" && rollbackMode !== "AUDIT_PRESERVED") {
    params.set("rollbackMode", rollbackMode);
  }

  const query = params.toString();
  return query ? `/lead-imports/${batchId}?${query}` : `/lead-imports/${batchId}`;
}

export function buildNoticeHref(href: string, status: "success" | "error", message: string) {
  const [pathname, queryString = ""] = href.split("?");
  const params = new URLSearchParams(queryString);
  params.set("noticeStatus", status);
  params.set("noticeMessage", message);
  return `${pathname}?${params.toString()}`;
}

export function getRequestedRollbackMode(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): LeadImportBatchRollbackMode {
  const value = Array.isArray(searchParams?.rollbackMode)
    ? searchParams.rollbackMode[0]
    : searchParams?.rollbackMode;

  return value && isLeadImportBatchRollbackMode(value)
    ? value
    : "AUDIT_PRESERVED";
}

export function getRowCustomerSnapshot(row: LeadImportDetailRow) {
  const customerRemoved =
    row.rollback.execution?.outcome === "CUSTOMER_DELETED" ||
    row.rollback.execution?.outcome === "CUSTOMER_ALREADY_REMOVED";

  if (row.customerContinuation) {
    return {
      name:
        row.customerContinuation.result.customerName ??
        row.mappedName ??
        row.phoneRaw ??
        "-",
      phone: row.normalizedPhone ?? row.phoneRaw ?? "-",
      href:
        !customerRemoved && row.customerContinuation.result.customerId
          ? `/customers/${row.customerContinuation.result.customerId}`
          : null,
      helper: customerRemoved ? "客户已删除，当前展示导入快照" : null,
    };
  }

  if (row.duplicateCustomer) {
    return {
      name: row.duplicateCustomer.name,
      phone: row.duplicateCustomer.phone,
      href: `/customers/${row.duplicateCustomer.customerId}`,
      helper: `${row.duplicateCustomer.executionClassLabel} / ${row.duplicateCustomer.ownershipLabel}`,
    };
  }

  const liveCustomer = row.customerMerge?.customer ?? null;

  return {
    name:
      liveCustomer?.name ??
      row.mappedName ??
      row.customerMerge?.note ??
      row.phoneRaw ??
      "-",
    phone:
      liveCustomer?.phone ??
      row.customerMerge?.phone ??
      row.normalizedPhone ??
      row.phoneRaw ??
      "-",
    href:
      !customerRemoved && liveCustomer?.id ? `/customers/${liveCustomer.id}` : null,
    helper:
      customerRemoved || !liveCustomer
        ? "客户已删除或已脱离 live relation，当前展示导入快照"
        : null,
  };
}

export function getRollbackActionSummary(row: LeadImportDetailRow) {
  const preview = row.rollback.preview;
  if (!preview) return null;

  const parts: string[] = [];

  if (preview.customerAction === "DELETE") {
    parts.push("删除本批新建客户");
  } else if (preview.customerAction === "ALREADY_REMOVED") {
    parts.push("客户已不存在");
  }

  if (preview.leadAction === "AUDIT_PRESERVE") {
    parts.push("保留 Lead 审计");
  } else if (preview.leadAction === "HARD_DELETE") {
    parts.push("硬删 Lead");
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

export function getRollbackExecutionMeta(
  outcome: NonNullable<LeadImportDetailRow["rollback"]["execution"]>["outcome"],
) {
  switch (outcome) {
    case "CUSTOMER_DELETED":
      return { label: "已删客户", variant: "success" as const };
    case "CUSTOMER_ALREADY_REMOVED":
      return { label: "客户已不存在", variant: "neutral" as const };
    case "LEAD_AUDIT_PRESERVED":
      return { label: "Lead 已审计保留", variant: "info" as const };
    case "LEAD_HARD_DELETED":
      return { label: "Lead 已硬删", variant: "danger" as const };
    case "IGNORED":
    default:
      return { label: "无需执行", variant: "neutral" as const };
  }
}
