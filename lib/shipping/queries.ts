import {
  ShippingFulfillmentStatus,
  ShippingReportStatus,
  ShippingTaskStatus,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import {
  canAccessShippingModule,
  getShippingTaskScope,
} from "@/lib/auth/access";
import { SHIPPING_PAGE_SIZE } from "@/lib/fulfillment/metadata";
import { prisma } from "@/lib/db/prisma";
import {
  resolveShippingExportFileStatus,
  type ShippingExportFileState,
} from "@/lib/shipping/file-state";

type SearchParamsValue = string | string[] | undefined;

export type ShippingViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

export type ShippingListFilters = {
  customerId: string;
  assigneeId: string;
  status: "" | ShippingTaskStatus;
  page: number;
};

const filtersSchema = z.object({
  customerId: z.string().trim().default(""),
  assigneeId: z.string().trim().default(""),
  status: z.enum(["", "PENDING", "PROCESSING", "SHIPPED", "COMPLETED", "CANCELED"]).default(""),
  page: z.coerce.number().int().min(1).default(1),
});

export function parseShippingListFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  return filtersSchema.parse({
    customerId: getParamValue(searchParams?.customerId),
    assigneeId: getParamValue(searchParams?.assigneeId),
    status: getParamValue(searchParams?.status),
    page: getParamValue(searchParams?.page) || "1",
  });
}

function buildShippingWhereInput(viewer: ShippingViewer, filters: ShippingListFilters) {
  const scope = getShippingTaskScope(viewer.role, viewer.id, viewer.teamId);

  if (!scope) {
    throw new Error("You do not have access to shipping tasks.");
  }

  const andClauses: Prisma.ShippingTaskWhereInput[] = [scope];

  if (filters.customerId) {
    andClauses.push({ customerId: filters.customerId });
  }

  if (filters.assigneeId) {
    andClauses.push({ assigneeId: filters.assigneeId });
  }

  if (filters.status) {
    andClauses.push({ status: filters.status });
  }

  return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
}

async function getVisibleCustomers(viewer: ShippingViewer) {
  const scope =
    viewer.role === "SALES"
      ? { ownerId: viewer.id }
      : viewer.role === "SUPERVISOR"
        ? viewer.teamId
          ? { owner: { is: { teamId: viewer.teamId } } }
          : { id: "__missing_shipping_customer_team_scope__" }
        : {};

  return prisma.customer.findMany({
    where: scope,
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      name: true,
      phone: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  });
}

