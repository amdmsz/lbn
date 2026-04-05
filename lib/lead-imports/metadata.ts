import {
  type LeadCustomerMergeAction,
  type LeadDedupType,
  type LeadImportBatchStatus,
  type LeadImportFileType,
  type LeadImportRowStatus,
  type LeadSource,
  type Prisma,
} from "@prisma/client";
import type { StatusBadgeVariant } from "@/components/shared/status-badge";

type SearchParamsValue = string | string[] | undefined;

export const LEAD_IMPORT_PAGE_SIZE = 10;
export const LEAD_IMPORT_PREVIEW_ROW_COUNT = 8;
export const LEAD_IMPORT_TEMPLATE_NONE_VALUE = "__NONE__";
export const LEAD_IMPORT_SOURCE_VALUES = ["INFO_FLOW"] as const satisfies readonly LeadSource[];
export const DEFAULT_LEAD_IMPORT_SOURCE: LeadSource = "INFO_FLOW";
export const LEAD_IMPORT_BATCH_STATUS_VALUES = [
  "DRAFT",
  "IMPORTING",
  "COMPLETED",
  "FAILED",
] as const satisfies readonly LeadImportBatchStatus[];

export function isLeadImportSourceValue(value: string): value is LeadSource {
  return LEAD_IMPORT_SOURCE_VALUES.includes(value as LeadSource);
}

export const leadImportFieldDefinitions = [
  {
    key: "phone",
    label: "手机号",
    required: true,
    aliases: ["手机号", "手机", "联系电话", "电话", "mobile", "phone", "tel"],
  },
  {
    key: "name",
    label: "姓名",
    required: true,
    aliases: ["姓名", "客户姓名", "联系人", "name"],
  },
  {
    key: "address",
    label: "地址",
    required: true,
    aliases: ["地址", "详细地址", "收货地址", "address"],
  },
  {
    key: "interestedProduct",
    label: "已购产品",
    required: false,
    aliases: ["已购产品", "购买产品", "产品", "product", "sku"],
  },
  {
    key: "campaignName",
    label: "物流单号",
    required: false,
    aliases: ["物流单号", "快递单号", "运单号", "trackingnumber", "tracking_no"],
  },
  {
    key: "sourceDetail",
    label: "来源详情",
    required: false,
    aliases: ["来源详情", "渠道详情", "来源说明", "sourcedetail"],
  },
  {
    key: "remark",
    label: "备注",
    required: false,
    aliases: ["备注", "说明", "备注信息", "remark", "note"],
  },
] as const;

export const leadImportTemplateHeaders = leadImportFieldDefinitions.map(
  (field) => field.label,
);

export type LeadImportFieldKey = (typeof leadImportFieldDefinitions)[number]["key"];
export type LeadImportMappingConfig = Partial<Record<LeadImportFieldKey, string>>;

export type LeadImportNotice =
  | {
      tone: "success" | "danger";
      message: string;
    }
  | null;

export const leadImportSourceOptions = [
  { value: DEFAULT_LEAD_IMPORT_SOURCE, label: "信息流" },
] as const;

export const leadImportBatchStatusOptions = [
  { value: "", label: "全部状态" },
  { value: "COMPLETED", label: "已完成" },
  { value: "IMPORTING", label: "导入中" },
  { value: "FAILED", label: "已失败" },
  { value: "DRAFT", label: "待导入" },
] as const satisfies ReadonlyArray<{
  value: "" | LeadImportBatchStatus;
  label: string;
}>;

const batchStatusMeta: Record<
  LeadImportBatchStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  DRAFT: { label: "待导入", variant: "warning" },
  IMPORTING: { label: "导入中", variant: "info" },
  COMPLETED: { label: "已完成", variant: "success" },
  FAILED: { label: "已失败", variant: "danger" },
};

const rowStatusMeta: Record<
  LeadImportRowStatus,
  { label: string; variant: StatusBadgeVariant }
> = {
  PENDING: { label: "待处理", variant: "warning" },
  IMPORTED: { label: "已导入", variant: "success" },
  FAILED: { label: "失败", variant: "danger" },
  DUPLICATE: { label: "重复剔除", variant: "neutral" },
};

const dedupTypeMeta: Record<
  LeadDedupType,
  { label: string; variant: StatusBadgeVariant }
