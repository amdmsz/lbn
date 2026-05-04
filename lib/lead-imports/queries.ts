import {
  LeadImportBatchStatus,
  LeadImportRowStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canExecuteLeadImportBatchHardDelete,
} from "@/lib/auth/access";
import {
  assertLeadImportAccess,
  buildLeadImportBatchVisibilityWhere,
  type LeadImportAccessViewer,
} from "@/lib/lead-imports/access";
import {
  getLeadImportBatchRollbackPreview,
  parseLeadImportBatchRollbackExecutionSnapshot,
  parseLeadImportBatchRollbackPrecheckSnapshot,
} from "@/lib/lead-imports/batch-rollback";
import {
  getImportedCustomerDeletionRequestStatusLabel,
  getImportedCustomerDeletionRequestStatusVariant,
  getImportedCustomerDeletionSourceModeLabel,
} from "@/lib/customers/imported-customer-deletion-metadata";
import { prisma } from "@/lib/db/prisma";
import {
  collectCustomerContinuationCategories,
  getCustomerContinuationOutcomeBadges,
} from "@/lib/lead-imports/customer-continuation-signals";
import { parseLeadImportDuplicateCustomerSnapshot } from "@/lib/lead-imports/duplicate-customer";
import {
  LEAD_IMPORT_PAGE_SIZE,
  buildLeadImportBatchProgress,
  getLeadImportBatchKind,
  getLeadImportBatchRollbackModeLabel,
  getLeadImportBatchRollbackModeDescription,
  getLeadImportBatchRollbackModeVariant,
  getLeadImportMode,
  getLeadImportModeFromKind,
  getLeadImportModeMeta,
  leadImportSourceOptions,
  parseLeadImportNotice,
  type CustomerContinuationBatchReport,
  type LeadImportBatchRollbackMode,
  type CustomerContinuationRowMappedData,
  type LeadImportKind,
  type LeadImportMode,
} from "@/lib/lead-imports/metadata";

type SearchParamsValue = string | string[] | undefined;

export type LeadImportViewer = LeadImportAccessViewer;

export type LeadImportListFilters = {
  mode: LeadImportMode;
  keyword: string;
  status: LeadImportBatchStatus | "";
  page: number;
};

const listFiltersSchema = z.object({
  mode: z.enum(["lead", "customer_continuation"]).default("lead"),
  keyword: z.string().trim().default(""),
  status: z.union([z.nativeEnum(LeadImportBatchStatus), z.literal("")]).default(""),
  page: z.coerce.number().int().min(1).default(1),
});

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function assertAccess(role: RoleCode) {
  assertLeadImportAccess(role);
}

function parseCustomerContinuationBatchReport(
  value: Prisma.JsonValue | null,
): CustomerContinuationBatchReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (value.importKind !== "CUSTOMER_CONTINUATION") {
    return null;
  }

  return value as CustomerContinuationBatchReport;
}

function parseCustomerContinuationRowMappedData(
  value: Prisma.JsonValue | null,
): CustomerContinuationRowMappedData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if (value.importKind !== "CUSTOMER_CONTINUATION") {
    return null;
  }

  return value as CustomerContinuationRowMappedData;
}

function parseDuplicateCustomerFromLeadImportRow(
  value: Prisma.JsonValue | null,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return parseLeadImportDuplicateCustomerSnapshot(value.duplicateCustomer);
}

type CustomerContinuationResultBucket =
  | "created_assigned"
  | "matched_assigned"
  | "matched_kept_existing"
  | "public_pool"
  | "duplicate"
  | "failed";

type CustomerContinuationResultGroupCounts = {
  createdAssignedCount: number;
  matchedAssignedCount: number;
  matchedKeptExistingCount: number;
  publicPoolCount: number;
  duplicateCount: number;
  failedCount: number;
};

function createEmptyCustomerContinuationResultGroupCounts(): CustomerContinuationResultGroupCounts {
  return {
    createdAssignedCount: 0,
    matchedAssignedCount: 0,
    matchedKeptExistingCount: 0,
    publicPoolCount: 0,
    duplicateCount: 0,
    failedCount: 0,
  };
}

function getCustomerContinuationResultBucket(input: {
  status: LeadImportRowStatus;
  customerContinuation: CustomerContinuationRowMappedData | null;
}): CustomerContinuationResultBucket | null {
  if (input.status === LeadImportRowStatus.DUPLICATE) {
    return "duplicate";
  }

  if (input.status === LeadImportRowStatus.FAILED) {
    return "failed";
  }

  if (input.status !== LeadImportRowStatus.IMPORTED || !input.customerContinuation) {
    return null;
  }

  const { action, ownerOutcome } = input.customerContinuation.result;

  if (ownerOutcome === "PUBLIC_POOL") {
    return "public_pool";
  }

  if (action === "CREATED_CUSTOMER" && ownerOutcome === "ASSIGNED") {
    return "created_assigned";
  }

  if (action === "MATCHED_EXISTING_CUSTOMER" && ownerOutcome === "ASSIGNED") {
    return "matched_assigned";
  }

  if (action === "MATCHED_EXISTING_CUSTOMER" && ownerOutcome === "KEPT_EXISTING") {
    return "matched_kept_existing";
  }

  return null;
}