async function getVisibleOrderOptions(viewer: ShippingViewer) {
  const scope =
    viewer.role === "SALES"
      ? { customer: { ownerId: viewer.id } }
      : viewer.role === "SUPERVISOR"
        ? viewer.teamId
          ? {
              OR: [
                { owner: { is: { teamId: viewer.teamId } } },
                { customer: { owner: { is: { teamId: viewer.teamId } } } },
              ],
            }
          : { id: "__missing_shipping_order_team_scope__" }
        : {};

  return prisma.order.findMany({
    where: {
      ...scope,
      shippingTask: null,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      type: true,
      createdAt: true,
      customerId: true,
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });
}

async function getVisibleGiftOptions(viewer: ShippingViewer) {
  const scope =
    viewer.role === "SALES"
      ? { customer: { ownerId: viewer.id } }
      : viewer.role === "SUPERVISOR"
        ? viewer.teamId
          ? {
              OR: [
                { sales: { is: { teamId: viewer.teamId } } },
                { customer: { owner: { is: { teamId: viewer.teamId } } } },
              ],
            }
          : { id: "__missing_shipping_gift_team_scope__" }
        : {};

  return prisma.giftRecord.findMany({
    where: {
      ...scope,
      shippingTask: null,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      giftName: true,
      createdAt: true,
      customerId: true,
      customer: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });
}

export async function getShippingPageData(
  viewer: ShippingViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessShippingModule(viewer.role)) {
    throw new Error("You do not have access to shipping tasks.");
  }

  const filters = parseShippingListFilters(rawSearchParams);
  const where = buildShippingWhereInput(viewer, filters);
  const [totalCount, customers, assignees, orderOptions, giftOptions] =
    await Promise.all([
      prisma.shippingTask.count({ where }),
      getVisibleCustomers(viewer),
      prisma.user.findMany({
        where: {
          userStatus: UserStatus.ACTIVE,
          role: {
            code: "SHIPPER",
          },
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          username: true,
        },
      }),
      getVisibleOrderOptions(viewer),
      getVisibleGiftOptions(viewer),
    ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / SHIPPING_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.shippingTask.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * SHIPPING_PAGE_SIZE,
    take: SHIPPING_PAGE_SIZE,
    select: {
      id: true,
      customerId: true,
      content: true,
      screenshotUrl: true,
      trackingNumber: true,
      status: true,
      shippedAt: true,
      remark: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          owner: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      },
      order: {
        select: {
          id: true,
          type: true,
        },
      },
      giftRecord: {
        select: {
          id: true,
          giftName: true,
        },
      },
      assignee: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  });

  return {
    filters: {
      ...filters,
      page,
    },
    items,
    customers,
    assignees,
    orderOptions,
    giftOptions,
    pagination: {
      page,
      pageSize: SHIPPING_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export type ShippingStageView =
  | "PENDING_REPORT"
  | "PENDING_TRACKING"
  | "SHIPPED"
  | "EXCEPTION";

type ShippingBatchPreview = {
  id: string;
  exportNo: string;
  fileUrl: string | null;
  exportedAt: Date;
  lineCount: number;
  fileState: ShippingExportFileState;
  canDownload: boolean;
  canRegenerate: boolean;
};

export type ShippingPendingBatchSummary = ShippingBatchPreview & {
  taskCount: number;
};

export type ShippingOperationsFilters = {
  keyword: string;
  supplierKeyword: string;
  supplierId: string;
  supplierViewId: string;
  batchViewId: string;
  stageView: ShippingStageView;
  reportStatus: "" | ShippingReportStatus;
  shippingStatus: "" | ShippingFulfillmentStatus;
  shippingStage: "" | "SHIPPED_PLUS";
  isCod: "" | "true" | "false";
  hasTrackingNumber: "" | "true" | "false";
  page: number;
};

export type ShippingSupplierSummary = {
  supplier: {
    id: string;
    name: string;
  };
  stageTaskCount: number;
  hasException: boolean;
  exceptionCount: number;
  hasFileIssue: boolean;
  hasPendingTracking: boolean;
  pendingTrackingCount: number;
  currentBatch: ShippingBatchPreview | null;
  latestHistoryBatch: ShippingBatchPreview | null;
};

export type ShippingOperationsItem = {
  id: string;
  reportStatus: "PENDING" | "REPORTED";
  shippingStatus:
    | "PENDING"
    | "READY_TO_SHIP"
    | "SHIPPED"
    | "DELIVERED"
    | "COMPLETED"
    | "CANCELED";
  shippingProvider: string | null;
  trackingNumber: string | null;
  codAmount: string;
  insuranceRequired: boolean;
  insuranceAmount: string;
  reportedAt: Date | null;
  shippedAt: Date | null;
  createdAt: Date;
  exportBatch: {
    id: string;
    exportNo: string;
    fileUrl: string | null;
  } | null;
  tradeOrder: {
    id: string;
    tradeNo: string;
  } | null;
  supplier: {
    id: string;
    name: string;
  } | null;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  salesOrder: {
    id: string;
    orderNo: string;
    subOrderNo: string | null;
    tradeOrder: {
      id: string;
      tradeNo: string;
    } | null;
    reviewStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
    paymentScheme:
      | "FULL_PREPAID"
      | "DEPOSIT_PLUS_BALANCE"
      | "FULL_COD"
      | "DEPOSIT_PLUS_COD";
    receiverNameSnapshot: string;
    receiverPhoneSnapshot: string;
    receiverAddressSnapshot: string;
    items: Array<{
      id: string;
      skuNameSnapshot: string;
      specSnapshot: string;
      qty: number;
    }>;
  } | null;
  codCollectionRecords: Array<{
    id: string;
    status:
      | "PENDING_COLLECTION"
      | "COLLECTED"
      | "EXCEPTION"
      | "REJECTED"
      | "UNCOLLECTED";
    expectedAmount: string;
    collectedAmount: string;
    occurredAt: Date | null;
    remark: string | null;
    paymentRecord: {
      id: string;
      amount: string;
      status: "SUBMITTED" | "CONFIRMED" | "REJECTED";
      occurredAt: Date;
    } | null;
  }>;
};

function createShippingBatchPreview(input: {
  id: string;
  exportNo: string;
  fileUrl: string | null;
  exportedAt: Date;
  lineCount: number;
  fileState: ShippingExportFileState;
  canDownload: boolean;
  canRegenerate: boolean;
}): ShippingBatchPreview {
  return {
    id: input.id,
    exportNo: input.exportNo,
    fileUrl: input.fileUrl,
    exportedAt: input.exportedAt,
    lineCount: input.lineCount,
    fileState: input.fileState,
    canDownload: input.canDownload,
    canRegenerate: input.canRegenerate,
  };
}

function createShippingPendingBatchSummary(
  preview: ShippingBatchPreview,
  taskCount: number,
): ShippingPendingBatchSummary {
  return {
    ...preview,
    taskCount,
  };
}

export type ShippingExportBatchFilters = {
  keyword: string;
  supplierId: string;
  fileView: "" | ShippingExportFileState;
  page: number;
};

export type ShippingExportBatchItem = {
  id: string;
  exportNo: string;
  orderCount: number;
  subOrderCount: number;
  tradeOrderCount: number;
  fileName: string;
  fileUrl: string | null;
  remark: string | null;
  exportedAt: Date;
  fileState: ShippingExportFileState;
  canDownload: boolean;
  canRegenerate: boolean;
  supplier: {
    id: string;
    name: string;
  };
  exportedBy: {
    id: string;
    name: string;
    username: string;
  } | null;
  sourceTradeOrders: Array<{
    id: string;
    tradeNo: string;
  }>;
  stageSummary: {
    pendingTrackingCount: number;
    shippedCount: number;
  };
  _count: {
    shippingTasks: number;
    lines: number;
  };
};

const shippingExportBatchListSelect = {
  id: true,
  exportNo: true,
  orderCount: true,
  subOrderCount: true,
  tradeOrderCount: true,
  fileName: true,
  fileUrl: true,
  remark: true,
  exportedAt: true,
  supplier: {
    select: {
      id: true,
      name: true,
    },
  },
  exportedBy: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
  _count: {
    select: {
      shippingTasks: true,
      lines: true,
    },
  },
  lines: {
    orderBy: [{ rowNo: "asc" }],
    select: {
      tradeOrderId: true,
      tradeNoSnapshot: true,
      shippingTask: {
        select: {
          reportStatus: true,
          shippingStatus: true,
          trackingNumber: true,
        },
      },
    },
  },
} satisfies Prisma.ShippingExportBatchSelect;

type ShippingExportBatchListRecord = Prisma.ShippingExportBatchGetPayload<{
  select: typeof shippingExportBatchListSelect;
}>;

const shippingOperationsFiltersSchema = z.object({
  keyword: z.string().trim().default(""),
  supplierKeyword: z.string().trim().default(""),
  supplierId: z.string().trim().default(""),
  supplierViewId: z.string().trim().default(""),
  batchViewId: z.string().trim().default(""),
  stageView: z.string().trim().default(""),
  reportStatus: z.enum(["", "PENDING", "REPORTED"]).default(""),
  shippingStatus: z
    .enum(["", "PENDING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "COMPLETED", "CANCELED"])
    .default(""),
  shippingStage: z.enum(["", "SHIPPED_PLUS"]).default(""),
  isCod: z.enum(["", "true", "false"]).default(""),
  hasTrackingNumber: z.enum(["", "true", "false"]).default(""),
  page: z.coerce.number().int().min(1).default(1),
});

const SHIPPING_OPERATIONS_PAGE_SIZE = 10;
const SHIPPING_EXPORT_BATCH_PAGE_SIZE = 10;
const shippingExportBatchFiltersSchema = z.object({
  keyword: z.string().trim().default(""),
  supplierId: z.string().trim().default(""),
  fileView: z.enum(["", "READY", "MISSING", "MISSING_FILE", "LEGACY", "PENDING"]).default(""),
  page: z.coerce.number().int().min(1).default(1),
});

function isShippingStageView(value: string): value is ShippingStageView {
  return (
    value === "PENDING_REPORT" ||
    value === "PENDING_TRACKING" ||
    value === "SHIPPED" ||
    value === "EXCEPTION"
  );
}

async function getViewerTeamId(viewer: ShippingViewer) {
  if (viewer.role !== "SUPERVISOR") {
    return null;
  }

  if (viewer.teamId !== undefined) {
    return viewer.teamId ?? null;
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function resolveShippingStageView(
  rawStageView: string,
  reportStatus: ShippingOperationsFilters["reportStatus"],
  shippingStatus: ShippingOperationsFilters["shippingStatus"],
  shippingStage: ShippingOperationsFilters["shippingStage"],
  hasTrackingNumber: ShippingOperationsFilters["hasTrackingNumber"],
) {
  if (isShippingStageView(rawStageView)) {
    return rawStageView;
  }

  if (shippingStatus === "CANCELED") {
    return "EXCEPTION";
  }

  if (
    shippingStage === "SHIPPED_PLUS" ||
    shippingStatus === "SHIPPED" ||
    shippingStatus === "DELIVERED" ||
    shippingStatus === "COMPLETED"
  ) {
    return "SHIPPED";
  }

  if (reportStatus === "REPORTED" || hasTrackingNumber === "false") {
    return "PENDING_TRACKING";
  }

  return "PENDING_REPORT";
}

export function parseShippingOperationsFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  const parsed = shippingOperationsFiltersSchema.parse({
    keyword: getParamValue(searchParams?.keyword),
    supplierKeyword: getParamValue(searchParams?.supplierKeyword),
    supplierId: getParamValue(searchParams?.supplierId),
    supplierViewId: getParamValue(searchParams?.supplierViewId),
    batchViewId: getParamValue(searchParams?.batchViewId),
    stageView: getParamValue(searchParams?.stageView),
    reportStatus: getParamValue(searchParams?.reportStatus),
    shippingStatus: getParamValue(searchParams?.shippingStatus),
    shippingStage: getParamValue(searchParams?.shippingStage),
    isCod: getParamValue(searchParams?.isCod),
    hasTrackingNumber: getParamValue(searchParams?.hasTrackingNumber),
    page: getParamValue(searchParams?.page) || "1",
  });

  return {
    ...parsed,
    supplierViewId: parsed.supplierViewId || parsed.supplierId,
    stageView: resolveShippingStageView(
      parsed.stageView,
      parsed.reportStatus,
      parsed.shippingStatus,
      parsed.shippingStage,
      parsed.hasTrackingNumber,
    ),
  } satisfies ShippingOperationsFilters;
}

export function parseShippingExportBatchFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  const parsed = shippingExportBatchFiltersSchema.parse({
    keyword: getParamValue(searchParams?.keyword),
    supplierId: getParamValue(searchParams?.supplierId),
    fileView: getParamValue(searchParams?.fileView),
    page: getParamValue(searchParams?.page) || "1",
  });

  return {
    ...parsed,
    fileView: parsed.fileView === "MISSING_FILE" ? "MISSING" : parsed.fileView,
  };
}

function buildTrackingMissingWhere(): Prisma.ShippingTaskWhereInput {
  return {
    OR: [{ trackingNumber: null }, { trackingNumber: "" }],
  };
}

function buildTrackingFilledWhere(): Prisma.ShippingTaskWhereInput {
  return {
    AND: [{ trackingNumber: { not: null } }, { trackingNumber: { not: "" } }],
  };
}

function buildShippingOperationsBaseWhere(
  viewer: ShippingViewer,
  teamId: string | null,
  filters: ShippingOperationsFilters,
): Prisma.ShippingTaskWhereInput {
  const andClauses: Prisma.ShippingTaskWhereInput[] = [
    {
      salesOrderId: { not: null },
      supplierId: { not: null },
      salesOrder: {
        reviewStatus: "APPROVED",
      },
    },
  ];

  if (viewer.role === "SUPERVISOR") {
    andClauses.push(
      teamId
        ? {
            OR: [
              { salesOrder: { owner: { is: { teamId } } } },
              { salesOrder: { customer: { owner: { is: { teamId } } } } },
            ],
          }
        : { id: "__missing_shipping_scope__" },
    );
  }

  if (filters.keyword) {
    andClauses.push({
      OR: [
        { trackingNumber: { contains: filters.keyword } },
        { shippingProvider: { contains: filters.keyword } },
        { customer: { name: { contains: filters.keyword } } },
        { customer: { phone: { contains: filters.keyword } } },
        { tradeOrder: { is: { tradeNo: { contains: filters.keyword } } } },
        { supplier: { is: { name: { contains: filters.keyword } } } },
        { salesOrder: { is: { orderNo: { contains: filters.keyword } } } },
        { salesOrder: { is: { subOrderNo: { contains: filters.keyword } } } },
        { salesOrder: { is: { receiverNameSnapshot: { contains: filters.keyword } } } },
        { salesOrder: { is: { receiverPhoneSnapshot: { contains: filters.keyword } } } },
      ],
    });
  }

  if (filters.reportStatus) {
    andClauses.push({ reportStatus: filters.reportStatus });
  }

  if (filters.shippingStatus) {
    andClauses.push({ shippingStatus: filters.shippingStatus });
  }

  if (filters.shippingStage === "SHIPPED_PLUS") {
    andClauses.push({
      shippingStatus: {
        in: [
          ShippingFulfillmentStatus.SHIPPED,
          ShippingFulfillmentStatus.DELIVERED,
          ShippingFulfillmentStatus.COMPLETED,
        ],
      },
    });
  }

  if (filters.isCod === "true") {
    andClauses.push({
      codAmount: {
        gt: 0,
      },
    });
  }

  if (filters.isCod === "false") {
    andClauses.push({
      codAmount: {
        lte: 0,
      },
    });
  }

  if (filters.hasTrackingNumber === "true") {
    andClauses.push(buildTrackingFilledWhere());
  }

  if (filters.hasTrackingNumber === "false") {
    andClauses.push(buildTrackingMissingWhere());
  }

  return { AND: andClauses };
}

function buildShippingExceptionWhere(): Prisma.ShippingTaskWhereInput {
  return {
    OR: [
      { shippingStatus: ShippingFulfillmentStatus.CANCELED },
      {
        AND: [{ tradeOrderId: null }, { salesOrder: { is: { tradeOrderId: null } } }],
      },
      {
        AND: [{ reportStatus: ShippingReportStatus.PENDING }, buildTrackingFilledWhere()],
      },
      {
        AND: [
          { reportStatus: ShippingReportStatus.REPORTED },
          { exportBatch: { is: { fileUrl: null } } },
        ],
      },
    ],
  };
}

function buildShippingStageWhere(stageView: ShippingStageView): Prisma.ShippingTaskWhereInput {
  switch (stageView) {
    case "PENDING_TRACKING":
      return {
        AND: [
          { reportStatus: ShippingReportStatus.REPORTED },
          buildTrackingMissingWhere(),
          { NOT: buildShippingExceptionWhere() },
        ],
      };
    case "SHIPPED":
      return {
        AND: [
          {
            shippingStatus: {
              in: [
                ShippingFulfillmentStatus.SHIPPED,
                ShippingFulfillmentStatus.DELIVERED,
                ShippingFulfillmentStatus.COMPLETED,
              ],
            },
          },
          { NOT: buildShippingExceptionWhere() },
        ],
      };
    case "EXCEPTION":
      return buildShippingExceptionWhere();
    case "PENDING_REPORT":
    default:
      return {
        AND: [
          { reportStatus: ShippingReportStatus.PENDING },
          buildTrackingMissingWhere(),
          { NOT: buildShippingExceptionWhere() },
        ],
      };
  }
}

function buildShippingBatchWhere(
  viewer: ShippingViewer,
  teamId: string | null,
  supplierIds: string[],
): Prisma.ShippingExportBatchWhereInput {
  const andClauses: Prisma.ShippingExportBatchWhereInput[] = [];

  if (supplierIds.length > 0) {
    andClauses.push({ supplierId: { in: supplierIds } });
  }

  if (viewer.role === "SUPERVISOR") {
    andClauses.push(
      teamId
        ? {
            shippingTasks: {
              some: {
                OR: [
                  { salesOrder: { owner: { is: { teamId } } } },
                  { salesOrder: { customer: { owner: { is: { teamId } } } } },
                ],
              },
            },
          }
        : { id: "__missing_shipping_batch_scope__" },
    );
  }

  return andClauses.length > 0 ? { AND: andClauses } : {};
}

function buildShippingExportBatchListWhere(
  viewer: ShippingViewer,
  teamId: string | null,
  filters: ShippingExportBatchFilters,
): Prisma.ShippingExportBatchWhereInput {
  const andClauses: Prisma.ShippingExportBatchWhereInput[] = [];

  if (viewer.role === "SUPERVISOR") {
    andClauses.push(
      teamId
        ? {
            shippingTasks: {
              some: {
                OR: [
                  { salesOrder: { owner: { is: { teamId } } } },
                  { salesOrder: { customer: { owner: { is: { teamId } } } } },
                ],
              },
            },
          }
        : { id: "__missing_shipping_batch_scope__" },
    );
  }

  if (filters.supplierId) {
    andClauses.push({
      supplierId: filters.supplierId,
    });
  }

  if (filters.keyword) {
    andClauses.push({
      OR: [
        { exportNo: { contains: filters.keyword } },
        { fileName: { contains: filters.keyword } },
        { remark: { contains: filters.keyword } },
        { supplier: { is: { name: { contains: filters.keyword } } } },
        { lines: { some: { tradeNoSnapshot: { contains: filters.keyword } } } },
        { lines: { some: { subOrderNoSnapshot: { contains: filters.keyword } } } },
        { lines: { some: { receiverNameSnapshot: { contains: filters.keyword } } } },
        { lines: { some: { receiverPhoneSnapshot: { contains: filters.keyword } } } },
        { lines: { some: { productSummarySnapshot: { contains: filters.keyword } } } },
      ],
    });
  }

  return andClauses.length > 0 ? { AND: andClauses } : {};
}

type ShippingSupplierRow = {
  supplierId: string | null;
  supplier: {
    id: string;
    name: string;
  } | null;
};

function buildSupplierSummaries(
  rows: ShippingSupplierRow[],
  currentBatchBySupplierId: Map<string, ShippingSupplierSummary["currentBatch"]>,
  latestHistoryBatchBySupplierId: Map<string, ShippingSupplierSummary["latestHistoryBatch"]>,
  exceptionSupplierIds: Set<string>,
  exceptionCounts: Map<string, number>,
  pendingTrackingCounts: Map<string, number>,
) {
  const summaries = new Map<string, ShippingSupplierSummary>();

  for (const row of rows) {
    if (!row.supplierId || !row.supplier) {
      continue;
    }

    const existing = summaries.get(row.supplierId);

    if (existing) {
      existing.stageTaskCount += 1;
      continue;
    }

    const currentBatch = currentBatchBySupplierId.get(row.supplierId) ?? null;
    const latestHistoryBatch = latestHistoryBatchBySupplierId.get(row.supplierId) ?? null;
    const pendingTrackingCount = pendingTrackingCounts.get(row.supplierId) ?? 0;
    const exceptionCount = exceptionCounts.get(row.supplierId) ?? 0;

    summaries.set(row.supplierId, {
      supplier: {
        id: row.supplier.id,
        name: row.supplier.name,
      },
      stageTaskCount: 1,
      hasException: exceptionSupplierIds.has(row.supplierId),
      exceptionCount,
      hasFileIssue: Boolean(
        currentBatch &&
          (currentBatch.fileState === "MISSING" || currentBatch.fileState === "PENDING"),
      ),
      hasPendingTracking: pendingTrackingCount > 0,
      pendingTrackingCount,
      currentBatch,
      latestHistoryBatch,
    });
  }

  return Array.from(summaries.values()).sort(
    (left, right) =>
      right.stageTaskCount - left.stageTaskCount ||
      left.supplier.name.localeCompare(right.supplier.name),
  );
}

function isShippedFulfillmentStatus(
  status:
    | "PENDING"
    | "READY_TO_SHIP"
    | "SHIPPED"
    | "DELIVERED"
    | "COMPLETED"
    | "CANCELED",
) {
  return (
    status === "SHIPPED" || status === "DELIVERED" || status === "COMPLETED"
  );
}

function matchesShippingExportFileView(
  fileView: ShippingExportBatchFilters["fileView"],
  fileState: ShippingExportFileState,
) {
  return !fileView || fileView === fileState;
}

async function serializeShippingExportBatchItems(
  items: ShippingExportBatchListRecord[],
): Promise<ShippingExportBatchItem[]> {
  return Promise.all(
    items.map(async (item) => {
      const sourceTradeOrders = Array.from(
        new Map(
          item.lines.map((line) => [
            line.tradeOrderId,
            {
              id: line.tradeOrderId,
              tradeNo: line.tradeNoSnapshot,
            },
          ]),
        ).values(),
      ).slice(0, 4);
      const fileStatus = await resolveShippingExportFileStatus({
        fileUrl: item.fileUrl,
        lineCount: item._count.lines,
      });
      const pendingTrackingCount =
        fileStatus.state === "READY"
          ? item.lines.filter(
              (line) =>
                line.shippingTask &&
                line.shippingTask.reportStatus === "REPORTED" &&
                !isShippedFulfillmentStatus(line.shippingTask.shippingStatus) &&
                line.shippingTask.shippingStatus !== "CANCELED" &&
                !line.shippingTask.trackingNumber?.trim(),
            ).length
          : 0;
      const shippedCount = item.lines.filter(
        (line) =>
          line.shippingTask &&
          isShippedFulfillmentStatus(line.shippingTask.shippingStatus),
      ).length;

      return {
        id: item.id,
        exportNo: item.exportNo,
        orderCount: item.orderCount,
        subOrderCount: item.subOrderCount,
        tradeOrderCount: item.tradeOrderCount,
        fileName: item.fileName,
        fileUrl: item.fileUrl,
        remark: item.remark,
        exportedAt: item.exportedAt,
        fileState: fileStatus.state,
        canDownload: fileStatus.canDownload,
        canRegenerate: fileStatus.canRegenerate,
        supplier: item.supplier,
        exportedBy: item.exportedBy,
        sourceTradeOrders,
        stageSummary: {
          pendingTrackingCount,
          shippedCount,
        },
        _count: item._count,
      } satisfies ShippingExportBatchItem;
    }),
  );
}

export async function getShippingOperationsPageData(
  viewer: ShippingViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessShippingModule(viewer.role)) {
    throw new Error("当前角色无权访问发货执行。");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseShippingOperationsFilters(rawSearchParams);
  const baseWhere = buildShippingOperationsBaseWhere(viewer, teamId, filters);

  const pendingReportWhere = { AND: [baseWhere, buildShippingStageWhere("PENDING_REPORT")] };
  const pendingTrackingWhere = { AND: [baseWhere, buildShippingStageWhere("PENDING_TRACKING")] };
  const shippedWhere = { AND: [baseWhere, buildShippingStageWhere("SHIPPED")] };
  const exceptionWhere = { AND: [baseWhere, buildShippingStageWhere("EXCEPTION")] };
  const currentStageWhere = { AND: [baseWhere, buildShippingStageWhere(filters.stageView)] };

  const [
    totalCount,
    pendingReportCount,
    pendingTrackingCount,
    shippedCount,
    exceptionCount,
    supplierRows,
  ] = await Promise.all([
    prisma.shippingTask.count({ where: baseWhere }),
    prisma.shippingTask.count({ where: pendingReportWhere }),
    prisma.shippingTask.count({ where: pendingTrackingWhere }),
    prisma.shippingTask.count({ where: shippedWhere }),
    prisma.shippingTask.count({ where: exceptionWhere }),
    prisma.shippingTask.findMany({
      where: currentStageWhere,
      orderBy: [{ supplier: { name: "asc" } }, { createdAt: "desc" }],
      select: {
        supplierId: true,
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const supplierIds = Array.from(
    new Set(
      supplierRows
        .map((row) => row.supplierId)
        .filter((supplierId): supplierId is string => Boolean(supplierId)),
    ),
  );

  const [exceptionRows, pendingTrackingRows, currentStageBatchRows, latestHistoryBatchRows] = supplierIds.length
    ? await Promise.all([
        prisma.shippingTask.findMany({
          where: {
            AND: [baseWhere, { supplierId: { in: supplierIds } }, buildShippingStageWhere("EXCEPTION")],
          },
          select: {
            supplierId: true,
          },
        }),
        prisma.shippingTask.findMany({
          where: {
            AND: [
              baseWhere,
              { supplierId: { in: supplierIds } },
              buildShippingStageWhere("PENDING_TRACKING"),
            ],
          },
          select: {
            supplierId: true,
          },
        }),
        prisma.shippingTask.findMany({
          where: {
            AND: [
              currentStageWhere,
              { supplierId: { in: supplierIds } },
              { exportBatchId: { not: null } },
            ],
          },
          select: {
            supplierId: true,
            exportBatch: {
              select: {
                id: true,
                exportNo: true,
                fileUrl: true,
                exportedAt: true,
                _count: {
                  select: {
                    lines: true,
                  },
                },
              },
            },
          },
        }),
        prisma.shippingExportBatch.findMany({
          where: buildShippingBatchWhere(viewer, teamId, supplierIds),
          orderBy: [{ supplierId: "asc" }, { exportedAt: "desc" }],
          select: {
            id: true,
            exportNo: true,
            supplierId: true,
            fileUrl: true,
            exportedAt: true,
            _count: {
              select: {
                lines: true,
              },
            },
          },
        }),
      ])
    : [[], [], [], []];

  const batchPreviewCache = new Map<string, ShippingBatchPreview>();
  const getBatchPreview = async (batch: {
    id: string;
    exportNo: string;
    fileUrl: string | null;
    exportedAt: Date;
    _count: {
      lines: number;
    };
  }) => {
    const cached = batchPreviewCache.get(batch.id);

    if (cached) {
      return cached;
    }

    const fileStatus = await resolveShippingExportFileStatus({
      fileUrl: batch.fileUrl,
      lineCount: batch._count.lines,
    });

    const preview = createShippingBatchPreview({
      id: batch.id,
      exportNo: batch.exportNo,
      fileUrl: batch.fileUrl,
      exportedAt: batch.exportedAt,
      lineCount: batch._count.lines,
      fileState: fileStatus.state,
      canDownload: fileStatus.canDownload,
      canRegenerate: fileStatus.canRegenerate,
    });

    batchPreviewCache.set(batch.id, preview);
    return preview;
  };

  const currentBatchBySupplierId = new Map<string, ShippingSupplierSummary["currentBatch"]>();
  const pendingBatchSummariesBySupplierId = new Map<
    string,
    Map<string, ShippingPendingBatchSummary>
  >();

  for (const row of currentStageBatchRows) {
    if (!row.supplierId || !row.exportBatch) {
      continue;
    }

    const preview = await getBatchPreview(row.exportBatch);
    const existing = currentBatchBySupplierId.get(row.supplierId);

    if (!existing || existing.exportedAt < preview.exportedAt) {
      currentBatchBySupplierId.set(row.supplierId, preview);
    }

    const supplierBatchSummaries =
      pendingBatchSummariesBySupplierId.get(row.supplierId) ?? new Map<string, ShippingPendingBatchSummary>();
    const existingBatchSummary = supplierBatchSummaries.get(preview.id);

    if (existingBatchSummary) {
      existingBatchSummary.taskCount += 1;
    } else {
      supplierBatchSummaries.set(preview.id, createShippingPendingBatchSummary(preview, 1));
    }

    pendingBatchSummariesBySupplierId.set(row.supplierId, supplierBatchSummaries);
  }

  const latestHistoryBatchBySupplierId = new Map<string, ShippingSupplierSummary["latestHistoryBatch"]>();
  for (const batch of latestHistoryBatchRows) {
    if (latestHistoryBatchBySupplierId.has(batch.supplierId)) {
      continue;
    }

    latestHistoryBatchBySupplierId.set(
      batch.supplierId,
      await getBatchPreview(batch),
    );
  }

  const exceptionCounts = new Map<string, number>();
  for (const row of exceptionRows) {
    if (!row.supplierId) {
      continue;
    }

    exceptionCounts.set(row.supplierId, (exceptionCounts.get(row.supplierId) ?? 0) + 1);
  }

  const pendingTrackingCounts = new Map<string, number>();
  for (const row of pendingTrackingRows) {
    if (!row.supplierId) {
      continue;
    }

    pendingTrackingCounts.set(
      row.supplierId,
      (pendingTrackingCounts.get(row.supplierId) ?? 0) + 1,
    );
  }

  const supplierSummaries = buildSupplierSummaries(
    supplierRows,
    currentBatchBySupplierId,
    latestHistoryBatchBySupplierId,
    new Set(
      exceptionRows
        .map((row) => row.supplierId)
        .filter((supplierId): supplierId is string => Boolean(supplierId)),
    ),
    exceptionCounts,
    pendingTrackingCounts,
  );
  const visibleSupplierSummaries = filters.supplierKeyword
    ? supplierSummaries.filter((supplier) =>
        supplier.supplier.name
          .toLocaleLowerCase()
          .includes(filters.supplierKeyword.toLocaleLowerCase()),
      )
    : supplierSummaries;

  const activeSupplierId =
    visibleSupplierSummaries.find((supplier) => supplier.supplier.id === filters.supplierViewId)?.supplier.id ??
    visibleSupplierSummaries[0]?.supplier.id ??
    "";

  const activeSupplier =
    visibleSupplierSummaries.find((supplier) => supplier.supplier.id === activeSupplierId) ?? null;
  const pendingBatchSummaries = activeSupplier
    ? Array.from(
        (pendingBatchSummariesBySupplierId.get(activeSupplier.supplier.id) ?? new Map()).values(),
      ).sort(
        (left, right) =>
          right.exportedAt.getTime() - left.exportedAt.getTime() ||
          right.taskCount - left.taskCount,
      )
    : [];
  const activeBatchId =
    filters.stageView === "PENDING_TRACKING"
      ? pendingBatchSummaries.find((batch) => batch.id === filters.batchViewId)?.id ??
        pendingBatchSummaries[0]?.id ??
        ""
      : "";
  const activeBatch =
    pendingBatchSummaries.find((batch) => batch.id === activeBatchId) ?? null;

  const activeSupplierWhere = activeSupplierId
    ? {
        AND: [
          currentStageWhere,
          { supplierId: activeSupplierId },
          ...(filters.stageView === "PENDING_TRACKING" && activeBatchId
            ? [{ exportBatchId: activeBatchId }]
            : []),
        ],
      }
    : { id: "__empty_shipping_supplier_pool__" };

  const activeSupplierTotalCount = activeSupplierId
    ? await prisma.shippingTask.count({ where: activeSupplierWhere })
    : 0;
  const totalPages = Math.max(1, Math.ceil(activeSupplierTotalCount / SHIPPING_OPERATIONS_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const itemRows = activeSupplierId
    ? await prisma.shippingTask.findMany({
        where: activeSupplierWhere,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * SHIPPING_OPERATIONS_PAGE_SIZE,
        take: SHIPPING_OPERATIONS_PAGE_SIZE,
        select: {
          id: true,
          reportStatus: true,
          shippingStatus: true,
          shippingProvider: true,
          trackingNumber: true,
          codAmount: true,
          insuranceRequired: true,
          insuranceAmount: true,
          reportedAt: true,
          shippedAt: true,
          createdAt: true,
          exportBatch: {
            select: {
              id: true,
              exportNo: true,
              fileUrl: true,
            },
          },
          tradeOrder: {
            select: {
              id: true,
              tradeNo: true,
            },
          },
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          salesOrder: {
            select: {
              id: true,
              orderNo: true,
              subOrderNo: true,
              tradeOrder: {
                select: {
                  id: true,
                  tradeNo: true,
                },
              },
              reviewStatus: true,
              paymentScheme: true,
              receiverNameSnapshot: true,
              receiverPhoneSnapshot: true,
              receiverAddressSnapshot: true,
              items: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  skuNameSnapshot: true,
                  specSnapshot: true,
                  qty: true,
                },
              },
            },
          },
          codCollectionRecords: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              expectedAmount: true,
              collectedAmount: true,
              occurredAt: true,
              remark: true,
              paymentRecord: {
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  occurredAt: true,
                },
              },
            },
          },
        },
      })
    : [];

  const activeBatchItems =
    activeSupplierId && activeBatch && filters.stageView === "PENDING_TRACKING"
      ? await prisma.shippingTask.findMany({
          where: {
            AND: [
              currentStageWhere,
              { supplierId: activeSupplierId },
              { exportBatchId: activeBatch.id },
            ],
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            reportStatus: true,
            shippingStatus: true,
            shippingProvider: true,
            trackingNumber: true,
            codAmount: true,
            insuranceRequired: true,
            insuranceAmount: true,
            reportedAt: true,
            shippedAt: true,
            createdAt: true,
            exportBatch: {
              select: {
                id: true,
                exportNo: true,
                fileUrl: true,
              },
            },
            tradeOrder: {
              select: {
                id: true,
                tradeNo: true,
              },
            },
            supplier: {
              select: {
                id: true,
                name: true,
              },
            },
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
            salesOrder: {
              select: {
                id: true,
                orderNo: true,
                subOrderNo: true,
                tradeOrder: {
                  select: {
                    id: true,
                    tradeNo: true,
                  },
                },
                reviewStatus: true,
                paymentScheme: true,
                receiverNameSnapshot: true,
                receiverPhoneSnapshot: true,
                receiverAddressSnapshot: true,
                items: {
                  orderBy: { createdAt: "asc" },
                  select: {
                    id: true,
                    skuNameSnapshot: true,
                    specSnapshot: true,
                    qty: true,
                  },
                },
              },
            },
            codCollectionRecords: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                expectedAmount: true,
                collectedAmount: true,
                occurredAt: true,
                remark: true,
                paymentRecord: {
                  select: {
                    id: true,
                    amount: true,
                    status: true,
                    occurredAt: true,
                  },
                },
              },
            },
          },
        })
      : [];

  return {
    notice: parseActionNotice(rawSearchParams),
    summary: {
      totalCount,
      pendingReportCount,
      pendingTrackingCount,
      shippedCount,
      exceptionCount,
      supplierCount: supplierSummaries.length,
    },
    filters: {
      ...filters,
      batchViewId: activeBatchId,
      supplierViewId: activeSupplierId,
      page,
    },
    supplierSummaries: visibleSupplierSummaries,
    activeSupplier,
    pendingBatchSummaries,
    activeBatch,
    items: itemRows.map((item) => ({
      ...item,
      codAmount: item.codAmount.toString(),
      insuranceAmount: item.insuranceAmount.toString(),
      codCollectionRecords: item.codCollectionRecords.map((record) => ({
        ...record,
        expectedAmount: record.expectedAmount.toString(),
        collectedAmount: record.collectedAmount.toString(),
        paymentRecord: record.paymentRecord
          ? {
              ...record.paymentRecord,
              amount: record.paymentRecord.amount.toString(),
            }
          : null,
      })),
    })) satisfies ShippingOperationsItem[],
    activeBatchItems: activeBatchItems.map((item) => ({
      ...item,
      codAmount: item.codAmount.toString(),
      insuranceAmount: item.insuranceAmount.toString(),
      codCollectionRecords: item.codCollectionRecords.map((record) => ({
        ...record,
        expectedAmount: record.expectedAmount.toString(),
        collectedAmount: record.collectedAmount.toString(),
        paymentRecord: record.paymentRecord
          ? {
              ...record.paymentRecord,
              amount: record.paymentRecord.amount.toString(),
            }
          : null,
      })),
    })) satisfies ShippingOperationsItem[],
    pagination: {
      page,
      pageSize: SHIPPING_OPERATIONS_PAGE_SIZE,
      totalCount: activeSupplierTotalCount,
      totalPages,
    },
  };
}

export async function getShippingExportBatchesPageData(
  viewer: ShippingViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessShippingModule(viewer.role)) {
    throw new Error("当前角色无权访问报单批次。");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseShippingExportBatchFilters(rawSearchParams);
  const batchWhere = buildShippingExportBatchListWhere(viewer, teamId, filters);

  if (!filters.fileView) {
    const totalCount = await prisma.shippingExportBatch.count({
      where: batchWhere,
    });
    const totalPages = Math.max(1, Math.ceil(totalCount / SHIPPING_EXPORT_BATCH_PAGE_SIZE));
    const page = Math.min(filters.page, totalPages);
    const rawItems = await prisma.shippingExportBatch.findMany({
      where: batchWhere,
      orderBy: { exportedAt: "desc" },
      skip: (page - 1) * SHIPPING_EXPORT_BATCH_PAGE_SIZE,
      take: SHIPPING_EXPORT_BATCH_PAGE_SIZE,
      select: shippingExportBatchListSelect,
    });
    const items = await serializeShippingExportBatchItems(rawItems);

    return {
      notice: parseActionNotice(rawSearchParams),
      filters: {
        ...filters,
        page,
      },
      items,
      pagination: {
        page,
        pageSize: SHIPPING_EXPORT_BATCH_PAGE_SIZE,
        totalCount,
        totalPages,
      },
    };
  }

  const rawItems = await prisma.shippingExportBatch.findMany({
    where: batchWhere,
    orderBy: { exportedAt: "desc" },
    select: shippingExportBatchListSelect,
  });
  const items = (await serializeShippingExportBatchItems(rawItems)).filter((item) =>
    matchesShippingExportFileView(filters.fileView, item.fileState),
  );
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / SHIPPING_EXPORT_BATCH_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);
  const pagedItems = items.slice(
    (page - 1) * SHIPPING_EXPORT_BATCH_PAGE_SIZE,
    page * SHIPPING_EXPORT_BATCH_PAGE_SIZE,
  );

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: {
      ...filters,
      page,
    },
    items: pagedItems,
    pagination: {
      page,
      pageSize: SHIPPING_EXPORT_BATCH_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}
