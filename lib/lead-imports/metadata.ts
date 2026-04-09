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

type ImportFieldDefinition<Key extends string> = {
  key: Key;
  label: string;
  required: boolean;
  aliases: string[];
};

type ImportMappingConfig<Key extends string> = Partial<Record<Key, string>>;

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
export const leadImportModeValues = ["lead", "customer_continuation"] as const;

export type LeadImportMode = (typeof leadImportModeValues)[number];
export type LeadImportKind = "LEAD" | "CUSTOMER_CONTINUATION";
export type CustomerContinuationImportAction =
  | "CREATED_CUSTOMER"
  | "MATCHED_EXISTING_CUSTOMER"
  | "FAILED";
export type CustomerContinuationOwnerOutcome =
  | "ASSIGNED"
  | "KEPT_EXISTING"
  | "PUBLIC_POOL"
  | "UNRESOLVED";
export type CustomerContinuationImportSummary = {
  historicalTotalSpent: string | null;
  purchaseCount: number | null;
  latestPurchasedProduct: string | null;
  latestIntent: string | null;
  latestFollowUpAt: string | null;
  latestFollowUpResult: string | null;
  note: string | null;
};
export type CustomerContinuationBatchWarningItem = {
  value: string;
  count: number;
};
export type CustomerContinuationBatchReport = {
  importKind: "CUSTOMER_CONTINUATION";
  templateVersion: "v1";
  summary: {
    createdCustomers: number;
    createdPrivateCustomers: number;
    createdPublicCustomers: number;
    matchedExistingCustomers: number;
    updatedExistingCustomers: number;
    unresolvedOwners: number;
    unresolvedTags: number;
    categoryACustomers: number;
    categoryBCustomers: number;
    categoryCCustomers: number;
    categoryDCustomers: number;
    wechatAddedCustomers: number;
    pendingInvitationCustomers: number;
    pendingCallbackCustomers: number;
    refusedWechatCustomers: number;
    invalidNumberCustomers: number;
  };
  warnings: {
    unresolvedOwnerValues: CustomerContinuationBatchWarningItem[];
    unresolvedTagValues: CustomerContinuationBatchWarningItem[];
  };
};
export type CustomerContinuationRowMappedData = {
  importKind: "CUSTOMER_CONTINUATION";
  mappedCustomer: {
    name: string | null;
    phone: string;
    ownerUsername: string | null;
    tags: string[];
    unresolvedTags: string[];
    summary: CustomerContinuationImportSummary;
  };
  result: {
    customerId: string | null;
    customerName: string | null;
    action: CustomerContinuationImportAction;
    ownerOutcome: CustomerContinuationOwnerOutcome;
  };
};
export type CustomerImportOperationLogData = {
  importKind: "CUSTOMER_CONTINUATION";
  batchId: string;
  batchFileName: string;
  rowNumber: number;
  action: Exclude<CustomerContinuationImportAction, "FAILED">;
  importedAt: string;
  owner: {
    username: string | null;
    name: string | null;
    resolved: boolean;
  };
  ownerOutcome: CustomerContinuationOwnerOutcome;
  tags: {
    assigned: string[];
    unresolved: string[];
  };
  summary: CustomerContinuationImportSummary;
};

export const customerContinuationImportOperationActions = [
  "customer.customer_import.created",
  "customer.customer_import.matched_existing",
] as const;

export const leadImportModeMeta: Record<
  LeadImportMode,
  {
    kind: LeadImportKind;
    label: string;
    title: string;
    description: string;
    templateFileName: string;
    templateDownloadLabel: string;
    uploadTitle: string;
    uploadDescription: string;
  }
> = {
  lead: {
    kind: "LEAD",
    label: "线索导入",
    title: "线索导入中心",
    description: "继续承接线索批量导入、去重校验、客户归并和导入审计，不改现有主链路。",
    templateFileName: "lead-import-template.csv",
    templateDownloadLabel: "下载线索模板",
    uploadTitle: "上传线索导入文件",
    uploadDescription: "上传 Excel 或 CSV 后，系统会校验固定模板列、标准化手机号，并继续走现有 Lead 导入链路。",
  },
  customer_continuation: {
    kind: "CUSTOMER_CONTINUATION",
    label: "客户续接导入",
    title: "客户续接导入中心",
    description:
      "把需要继续跟进的迁移客户直接接入 Customer 主链路，保留迁移摘要、旧分类标签和后续承接信号。",
    templateFileName: "customer-continuation-import-template.csv",
    templateDownloadLabel: "下载续接模板",
    uploadTitle: "上传客户续接导入文件",
    uploadDescription:
      "上传 Excel 或 CSV 后，系统会按手机号命中已有客户或直接创建 Customer，并把老系统分类映射到标签、已加微信和通话结果承接。",
  },
};