function accumulateCustomerContinuationResultBucket(
  summary: CustomerContinuationResultGroupCounts,
  bucket: CustomerContinuationResultBucket | null,
) {
  switch (bucket) {
    case "created_assigned":
      summary.createdAssignedCount += 1;
      break;
    case "matched_assigned":
      summary.matchedAssignedCount += 1;
      break;
    case "matched_kept_existing":
      summary.matchedKeptExistingCount += 1;
      break;
    case "public_pool":
      summary.publicPoolCount += 1;
      break;
    case "duplicate":
      summary.duplicateCount += 1;
      break;
    case "failed":
      summary.failedCount += 1;
      break;
    default:
      break;
  }
}

function buildCustomerContinuationResultGroupCounts(
  rows: Array<{
    status: LeadImportRowStatus;
    customerContinuation: CustomerContinuationRowMappedData | null;
  }>,
) {
  const summary = createEmptyCustomerContinuationResultGroupCounts();

  for (const row of rows) {
    accumulateCustomerContinuationResultBucket(
      summary,
      getCustomerContinuationResultBucket({
        status: row.status,
        customerContinuation: row.customerContinuation,
      }),
    );
  }

  return summary;
}

function matchesMode(kind: LeadImportKind, mode: LeadImportMode) {
  return getLeadImportModeFromKind(kind) === mode;
}

const importedCustomerDeletionRequestSelect = {
  id: true,
  customerIdSnapshot: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  sourceMode: true,
  sourceBatchId: true,
  sourceBatchFileName: true,
  sourceRowNumber: true,
  status: true,
  requestReason: true,
  rejectReason: true,
  createdAt: true,
  reviewedAt: true,
  executedAt: true,
  reviewerId: true,
  requestedBy: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  reviewer: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  executedBy: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} satisfies Prisma.ImportedCustomerDeletionRequestSelect;

type ImportedCustomerDeletionRequestRecord =
  Prisma.ImportedCustomerDeletionRequestGetPayload<{
    select: typeof importedCustomerDeletionRequestSelect;
  }>;

/*
type ImportedCustomerDeletionCustomerSnapshot = Prisma.CustomerGetPayload<{
  select: {
    id: true;
    name: true;
    phone: true;
    ownerId: true;
    publicPoolTeamId: true;
    owner: {
      select: {
        teamId: true;
      };
    };
    _count: {
      select: {
        tradeOrders: true;
        salesOrders: true;
        orders: true;
        giftRecords: true;
        paymentPlans: true;
        paymentRecords: true;
        collectionTasks: true;
        shippingTasks: true;
        logisticsFollowUpTasks: true;
        codCollectionRecords: true;
      };
    };
  };
}>;

const importedCustomerDeletionBlockerLabels = [
  ["tradeOrders", "已存在成交主单"],
  ["salesOrders", "已存在供应商子单"],
  ["orders", "已存在历史订单"],
  ["giftRecords", "已存在礼品履约记录"],
  ["paymentPlans", "已存在收款计划"],
  ["paymentRecords", "已存在收款记录"],
  ["collectionTasks", "已存在催收任务"],
  ["shippingTasks", "已存在发货任务"],
  ["logisticsFollowUpTasks", "已存在物流跟进任务"],
  ["codCollectionRecords", "已存在 COD 回款记录"],
] as const;

*/
function buildImportedCustomerDeletionRequestSummary(
  request: ImportedCustomerDeletionRequestRecord,
) {
  return {
    id: request.id,
    customerIdSnapshot: request.customerIdSnapshot,
    customerNameSnapshot: request.customerNameSnapshot,
    customerPhoneSnapshot: request.customerPhoneSnapshot,
    sourceMode: request.sourceMode,
    sourceModeLabel: getImportedCustomerDeletionSourceModeLabel(request.sourceMode),
    sourceBatchId: request.sourceBatchId,
    sourceBatchFileName: request.sourceBatchFileName,
    sourceRowNumber: request.sourceRowNumber,
    status: request.status,
    statusLabel: getImportedCustomerDeletionRequestStatusLabel(request.status),
    statusVariant: getImportedCustomerDeletionRequestStatusVariant(request.status),
    requestReason: request.requestReason,
    rejectReason: request.rejectReason,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
    executedAt: request.executedAt,
    requestedBy: request.requestedBy,
    reviewer: request.reviewer,
    executedBy: request.executedBy,
  };
}

