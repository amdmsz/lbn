import {
  LeadImportBatchStatus,
  LeadImportRowStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canAccessLeadImportModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  collectCustomerContinuationCategories,
  getCustomerContinuationOutcomeBadges,
} from "@/lib/lead-imports/customer-continuation-signals";
import {
  LEAD_IMPORT_PAGE_SIZE,
  getLeadImportBatchKind,
  getLeadImportMode,
  getLeadImportModeFromKind,
  getLeadImportModeMeta,
  leadImportSourceOptions,
  parseLeadImportNotice,
  type CustomerContinuationBatchReport,
  type CustomerContinuationRowMappedData,
  type LeadImportKind,
  type LeadImportMode,
} from "@/lib/lead-imports/metadata";

type SearchParamsValue = string | string[] | undefined;

export type LeadImportViewer = {
  id: string;
  role: RoleCode;
};

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
  if (!canAccessLeadImportModule(role)) {
    throw new Error("当前角色无权访问导入中心。");
  }
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

function matchesMode(kind: LeadImportKind, mode: LeadImportMode) {
  return getLeadImportModeFromKind(kind) === mode;
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
    defaultLeadSource: true,
    totalRows: true,
    successRows: true,
    failedRows: true,
    duplicateRows: true,
    createdCustomerRows: true,
    matchedCustomerRows: true,
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
  } satisfies Prisma.LeadImportBatchSelect;

  const batches = await prisma.leadImportBatch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: batchSelect,
  });

  const filteredBatches = batches
    .map((batch) => {
      const importKind = getLeadImportBatchKind(batch.report);
      return {
        ...batch,
        importKind,
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

  const overview = filteredBatches.reduce(
    (summary, batch) => {
      summary.totalBatches += 1;

      if (batch.status === LeadImportBatchStatus.COMPLETED) {
        summary.completedBatches += 1;
      }
      if (batch.status === LeadImportBatchStatus.IMPORTING) {
        summary.importingBatches += 1;
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
      failedBatches: 0,
      draftBatches: 0,
    },
  );

  const statistics = filteredBatches.reduce(
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

  return {
    notice: parseLeadImportNotice(rawSearchParams),
    mode: filters.mode,
    modeMeta: getLeadImportModeMeta(filters.mode),
    filters: {
      ...filters,
      page: currentPage,
    },
    items: pagedItems,
    overview,
    statistics,
    partitions: {
      success: filteredBatches.filter((batch) => batch.successRows > 0).slice(0, 5),
      duplicate: filteredBatches.filter((batch) => batch.duplicateRows > 0).slice(0, 5),
      failed: filteredBatches
        .filter(
          (batch) =>
            batch.status === LeadImportBatchStatus.FAILED || batch.failedRows > 0,
        )
        .slice(0, 5),
    },
    sourceOptions: leadImportSourceOptions,
    customerContinuationPreviewLookups,
    pagination: {
      page: currentPage,
      pageSize: LEAD_IMPORT_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export async function getLeadImportDetailData(
  viewer: LeadImportViewer,
  batchId: string,
) {
  assertAccess(viewer.role);

  const batch = await prisma.leadImportBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      status: true,
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
              tagSynced: true,
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
  const parsedCustomerContinuationReport = parseCustomerContinuationBatchReport(batch.report);

  const rows = batch.rows.map((row) => ({
    ...row,
    customerMerge: row.mergeLogs[0] ?? null,
    customerContinuation: parseCustomerContinuationRowMappedData(row.mappedData),
  }));

  const failureRows = rows.filter((row) => row.status === LeadImportRowStatus.FAILED);
  const duplicateRows = rows.filter((row) => row.status === LeadImportRowStatus.DUPLICATE);
  const importedRows = rows.filter((row) => row.status === LeadImportRowStatus.IMPORTED);
  const derivedCustomerContinuationMetrics = buildCustomerContinuationMetrics(rows);
  const customerContinuationMetrics = resolveCustomerContinuationMetrics(
    parsedCustomerContinuationReport,
    derivedCustomerContinuationMetrics,
  );
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
    customerContinuationReport: parsedCustomerContinuationReport,
    customerContinuationMetrics,
    customerContinuationMetricsEstimated,
    rows,
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