export function isLeadImportSourceValue(value: string): value is LeadSource {
  return LEAD_IMPORT_SOURCE_VALUES.includes(value as LeadSource);
}

export function isLeadImportMode(value: string): value is LeadImportMode {
  return leadImportModeValues.includes(value as LeadImportMode);
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
    label: "意向商品",
    required: false,
    aliases: ["意向商品", "购买商品", "产品", "product", "sku"],
  },
  {
    key: "campaignName",
    label: "活动标记",
    required: false,
    aliases: ["活动标记", "活动名称", "场次", "campaign", "campaignname"],
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
] as const satisfies readonly ImportFieldDefinition<string>[];

export const customerContinuationImportFieldDefinitions = [
  {
    key: "phone",
    label: "手机号",
    required: true,
    aliases: ["手机号", "手机", "联系电话", "电话", "mobile", "phone", "tel"],
  },
  {
    key: "name",
    label: "姓名",
    required: false,
    aliases: ["姓名", "客户姓名", "联系人", "name"],
  },
  {
    key: "address",
    label: "地址",
    required: false,
    aliases: ["地址", "详细地址", "收货地址", "address"],
  },
  {
    key: "ownerUsername",
    label: "负责销售账号",
    required: false,
    aliases: [
      "负责销售账号",
      "销售账号",
      "销售用户名",
      "负责人账号",
      "owner",
      "ownerusername",
      "salesusername",
      "username",
    ],
  },
  {
    key: "tags",
    label: "标签",
    required: false,
    aliases: ["标签", "客户标签", "客户分类", "分类", "客户类别", "tag", "tags"],
  },
  {
    key: "historicalTotalSpent",
    label: "迁移前累计消费",
    required: false,
    aliases: [
      "迁移前累计消费",
      "累计消费",
      "累计消费金额",
      "历史消费",
      "历史累计消费",
      "historicaltotalspent",
      "totalspent",
      "spent",
    ],
  },
  {
    key: "purchaseCount",
    label: "购买次数",
    required: false,
    aliases: ["购买次数", "历史购买次数", "purchasecount", "count"],
  },
  {
    key: "latestPurchasedProduct",
    label: "最近购买商品",
    required: false,
    aliases: [
      "最近购买商品",
      "最近成交商品",
      "已购商品",
      "导入产品",
      "latestpurchasedproduct",
    ],
  },
  {
    key: "latestIntent",
    label: "最近意向",
    required: false,
    aliases: ["最近意向", "当前意向", "意向摘要", "latestintent", "intent"],
  },
  {
    key: "latestFollowUpAt",
    label: "最近跟进时间",
    required: false,
    aliases: [
      "最近跟进时间",
      "最后跟进时间",
      "回访时间",
      "最近回访时间",
      "导入时间",
      "latestfollowupat",
      "followupat",
    ],
  },
  {
    key: "latestFollowUpResult",
    label: "最近跟进结果",
    required: false,
    aliases: [
      "最近跟进结果",
      "最后跟进结果",
      "回访结果",
      "跟进结果",
      "followupresult",
      "latestfollowupresult",
    ],
  },
  {
    key: "note",
    label: "迁移备注",
    required: false,
    aliases: ["迁移备注", "备注", "原系统备注", "老系统备注", "note", "remark"],
  },
] as const satisfies readonly ImportFieldDefinition<string>[];

export const leadImportTemplateHeaders = leadImportFieldDefinitions.map(
  (field) => field.label,
);
export const customerContinuationImportTemplateHeaders =
  customerContinuationImportFieldDefinitions.map((field) => field.label);

export type LeadImportFieldKey = (typeof leadImportFieldDefinitions)[number]["key"];
export type CustomerContinuationImportFieldKey =
  (typeof customerContinuationImportFieldDefinitions)[number]["key"];