/*
function getImportedCustomerDeletionBlockerLabelsForCustomer(
  customer: ImportedCustomerDeletionCustomerSnapshot | null | undefined,
) {
  if (!customer) {
    return [];
  }

  return importedCustomerDeletionBlockerLabels.flatMap(([key, label]) =>
    customer._count[key] > 0 ? [label] : [],
  );
}

function buildImportedCustomerDeletionRowStatus(input: {
  mode: LeadImportMode;
  viewerRole: RoleCode;
  viewerTeamId: string | null;
  rowNumber: number;
  customerMerge:
    | {
        action: string;
        customerId: string | null;
      }
    | null
    | undefined;
  customerContinuation: CustomerContinuationRowMappedData | null;
  request:
    | ReturnType<typeof buildImportedCustomerDeletionRequestSummary>
    | null
    | undefined;
  activeCustomer: ImportedCustomerDeletionCustomerSnapshot | null | undefined;
}) {
  const rowCustomerId =
    input.mode === "customer_continuation"
      ? input.customerContinuation?.result.customerId ??
        input.request?.customerIdSnapshot ??
        null
      : input.customerMerge?.customerId ?? input.request?.customerIdSnapshot ?? null;
  const createdByImport =
    input.mode === "customer_continuation"
      ? input.customerContinuation?.result.action === "CREATED_CUSTOMER"
      : input.customerMerge?.action === "CREATED_CUSTOMER";

  let state: ImportedCustomerDeletionRowState = "BLOCKED";
  let reason = "仅导入新建客户可删除。";

  if (!createdByImport) {
    return {
      state,
      stateLabel: getImportedCustomerDeletionRowStateLabel(state),
      stateVariant: getImportedCustomerDeletionRowStateVariant(state),
      reason,
      customerId: rowCustomerId,
      latestRequest: input.request ?? null,
      hasLiveCustomer: Boolean(input.activeCustomer),
      selectable: false,
    };
  }

  if (input.request?.status === "EXECUTED") {
    state = "DELETED";
    reason = input.request.executedAt
      ? `已于 ${input.request.executedAt.toLocaleString("zh-CN")} 删除。`
      : "客户已删除。";
  } else if (input.request?.status === "PENDING_SUPERVISOR") {
    state = "PENDING";
    reason = input.request.reviewer
      ? `待 ${input.request.reviewer.name} 审批。`
      : "当前客户已有待审批删除申请。";
  } else if (!rowCustomerId || !input.activeCustomer) {
    state = "BLOCKED";
    reason = "客户已不存在或无法定位当前客户。";
  } else {
    const blockerLabels = getImportedCustomerDeletionBlockerLabelsForCustomer(
      input.activeCustomer,
    );

    if (blockerLabels.length > 0) {
      state = "BLOCKED";
      reason = blockerLabels.join("、");
    } else if (input.viewerRole !== "ADMIN" && input.activeCustomer.ownerId) {
      state = "BLOCKED";
      reason = "当前客户已有负责人，主管不可直接删除。";
    } else if (
      input.viewerRole === "SUPERVISOR" &&
      input.viewerTeamId &&
      input.activeCustomer.ownerId === null &&
      input.activeCustomer.publicPoolTeamId !== input.viewerTeamId
    ) {
      state = "BLOCKED";
      reason = "当前客户不在你的公海团队范围内。";
    } else if (input.viewerRole === "SUPERVISOR" && !input.viewerTeamId) {
      state = "BLOCKED";
      reason = "当前主管未配置团队范围。";
    } else {
      state = "ELIGIBLE";
      reason = "满足导入新建、公海/无负责人、无交易阻断条件。";
    }
  }

  return {
    state,
    stateLabel: getImportedCustomerDeletionRowStateLabel(state),
    stateVariant: getImportedCustomerDeletionRowStateVariant(state),
    reason,
    customerId: rowCustomerId,
    latestRequest: input.request ?? null,
    hasLiveCustomer: Boolean(input.activeCustomer),
    selectable: state === "ELIGIBLE" && Boolean(rowCustomerId),
  };
}
*/

function getSafeRollbackMode(
  viewerRole: RoleCode,
  importKind: LeadImportKind,
  requestedMode: LeadImportBatchRollbackMode,
) {
  if (importKind !== "LEAD") {
    return "AUDIT_PRESERVED" as const;
  }

  if (requestedMode === "HARD_DELETE" && canExecuteLeadImportBatchHardDelete(viewerRole)) {
    return "HARD_DELETE" as const;
  }

  return "AUDIT_PRESERVED" as const;
}