> = {
  EXISTING_LEAD: { label: "系统内已存在线索", variant: "neutral" },
  BATCH_DUPLICATE: { label: "本批次内重复", variant: "warning" },
};

const mergeActionMeta: Record<
  LeadCustomerMergeAction,
  { label: string; variant: StatusBadgeVariant }
> = {
  CREATED_CUSTOMER: { label: "新建客户", variant: "success" },
  MATCHED_EXISTING_CUSTOMER: { label: "关联已有客户", variant: "info" },
};

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function parseLeadImportNotice(
  searchParams: Record<string, SearchParamsValue> | undefined,
): LeadImportNotice {
  const status =
    getParamValue(searchParams?.noticeStatus) || getParamValue(searchParams?.status);
  const message =
    getParamValue(searchParams?.noticeMessage) || getParamValue(searchParams?.message);

  if (!message || (status !== "success" && status !== "error")) {
    return null;
  }

  return {
    tone: status === "success" ? "success" : "danger",
    message,
  };
}

export function getLeadImportBatchStatusLabel(status: LeadImportBatchStatus) {
  return batchStatusMeta[status].label;
}

export function getLeadImportBatchStatusVariant(status: LeadImportBatchStatus) {
  return batchStatusMeta[status].variant;
}

export function getLeadImportRowStatusLabel(status: LeadImportRowStatus) {
  return rowStatusMeta[status].label;
}

export function getLeadImportRowStatusVariant(status: LeadImportRowStatus) {
  return rowStatusMeta[status].variant;
}

export function getLeadDedupTypeLabel(type: LeadDedupType) {
  return dedupTypeMeta[type].label;
}

export function getLeadDedupTypeVariant(type: LeadDedupType) {
  return dedupTypeMeta[type].variant;
}

export function getLeadCustomerMergeActionLabel(action: LeadCustomerMergeAction) {
  return mergeActionMeta[action].label;
}

export function getLeadCustomerMergeActionVariant(action: LeadCustomerMergeAction) {
  return mergeActionMeta[action].variant;
}

export function getLeadImportFileTypeLabel(fileType: LeadImportFileType) {
  switch (fileType) {
    case "CSV":
      return "CSV";
    case "XLS":
      return "XLS";
    case "XLSX":
      return "XLSX";
    default:
      return fileType;
  }
}

export function getLeadImportSourceLabel(source: LeadSource) {
  return (
    leadImportSourceOptions.find((option) => option.value === source)?.label ?? source
  );
}

export function formatImportDateTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_\-()（）]/g, "");
}

export function guessLeadImportMapping(headers: string[]): LeadImportMappingConfig {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const mapping: LeadImportMappingConfig = {};

  for (const field of leadImportFieldDefinitions) {
    const aliases = field.aliases.map(normalizeHeader);
    const matchedHeader = normalizedHeaders.find((header) =>
      aliases.includes(header.normalized),
    );

    if (matchedHeader) {
      mapping[field.key] = matchedHeader.original;
    }
  }

  return mapping;
}

export function sanitizeLeadImportMapping(
  mapping: LeadImportMappingConfig,
  headers: string[],
): LeadImportMappingConfig {
  const headerSet = new Set(headers);
  const next: LeadImportMappingConfig = {};

  for (const field of leadImportFieldDefinitions) {
    const header = mapping[field.key];
    if (header && headerSet.has(header)) {
      next[field.key] = header;
    }
  }

  return next;
}

export function buildFixedLeadImportMapping(headers: string[]) {
  const mapping = sanitizeLeadImportMapping(guessLeadImportMapping(headers), headers);
  const missingHeaders = leadImportFieldDefinitions
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);

  return {
    mapping,
    missingHeaders,
  };
}

export function getTemplateDefaultMappingValue(
  mapping: Prisma.JsonValue | null | undefined,
  key: LeadImportFieldKey,
) {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return "";
  }

  const value = mapping[key];
  return typeof value === "string" ? value : "";
}

export function summarizeLeadImportMapping(mapping: LeadImportMappingConfig) {
  return leadImportFieldDefinitions
    .filter((field) => mapping[field.key])
    .map((field) => `${field.label}: ${mapping[field.key]}`)
    .join(" / ");
}

export function normalizeImportedPhone(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "");

  if (digits.length === 11) {
    return digits;
  }

  if (digits.length === 13 && digits.startsWith("86")) {
    return digits.slice(2);
  }

  return "";
}