export type LeadImportMappingConfig = ImportMappingConfig<LeadImportFieldKey>;
export type CustomerContinuationImportMappingConfig =
  ImportMappingConfig<CustomerContinuationImportFieldKey>;

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

export function getLeadImportMode(
  searchParams: Record<string, SearchParamsValue> | undefined,
): LeadImportMode {
  const mode = getParamValue(searchParams?.mode);
  return isLeadImportMode(mode) ? mode : "lead";
}

export function getLeadImportModeMeta(mode: LeadImportMode) {
  return leadImportModeMeta[mode];
}

export function getLeadImportBatchKind(
  report: Prisma.JsonValue | null | undefined,
): LeadImportKind {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return "LEAD";
  }

  const importKind = report.importKind;
  return importKind === "CUSTOMER_CONTINUATION" ? "CUSTOMER_CONTINUATION" : "LEAD";
}

export function getLeadImportModeFromKind(kind: LeadImportKind): LeadImportMode {
  return kind === "CUSTOMER_CONTINUATION" ? "customer_continuation" : "lead";
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

function guessImportMapping<Key extends string>(
  headers: string[],
  fieldDefinitions: readonly ImportFieldDefinition<Key>[],
): ImportMappingConfig<Key> {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const mapping: ImportMappingConfig<Key> = {};

  for (const field of fieldDefinitions) {
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

function sanitizeImportMapping<Key extends string>(
  mapping: ImportMappingConfig<Key>,
  headers: string[],
  fieldDefinitions: readonly ImportFieldDefinition<Key>[],
): ImportMappingConfig<Key> {
  const headerSet = new Set(headers);
  const next: ImportMappingConfig<Key> = {};

  for (const field of fieldDefinitions) {
    const header = mapping[field.key];
    if (header && headerSet.has(header)) {
      next[field.key] = header;
    }
  }

  return next;
}

function buildFixedImportMapping<Key extends string>(
  headers: string[],
  fieldDefinitions: readonly ImportFieldDefinition<Key>[],
) {
  const mapping = sanitizeImportMapping(
    guessImportMapping(headers, fieldDefinitions),
    headers,
    fieldDefinitions,
  );
  const missingHeaders = fieldDefinitions
    .filter((field) => field.required && !mapping[field.key])
    .map((field) => field.label);

  return {
    mapping,
    missingHeaders,
  };
}

export function guessLeadImportMapping(headers: string[]): LeadImportMappingConfig {
  return guessImportMapping(headers, leadImportFieldDefinitions);
}

export function sanitizeLeadImportMapping(
  mapping: LeadImportMappingConfig,
  headers: string[],
): LeadImportMappingConfig {
  return sanitizeImportMapping(mapping, headers, leadImportFieldDefinitions);
}

export function buildFixedLeadImportMapping(headers: string[]) {
  return buildFixedImportMapping(headers, leadImportFieldDefinitions);
}

export function guessCustomerContinuationImportMapping(
  headers: string[],
): CustomerContinuationImportMappingConfig {
  return guessImportMapping(headers, customerContinuationImportFieldDefinitions);
}

export function sanitizeCustomerContinuationImportMapping(
  mapping: CustomerContinuationImportMappingConfig,
  headers: string[],
): CustomerContinuationImportMappingConfig {
  return sanitizeImportMapping(
    mapping,
    headers,
    customerContinuationImportFieldDefinitions,
  );
}

export function buildFixedCustomerContinuationImportMapping(headers: string[]) {
  return buildFixedImportMapping(headers, customerContinuationImportFieldDefinitions);
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

function summarizeImportMapping<Key extends string>(
  mapping: ImportMappingConfig<Key>,
  fieldDefinitions: readonly ImportFieldDefinition<Key>[],
) {
  return fieldDefinitions
    .filter((field) => mapping[field.key])
    .map((field) => `${field.label}: ${mapping[field.key]}`)
    .join(" / ");
}

export function summarizeLeadImportMapping(mapping: LeadImportMappingConfig) {
  return summarizeImportMapping(mapping, leadImportFieldDefinitions);
}

export function summarizeCustomerContinuationImportMapping(
  mapping: CustomerContinuationImportMappingConfig,
) {
  return summarizeImportMapping(mapping, customerContinuationImportFieldDefinitions);
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