function buildCustomerContinuationMetrics(
  rows: Array<{
    status: LeadImportRowStatus;
    customerContinuation: CustomerContinuationRowMappedData | null;
  }>,
) {
  const metrics = {
    categoryACustomers: 0,
    categoryBCustomers: 0,
    categoryCCustomers: 0,
    categoryDCustomers: 0,
    wechatAddedCustomers: 0,
    pendingInvitationCustomers: 0,
    pendingCallbackCustomers: 0,
    refusedWechatCustomers: 0,
    invalidNumberCustomers: 0,
  };

  for (const row of rows) {
    if (row.status !== LeadImportRowStatus.IMPORTED || !row.customerContinuation) {
      continue;
    }

    const categories = collectCustomerContinuationCategories({
      tags: row.customerContinuation.mappedCustomer.tags,
      summary: row.customerContinuation.mappedCustomer.summary,
    });
    const badges = getCustomerContinuationOutcomeBadges({
      tags: row.customerContinuation.mappedCustomer.tags,
      summary: row.customerContinuation.mappedCustomer.summary,
    });

    for (const category of categories) {
      if (category === "A") {
        metrics.categoryACustomers += 1;
      }
      if (category === "B") {
        metrics.categoryBCustomers += 1;
      }
      if (category === "C") {
        metrics.categoryCCustomers += 1;
      }
      if (category === "D") {
        metrics.categoryDCustomers += 1;
      }
    }

    for (const badge of badges) {
      if (badge.key === "WECHAT_ADDED") {
        metrics.wechatAddedCustomers += 1;
      }
      if (badge.key === "PENDING_INVITATION") {
        metrics.pendingInvitationCustomers += 1;
      }
      if (badge.key === "PENDING_CALLBACK") {
        metrics.pendingCallbackCustomers += 1;
      }
      if (badge.key === "REFUSED_WECHAT") {
        metrics.refusedWechatCustomers += 1;
      }
      if (badge.key === "INVALID_NUMBER") {
        metrics.invalidNumberCustomers += 1;
      }
    }
  }

  return metrics;
}

function resolveCustomerContinuationMetrics(
  report: CustomerContinuationBatchReport | null,
  fallback: ReturnType<typeof buildCustomerContinuationMetrics>,
) {
  const summary = report?.summary;

  return {
    categoryACustomers:
      typeof summary?.categoryACustomers === "number"
        ? summary.categoryACustomers
        : fallback.categoryACustomers,
    categoryBCustomers:
      typeof summary?.categoryBCustomers === "number"
        ? summary.categoryBCustomers
        : fallback.categoryBCustomers,
    categoryCCustomers:
      typeof summary?.categoryCCustomers === "number"
        ? summary.categoryCCustomers
        : fallback.categoryCCustomers,
    categoryDCustomers:
      typeof summary?.categoryDCustomers === "number"
        ? summary.categoryDCustomers
        : fallback.categoryDCustomers,
    wechatAddedCustomers:
      typeof summary?.wechatAddedCustomers === "number"
        ? summary.wechatAddedCustomers
        : fallback.wechatAddedCustomers,
    pendingInvitationCustomers:
      typeof summary?.pendingInvitationCustomers === "number"
        ? summary.pendingInvitationCustomers
        : fallback.pendingInvitationCustomers,
    pendingCallbackCustomers:
      typeof summary?.pendingCallbackCustomers === "number"
        ? summary.pendingCallbackCustomers
        : fallback.pendingCallbackCustomers,
    refusedWechatCustomers:
      typeof summary?.refusedWechatCustomers === "number"
        ? summary.refusedWechatCustomers
        : fallback.refusedWechatCustomers,
    invalidNumberCustomers:
      typeof summary?.invalidNumberCustomers === "number"
        ? summary.invalidNumberCustomers
        : fallback.invalidNumberCustomers,
  };
}

function buildReportMetrics(input: {
  importKind: LeadImportKind;
  totalRows: number;
  successRows: number;
  createdCustomerRows: number;
  matchedCustomerRows: number;
  duplicateRows: number;
  failedRows: number;
}) {
  const successLabel =
    input.importKind === "CUSTOMER_CONTINUATION" ? "成功导入客户" : "成功导入线索";

  return [
    { label: "总行数", value: input.totalRows },
    { label: successLabel, value: input.successRows },
    { label: "新增客户", value: input.createdCustomerRows },
    { label: "命中已有客户", value: input.matchedCustomerRows },
    { label: "重复剔除", value: input.duplicateRows },
    { label: "失败行", value: input.failedRows },
  ];
}

const leadImportBatchProgressSelect = {
  status: true,
  stage: true,
  totalRows: true,
  successRows: true,
  failedRows: true,
  duplicateRows: true,
  errorMessage: true,
  processingStartedAt: true,
  lastHeartbeatAt: true,
  importedAt: true,
} satisfies Prisma.LeadImportBatchSelect;

export function parseLeadImportListFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  const rawStatus = getParamValue(searchParams?.status);

  return listFiltersSchema.parse({
    mode: getLeadImportMode(searchParams),
    keyword: getParamValue(searchParams?.keyword),
    status: rawStatus === "success" || rawStatus === "error" ? "" : rawStatus,
    page: getParamValue(searchParams?.page) || "1",
  });
}

