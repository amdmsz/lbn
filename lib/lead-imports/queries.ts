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
  LEAD_IMPORT_PAGE_SIZE,
  leadImportSourceOptions,
  parseLeadImportNotice,
} from "@/lib/lead-imports/metadata";

type SearchParamsValue = string | string[] | undefined;

export type LeadImportViewer = {
  id: string;
  role: RoleCode;
};

export type LeadImportListFilters = {
  keyword: string;
  status: LeadImportBatchStatus | "";
  page: number;
};

const listFiltersSchema = z.object({
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
    throw new Error("当前角色无权访问线索导入中心。");
  }
}

export function parseLeadImportListFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  const rawStatus = getParamValue(searchParams?.status);

  return listFiltersSchema.parse({
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

  const [
    totalCount,
    totalRowsAggregate,
    completedCount,
    importingCount,
    failedCount,
    draftCount,
  ] = await Promise.all([
    prisma.leadImportBatch.count({ where }),
    prisma.leadImportBatch.aggregate({
      where,
      _sum: {
        totalRows: true,
        successRows: true,
        failedRows: true,
        duplicateRows: true,
        createdCustomerRows: true,
        matchedCustomerRows: true,
      },
    }),
    prisma.leadImportBatch.count({
      where: {
        AND: [where, { status: LeadImportBatchStatus.COMPLETED }],
      },
    }),
    prisma.leadImportBatch.count({
      where: {
        AND: [where, { status: LeadImportBatchStatus.IMPORTING }],
      },
    }),
    prisma.leadImportBatch.count({
      where: {
        AND: [where, { OR: [{ status: LeadImportBatchStatus.FAILED }, { failedRows: { gt: 0 } }] }],
      },
    }),
    prisma.leadImportBatch.count({
      where: {
        AND: [where, { status: LeadImportBatchStatus.DRAFT }],
      },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / LEAD_IMPORT_PAGE_SIZE));
  const currentPage = Math.min(filters.page, totalPages);
  const [items, successBatches, duplicateBatches, failedBatches] = await Promise.all([
    prisma.leadImportBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * LEAD_IMPORT_PAGE_SIZE,
      take: LEAD_IMPORT_PAGE_SIZE,
      select: batchSelect,
    }),
    prisma.leadImportBatch.findMany({
      where: {
        AND: [where, { successRows: { gt: 0 } }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: batchSelect,
    }),
    prisma.leadImportBatch.findMany({
      where: {
        AND: [where, { duplicateRows: { gt: 0 } }],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: batchSelect,
    }),
    prisma.leadImportBatch.findMany({
      where: {
        AND: [
          where,
          {
            OR: [
              { status: LeadImportBatchStatus.FAILED },
              { failedRows: { gt: 0 } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: batchSelect,
    }),
  ]);

  return {
    notice: parseLeadImportNotice(rawSearchParams),
    filters: {
      ...filters,
      page: currentPage,
    },
    items,
    overview: {
      totalBatches: totalCount,
      completedBatches: completedCount,
      importingBatches: importingCount,
      failedBatches: failedCount,
      draftBatches: draftCount,
    },
    statistics: {
      totalRows: totalRowsAggregate._sum.totalRows ?? 0,
      successRows: totalRowsAggregate._sum.successRows ?? 0,
      failedRows: totalRowsAggregate._sum.failedRows ?? 0,
      duplicateRows: totalRowsAggregate._sum.duplicateRows ?? 0,
      createdCustomerRows: totalRowsAggregate._sum.createdCustomerRows ?? 0,
      matchedCustomerRows: totalRowsAggregate._sum.matchedCustomerRows ?? 0,
    },
    partitions: {
      success: successBatches,
      duplicate: duplicateBatches,
      failed: failedBatches,
    },
    sourceOptions: leadImportSourceOptions,
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

  const rows = batch.rows.map((row) => ({
    ...row,
    customerMerge: row.mergeLogs[0] ?? null,
  }));

  const failureRows = rows.filter((row) => row.status === LeadImportRowStatus.FAILED);
  const duplicateRows = rows.filter((row) => row.status === LeadImportRowStatus.DUPLICATE);
  const importedRows = rows.filter((row) => row.status === LeadImportRowStatus.IMPORTED);

  return {
    ...batch,
    rows,
    reportMetrics: [
      { label: "总行数", value: batch.totalRows },
      { label: "成功导入线索", value: batch.successRows },
      { label: "新增客户", value: batch.createdCustomerRows },
      { label: "关联已有客户", value: batch.matchedCustomerRows },
      { label: "重复剔除", value: batch.duplicateRows },
      { label: "失败行", value: batch.failedRows },
    ],
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
