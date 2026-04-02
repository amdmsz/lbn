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

type SearchParamsValue = string | string[] | undefined;

export type ShippingViewer = {
  id: string;
  role: RoleCode;
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
  const scope = getShippingTaskScope(viewer.role, viewer.id);

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
  const scope = viewer.role === "SALES" ? { ownerId: viewer.id } : {};

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
  const scope = viewer.role === "SALES" ? { customer: { ownerId: viewer.id } } : {};

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
  const scope = viewer.role === "SALES" ? { customer: { ownerId: viewer.id } } : {};

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

export type ShippingOperationsFilters = {
  keyword: string;
  supplierId: string;
  reportStatus: "" | ShippingReportStatus;
  shippingStatus: "" | ShippingFulfillmentStatus;
  isCod: "" | "true" | "false";
  hasTrackingNumber: "" | "true" | "false";
  page: number;
};

const shippingOperationsFiltersSchema = z.object({
  keyword: z.string().trim().default(""),
  supplierId: z.string().trim().default(""),
  reportStatus: z.enum(["", "PENDING", "REPORTED"]).default(""),
  shippingStatus: z
    .enum(["", "PENDING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "COMPLETED", "CANCELED"])
    .default(""),
  isCod: z.enum(["", "true", "false"]).default(""),
  hasTrackingNumber: z.enum(["", "true", "false"]).default(""),
  page: z.coerce.number().int().min(1).default(1),
});

const SHIPPING_OPERATIONS_PAGE_SIZE = 10;
const SHIPPING_EXPORT_BATCH_PAGE_SIZE = 10;

async function getViewerTeamId(viewer: ShippingViewer) {
  if (viewer.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

export function parseShippingOperationsFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  return shippingOperationsFiltersSchema.parse({
    keyword: getParamValue(searchParams?.keyword),
    supplierId: getParamValue(searchParams?.supplierId),
    reportStatus: getParamValue(searchParams?.reportStatus),
    shippingStatus: getParamValue(searchParams?.shippingStatus),
    isCod: getParamValue(searchParams?.isCod),
    hasTrackingNumber: getParamValue(searchParams?.hasTrackingNumber),
    page: getParamValue(searchParams?.page) || "1",
  });
}

function buildShippingOperationsWhere(
  viewer: ShippingViewer,
  teamId: string | null,
  filters: ShippingOperationsFilters,
): Prisma.ShippingTaskWhereInput {
  const andClauses: Prisma.ShippingTaskWhereInput[] = [
    {
      salesOrderId: { not: null },
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

  if (filters.supplierId) {
    andClauses.push({ supplierId: filters.supplierId });
  }

  if (filters.keyword) {
    andClauses.push({
      OR: [
        { trackingNumber: { contains: filters.keyword } },
        { shippingProvider: { contains: filters.keyword } },
        { customer: { name: { contains: filters.keyword } } },
        { customer: { phone: { contains: filters.keyword } } },
        { supplier: { is: { name: { contains: filters.keyword } } } },
        { salesOrder: { is: { orderNo: { contains: filters.keyword } } } },
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
    andClauses.push({
      AND: [{ trackingNumber: { not: null } }, { trackingNumber: { not: "" } }],
    });
  }

  if (filters.hasTrackingNumber === "false") {
    andClauses.push({
      OR: [{ trackingNumber: null }, { trackingNumber: "" }],
    });
  }

  return { AND: andClauses };
}

export async function getShippingOperationsPageData(
  viewer: ShippingViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessShippingModule(viewer.role)) {
    throw new Error("当前角色无权访问发货中心。");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseShippingOperationsFilters(rawSearchParams);
  const where = buildShippingOperationsWhere(viewer, teamId, filters);

  const [
    totalCount,
    pendingReportCount,
    pendingTrackingCount,
    shippedCount,
    deliveredCount,
    codTaskCount,
    suppliers,
  ] = await Promise.all([
    prisma.shippingTask.count({ where }),
    prisma.shippingTask.count({
      where: {
        AND: [where, { reportStatus: ShippingReportStatus.PENDING }],
      },
    }),
    prisma.shippingTask.count({
      where: {
        AND: [
          where,
          { reportStatus: ShippingReportStatus.REPORTED },
          {
            OR: [{ trackingNumber: null }, { trackingNumber: "" }],
          },
        ],
      },
    }),
    prisma.shippingTask.count({
      where: {
        AND: [where, { shippingStatus: ShippingFulfillmentStatus.SHIPPED }],
      },
    }),
    prisma.shippingTask.count({
      where: {
        AND: [
          where,
          {
            shippingStatus: {
              in: [
                ShippingFulfillmentStatus.DELIVERED,
                ShippingFulfillmentStatus.COMPLETED,
              ],
            },
          },
        ],
      },
    }),
    prisma.shippingTask.count({
      where: {
        AND: [
          where,
          {
            codAmount: {
              gt: 0,
            },
          },
        ],
      },
    }),
    prisma.supplier.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / SHIPPING_OPERATIONS_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.shippingTask.findMany({
    where,
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
      logisticsFollowUpTasks: {
        orderBy: [{ nextTriggerAt: "asc" }, { createdAt: "desc" }],
        take: 3,
        select: {
          id: true,
          status: true,
          nextTriggerAt: true,
          owner: {
            select: {
              id: true,
              name: true,
              username: true,
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
      exportBatch: {
        select: {
          id: true,
          exportNo: true,
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
          reviewStatus: true,
          paymentScheme: true,
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          items: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              productNameSnapshot: true,
              qty: true,
            },
          },
        },
      },
    },
  });

  return {
    notice: parseActionNotice(rawSearchParams),
    summary: {
      totalCount,
      pendingReportCount,
      pendingTrackingCount,
      shippedCount,
      deliveredCount,
      codTaskCount,
    },
    filters: {
      ...filters,
      page,
    },
    items: items.map((item) => ({
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
    })),
    suppliers,
    pagination: {
      page,
      pageSize: SHIPPING_OPERATIONS_PAGE_SIZE,
      totalCount,
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
  const batchWhere: Prisma.ShippingExportBatchWhereInput =
    viewer.role === "SUPERVISOR"
      ? teamId
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
        : { id: "__missing_shipping_batch_scope__" }
      : {};

  const totalCount = await prisma.shippingExportBatch.count({ where: batchWhere });
  const totalPages = Math.max(1, Math.ceil(totalCount / SHIPPING_EXPORT_BATCH_PAGE_SIZE));
  const page = Math.min(
    Number(getParamValue(rawSearchParams?.page) || "1"),
    totalPages,
  );

  const items = await prisma.shippingExportBatch.findMany({
    where: batchWhere,
    orderBy: { exportedAt: "desc" },
    skip: (page - 1) * SHIPPING_EXPORT_BATCH_PAGE_SIZE,
    take: SHIPPING_EXPORT_BATCH_PAGE_SIZE,
    select: {
      id: true,
      exportNo: true,
      orderCount: true,
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
        },
      },
    },
  });

  return {
    notice: parseActionNotice(rawSearchParams),
    items,
    pagination: {
      page,
      pageSize: SHIPPING_EXPORT_BATCH_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}