export async function getLeadImportListData(
  viewer: LeadImportViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  assertAccess(viewer.role);

  const filters = parseLeadImportListFilters(rawSearchParams);
  const where = {
    AND: [
      buildLeadImportBatchVisibilityWhere(viewer),
      filters.keyword
        ? {
            OR: [
              {
                fileName: {
                  contains: filters.keyword,
                },
              },
              {
                createdBy: {
                  name: {
                    contains: filters.keyword,
                  },
                },
              },
            ],
          }
        : {},
      filters.status ? { status: filters.status } : {},
    ],
  } satisfies Prisma.LeadImportBatchWhereInput;

  const batchSelect = {
    id: true,
    fileName: true,
    fileType: true,
    status: true,
    stage: true,
    defaultLeadSource: true,
    totalRows: true,
    successRows: true,
    failedRows: true,
    duplicateRows: true,
    createdCustomerRows: true,
    matchedCustomerRows: true,
    processingStartedAt: true,
    lastHeartbeatAt: true,
    errorMessage: true,
    importedAt: true,
    createdAt: true,
    report: true,
    createdBy: {
      select: {
        name: true,
        username: true,
      },
    },
    template: {
      select: {
        id: true,
        name: true,
      },
    },
    rollback: {
      select: {
        id: true,
        mode: true,
        executedAt: true,
        executionSnapshot: true,
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    },
  } satisfies Prisma.LeadImportBatchSelect;

  const batches = await prisma.leadImportBatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: batchSelect,
  });

  const filteredBatches = batches
    .map((batch) => {
      const importKind = getLeadImportBatchKind(batch.report);
      const progress = buildLeadImportBatchProgress({
        status: batch.status,
        stage: batch.stage,
        totalRows: batch.totalRows,
        successRows: batch.successRows,
        failedRows: batch.failedRows,
        duplicateRows: batch.duplicateRows,
        errorMessage: batch.errorMessage,
        processingStartedAt: batch.processingStartedAt,
        lastHeartbeatAt: batch.lastHeartbeatAt,
        importedAt: batch.importedAt,
      });
      return {
        ...batch,
        importKind,
        progress,
        rollback: batch.rollback
          ? {
              id: batch.rollback.id,
              mode: batch.rollback.mode,
              modeLabel: getLeadImportBatchRollbackModeLabel(batch.rollback.mode),
              modeVariant: getLeadImportBatchRollbackModeVariant(batch.rollback.mode),
              executedAt: batch.rollback.executedAt,
              actor: batch.rollback.actor,
              executionSummary:
                parseLeadImportBatchRollbackExecutionSnapshot(
                  batch.rollback.executionSnapshot,
                )?.summary ?? null,
            }
          : null,
      };
    })
    .filter((batch) => matchesMode(batch.importKind, filters.mode));

  const totalCount = filteredBatches.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / LEAD_IMPORT_PAGE_SIZE));
  const currentPage = Math.min(filters.page, totalPages);
  const pagedItems = filteredBatches.slice(
    (currentPage - 1) * LEAD_IMPORT_PAGE_SIZE,
    currentPage * LEAD_IMPORT_PAGE_SIZE,
  );
  const partitionPreview = {
    success: filteredBatches.filter((batch) => batch.successRows > 0).slice(0, 5),
    duplicate: filteredBatches.filter((batch) => batch.duplicateRows > 0).slice(0, 5),
    failed: filteredBatches
      .filter(
        (batch) =>
          batch.status === LeadImportBatchStatus.FAILED || batch.failedRows > 0,
      )
      .slice(0, 5),
  };
  const customerContinuationSummaryBatchIds =
    filters.mode === "customer_continuation"
      ? [...new Set([
          ...pagedItems.map((item) => item.id),
          ...partitionPreview.success.map((item) => item.id),
          ...partitionPreview.duplicate.map((item) => item.id),
          ...partitionPreview.failed.map((item) => item.id),
        ])]
      : [];
  const customerContinuationResultSummaryByBatchId = new Map<
    string,
    CustomerContinuationResultGroupCounts
  >();

  if (customerContinuationSummaryBatchIds.length > 0) {
    const summaryRows = await prisma.leadImportRow.findMany({
      where: {
        batchId: {
          in: customerContinuationSummaryBatchIds,
        },
        status: {
          in: [
            LeadImportRowStatus.IMPORTED,
            LeadImportRowStatus.DUPLICATE,
            LeadImportRowStatus.FAILED,
          ],
        },
      },
      select: {
        batchId: true,
        status: true,
        mappedData: true,
      },
    });

    for (const row of summaryRows) {
      const current =
        customerContinuationResultSummaryByBatchId.get(row.batchId) ??
        createEmptyCustomerContinuationResultGroupCounts();

      accumulateCustomerContinuationResultBucket(
        current,
        getCustomerContinuationResultBucket({
          status: row.status,
          customerContinuation: parseCustomerContinuationRowMappedData(row.mappedData),
        }),
      );

      customerContinuationResultSummaryByBatchId.set(row.batchId, current);
    }
  }

  const enrichedFilteredBatches = filteredBatches.map((batch) => ({
    ...batch,
    customerContinuationResultSummary:
      filters.mode === "customer_continuation"
        ? customerContinuationResultSummaryByBatchId.get(batch.id) ??
          createEmptyCustomerContinuationResultGroupCounts()
        : null,
  }));

  const overview = enrichedFilteredBatches.reduce(
    (summary, batch) => {
      summary.totalBatches += 1;

      if (batch.status === LeadImportBatchStatus.COMPLETED) {
        summary.completedBatches += 1;
      }
      if (batch.status === LeadImportBatchStatus.IMPORTING) {
        summary.importingBatches += 1;
      }
      if (batch.status === LeadImportBatchStatus.QUEUED) {
        summary.queuedBatches += 1;
      }
      if (batch.status === LeadImportBatchStatus.DRAFT) {
        summary.draftBatches += 1;
      }
      if (
        batch.status === LeadImportBatchStatus.FAILED ||
        batch.failedRows > 0
      ) {
        summary.failedBatches += 1;
      }

      return summary;
    },
    {
      totalBatches: 0,
      completedBatches: 0,
      importingBatches: 0,
      queuedBatches: 0,
      failedBatches: 0,
      draftBatches: 0,
    },
  );

  const statistics = enrichedFilteredBatches.reduce(
    (summary, batch) => {
      summary.totalRows += batch.totalRows;
      summary.successRows += batch.successRows;
      summary.failedRows += batch.failedRows;
      summary.duplicateRows += batch.duplicateRows;
      summary.createdCustomerRows += batch.createdCustomerRows;
      summary.matchedCustomerRows += batch.matchedCustomerRows;
      return summary;
    },
    {
      totalRows: 0,
      successRows: 0,
      failedRows: 0,
      duplicateRows: 0,
      createdCustomerRows: 0,
      matchedCustomerRows: 0,
    },
  );

  const customerContinuationPreviewLookups =
    filters.mode === "customer_continuation"
      ? await Promise.all([
          prisma.user.findMany({
            where: {
              userStatus: "ACTIVE",
              role: {
                code: "SALES",
              },
            },
            select: {
              username: true,
            },
          }),
          prisma.tag.findMany({
            where: {
              isActive: true,
            },
            select: {
              code: true,
              name: true,
            },
          }),
        ]).then(([owners, tags]) => ({
          ownerUsernames: owners.map((item) => item.username),
          tagLookupValues: [...new Set(tags.flatMap((item) => [item.name, item.code]))],
        }))
      : null;
  const pendingImportedCustomerDeletionWhere = {
    status: "PENDING_SUPERVISOR",
    ...(viewer.role === "SUPERVISOR" ? { reviewerId: viewer.id } : {}),
  } satisfies Prisma.ImportedCustomerDeletionRequestWhereInput;
  const [pendingImportedCustomerDeletionCount, pendingImportedCustomerDeletionItems] =
    await Promise.all([
      prisma.importedCustomerDeletionRequest.count({
        where: pendingImportedCustomerDeletionWhere,
      }),
      prisma.importedCustomerDeletionRequest.findMany({
        where: pendingImportedCustomerDeletionWhere,
        orderBy: [{ createdAt: "desc" }],
        take: 6,
        select: importedCustomerDeletionRequestSelect,
      }),
    ]);

  return {
    notice: parseLeadImportNotice(rawSearchParams),
    mode: filters.mode,
    modeMeta: getLeadImportModeMeta(filters.mode),
    filters: {
      ...filters,
      page: currentPage,
    },
    items: enrichedFilteredBatches.slice(
      (currentPage - 1) * LEAD_IMPORT_PAGE_SIZE,
      currentPage * LEAD_IMPORT_PAGE_SIZE,
    ),
    overview,
    statistics,
    partitions: {
      success: enrichedFilteredBatches.filter((batch) => batch.successRows > 0).slice(0, 5),
      duplicate: enrichedFilteredBatches
        .filter((batch) => batch.duplicateRows > 0)
        .slice(0, 5),
      failed: enrichedFilteredBatches
        .filter(
          (batch) =>
            batch.status === LeadImportBatchStatus.FAILED || batch.failedRows > 0,
        )
        .slice(0, 5),
    },
    sourceOptions: leadImportSourceOptions,
    customerContinuationPreviewLookups,
    pendingImportedCustomerDeletionRequests: {
      totalCount: pendingImportedCustomerDeletionCount,
      items: pendingImportedCustomerDeletionItems.map(
        buildImportedCustomerDeletionRequestSummary,
      ),
    },
    pagination: {
      page: currentPage,
      pageSize: LEAD_IMPORT_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export async function getLeadImportBatchProgressData(
  viewer: LeadImportViewer,
  batchId: string,
) {
  assertAccess(viewer.role);

  const batch = await prisma.leadImportBatch.findFirst({
    where: {
      AND: [{ id: batchId }, buildLeadImportBatchVisibilityWhere(viewer)],
    },
    select: leadImportBatchProgressSelect,
  });

  if (!batch) {
    return null;
  }

  return buildLeadImportBatchProgress({
    status: batch.status,
    stage: batch.stage,
    totalRows: batch.totalRows,
    successRows: batch.successRows,
    failedRows: batch.failedRows,
    duplicateRows: batch.duplicateRows,
    errorMessage: batch.errorMessage,
    processingStartedAt: batch.processingStartedAt,
    lastHeartbeatAt: batch.lastHeartbeatAt,
    importedAt: batch.importedAt,
  });
}

export async function getLeadImportDetailData(
  viewer: LeadImportViewer,
  batchId: string,
  requestedRollbackMode: LeadImportBatchRollbackMode = "AUDIT_PRESERVED",
) {
  assertAccess(viewer.role);

  const batch = await prisma.leadImportBatch.findFirst({
    where: {
      AND: [{ id: batchId }, buildLeadImportBatchVisibilityWhere(viewer)],
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      status: true,
      stage: true,
      defaultLeadSource: true,
      mappingConfig: true,
      headers: true,
      totalRows: true,
      successRows: true,
      failedRows: true,
      duplicateRows: true,
      createdCustomerRows: true,
      matchedCustomerRows: true,
      report: true,
      importedAt: true,
      errorMessage: true,
      processingStartedAt: true,
      lastHeartbeatAt: true,
      createdAt: true,
      createdBy: {
        select: {
          name: true,
          username: true,
        },
      },
      template: {
        select: {
          id: true,
          name: true,
        },
      },
      rollback: {
        select: {
          id: true,
          mode: true,
          executedAt: true,
          precheckSnapshot: true,
          executionSnapshot: true,
          actor: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      },
      rows: {
        orderBy: { rowNumber: "asc" },
        take: 200,
        select: {
          id: true,
          rowNumber: true,
          status: true,
          phoneRaw: true,
          normalizedPhone: true,
          mappedName: true,
          errorReason: true,
          rawData: true,
          mappedData: true,
          dedupType: true,
          matchedLeadId: true,
          importedLeadId: true,
          mergeLogs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              action: true,
              customerId: true,
              phone: true,
              tagSynced: true,
              note: true,
              createdAt: true,
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
          },
        },
      },
      dedupLogs: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          rowId: true,
          phone: true,
          dedupType: true,
          matchedLeadId: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });

  if (!batch) {
    return null;
  }

  const importKind = getLeadImportBatchKind(batch.report);
  const mode = getLeadImportModeFromKind(importKind);
  const selectedRollbackMode = getSafeRollbackMode(
    viewer.role,
    importKind,
    requestedRollbackMode,
  );
  const parsedCustomerContinuationReport = parseCustomerContinuationBatchReport(batch.report);
  const rollbackPreview =
    !batch.rollback && batch.status === LeadImportBatchStatus.COMPLETED
      ? await getLeadImportBatchRollbackPreview(viewer, batch.id, selectedRollbackMode)
      : null;
  const executedRollbackPrecheck = batch.rollback
    ? parseLeadImportBatchRollbackPrecheckSnapshot(batch.rollback.precheckSnapshot)
    : null;
  const executedRollbackExecution = batch.rollback
    ? parseLeadImportBatchRollbackExecutionSnapshot(batch.rollback.executionSnapshot)
    : null;
  const activeRollbackPrecheck = rollbackPreview?.precheck ?? executedRollbackPrecheck ?? null;
  const rollbackPreviewByRowNumber = new Map(
    (activeRollbackPrecheck?.rows ?? []).map((row) => [row.rowNumber, row]),
  );
  const rollbackExecutionByRowNumber = new Map(
    (executedRollbackExecution?.rows ?? []).map((row) => [row.rowNumber, row]),
  );
  const rawRows = batch.rows.map((row) => ({
    ...row,
    customerMerge: row.mergeLogs[0] ?? null,
    customerContinuation: parseCustomerContinuationRowMappedData(row.mappedData),
    duplicateCustomer: parseDuplicateCustomerFromLeadImportRow(row.mappedData),
  }));
  const rows = rawRows.map((row) => {
    return {
      ...row,
      rollback: {
        preview: rollbackPreviewByRowNumber.get(row.rowNumber) ?? null,
        execution: rollbackExecutionByRowNumber.get(row.rowNumber) ?? null,
      },
    };
  });

  const failureRows = rows.filter((row) => row.status === LeadImportRowStatus.FAILED);
  const duplicateRows = rows.filter((row) => row.status === LeadImportRowStatus.DUPLICATE);
  const importedRows = rows.filter((row) => row.status === LeadImportRowStatus.IMPORTED);
  const customerContinuationGroupedRows =
    mode === "customer_continuation"
      ? {
          createdAssignedRows: importedRows.filter(
            (row) =>
              getCustomerContinuationResultBucket({
                status: row.status,
                customerContinuation: row.customerContinuation,
              }) === "created_assigned",
          ),
          matchedAssignedRows: importedRows.filter(
            (row) =>
              getCustomerContinuationResultBucket({
                status: row.status,
                customerContinuation: row.customerContinuation,
              }) === "matched_assigned",
          ),
          matchedKeptExistingRows: importedRows.filter(
            (row) =>
              getCustomerContinuationResultBucket({
                status: row.status,
                customerContinuation: row.customerContinuation,
              }) === "matched_kept_existing",
          ),
          publicPoolRows: importedRows.filter(
            (row) =>
              getCustomerContinuationResultBucket({
                status: row.status,
                customerContinuation: row.customerContinuation,
              }) === "public_pool",
          ),
        }
      : null;
  const customerContinuationResultSummary =
    mode === "customer_continuation"
      ? buildCustomerContinuationResultGroupCounts(rows)
      : null;
  const derivedCustomerContinuationMetrics = buildCustomerContinuationMetrics(rows);
  const customerContinuationMetrics = resolveCustomerContinuationMetrics(
    parsedCustomerContinuationReport,
    derivedCustomerContinuationMetrics,
  );
  const progress = buildLeadImportBatchProgress({
    status: batch.status,
    stage: batch.stage,
    totalRows: batch.totalRows,
    successRows: batch.successRows,
    failedRows: batch.failedRows,
    duplicateRows: batch.duplicateRows,
    errorMessage: batch.errorMessage,
    processingStartedAt: batch.processingStartedAt,
    lastHeartbeatAt: batch.lastHeartbeatAt,
    importedAt: batch.importedAt,
  });
  const customerContinuationMetricsEstimated =
    mode === "customer_continuation" &&
    (!parsedCustomerContinuationReport ||
      typeof parsedCustomerContinuationReport.summary.categoryACustomers !== "number") &&
    batch.totalRows > rows.length;

  return {
    ...batch,
    importKind,
    mode,
    modeMeta: getLeadImportModeMeta(mode),
    progress,
    customerContinuationReport: parsedCustomerContinuationReport,
    customerContinuationMetrics,
    customerContinuationMetricsEstimated,
    customerContinuationResultSummary,
    customerContinuationGroupedRows,
    rows,
    rollback: {
      selectedMode: selectedRollbackMode,
      selectedModeLabel: getLeadImportBatchRollbackModeLabel(selectedRollbackMode),
      selectedModeDescription: getLeadImportBatchRollbackModeDescription(
        selectedRollbackMode,
      ),
      selectedModeVariant: getLeadImportBatchRollbackModeVariant(selectedRollbackMode),
      availableModes: [
        {
          value: "AUDIT_PRESERVED" as const,
          label: getLeadImportBatchRollbackModeLabel("AUDIT_PRESERVED"),
          description: getLeadImportBatchRollbackModeDescription("AUDIT_PRESERVED"),
          variant: getLeadImportBatchRollbackModeVariant("AUDIT_PRESERVED"),
        },
        ...(importKind === "LEAD" && canExecuteLeadImportBatchHardDelete(viewer.role)
          ? [
              {
                value: "HARD_DELETE" as const,
                label: getLeadImportBatchRollbackModeLabel("HARD_DELETE"),
                description: getLeadImportBatchRollbackModeDescription("HARD_DELETE"),
                variant: getLeadImportBatchRollbackModeVariant("HARD_DELETE"),
              },
            ]
          : []),
      ],
      preview: rollbackPreview,
      currentPrecheck: activeRollbackPrecheck,
      executed: batch.rollback
        ? {
            id: batch.rollback.id,
            mode: batch.rollback.mode,
            modeLabel: getLeadImportBatchRollbackModeLabel(batch.rollback.mode),
            modeVariant: getLeadImportBatchRollbackModeVariant(batch.rollback.mode),
            executedAt: batch.rollback.executedAt,
            actor: batch.rollback.actor,
            precheck: executedRollbackPrecheck,
            execution: executedRollbackExecution,
          }
        : null,
    },
    reportMetrics: buildReportMetrics({
      importKind,
      totalRows: batch.totalRows,
      successRows: batch.successRows,
      createdCustomerRows: batch.createdCustomerRows,
      matchedCustomerRows: batch.matchedCustomerRows,
      duplicateRows: batch.duplicateRows,
      failedRows: batch.failedRows,
    }),
    failureRows,
    duplicateRows,
    importedRows,
  };
}

export async function getLeadImportTemplatePageData(viewer: LeadImportViewer) {
  assertAccess(viewer.role);

  const items = await prisma.leadImportTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      mappingConfig: true,
      defaultLeadSource: true,
      isActive: true,
      createdAt: true,
      createdBy: {
        select: {
          name: true,
          username: true,
        },
      },
      _count: {
        select: {
          batches: true,
        },
      },
    },
  });

  return {
    items,
    sourceOptions: leadImportSourceOptions,
  };
}
