import {
  CollectionTaskStatus,
  CollectionTaskType,
  PaymentRecordChannel,
  PaymentRecordStatus,
  PaymentSourceType,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import {
  canAccessCollectionTaskModule,
  canAccessPaymentRecordModule,
} from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  buildCollectionTaskScope,
  buildPaymentRecordScope,
  type PaymentScopedViewer,
} from "@/lib/payments/scope";

type SearchParamsValue = string | string[] | undefined;

export type PaymentViewer = {
  id: string;
  role: RoleCode;
};

export type PaymentRecordFilters = {
  keyword: string;
  sourceType: "" | PaymentSourceType;
  status: "" | PaymentRecordStatus;
  channel: "" | PaymentRecordChannel;
  occurredFrom: string;
  occurredTo: string;
  page: number;
};

export type CollectionTaskFilters = {
  keyword: string;
  ownerId: string;
  sourceType: "" | PaymentSourceType;
  taskType: "" | CollectionTaskType;
  status: "" | CollectionTaskStatus;
  dueState: "" | "OVERDUE" | "DUE_SOON" | "NO_DUE_DATE";
  page: number;
};

const paymentRecordFiltersSchema = z.object({
  keyword: z.string().trim().default(""),
  sourceType: z.enum(["", "SALES_ORDER", "GIFT_RECORD"]).default(""),
  status: z.enum(["", "SUBMITTED", "CONFIRMED", "REJECTED"]).default(""),
  channel: z
    .enum([
      "",
      "ORDER_FORM_DECLARED",
      "BANK_TRANSFER",
      "WECHAT_TRANSFER",
      "ALIPAY_TRANSFER",
      "COD",
      "CASH",
      "OTHER",
    ])
    .default(""),
  occurredFrom: z.string().trim().default(""),
  occurredTo: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).default(1),
});

const collectionTaskFiltersSchema = z.object({
  keyword: z.string().trim().default(""),
  ownerId: z.string().trim().default(""),
  sourceType: z.enum(["", "SALES_ORDER", "GIFT_RECORD"]).default(""),
  taskType: z
    .enum(["", "BALANCE_COLLECTION", "COD_COLLECTION", "FREIGHT_COLLECTION", "GENERAL_COLLECTION"])
    .default(""),
  status: z.enum(["", "PENDING", "IN_PROGRESS", "COMPLETED", "CANCELED"]).default(""),
  dueState: z.enum(["", "OVERDUE", "DUE_SOON", "NO_DUE_DATE"]).default(""),
  page: z.coerce.number().int().min(1).default(1),
});

const PAYMENT_RECORD_PAGE_SIZE = 10;
const COLLECTION_TASK_PAGE_SIZE = 10;

async function getViewerTeamId(viewer: PaymentScopedViewer) {
  if (viewer.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

export function parsePaymentRecordFilters(
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  return paymentRecordFiltersSchema.parse({
    keyword: getParamValue(rawSearchParams?.keyword),
    sourceType: getParamValue(rawSearchParams?.sourceType),
    status: getParamValue(rawSearchParams?.status),
    channel: getParamValue(rawSearchParams?.channel),
    occurredFrom: getParamValue(rawSearchParams?.occurredFrom),
    occurredTo: getParamValue(rawSearchParams?.occurredTo),
    page: getParamValue(rawSearchParams?.page) || "1",
  });
}

export function parseCollectionTaskFilters(
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  return collectionTaskFiltersSchema.parse({
    keyword: getParamValue(rawSearchParams?.keyword),
    ownerId: getParamValue(rawSearchParams?.ownerId),
    sourceType: getParamValue(rawSearchParams?.sourceType),
    taskType: getParamValue(rawSearchParams?.taskType),
    status: getParamValue(rawSearchParams?.status),
    dueState: getParamValue(rawSearchParams?.dueState),
    page: getParamValue(rawSearchParams?.page) || "1",
  });
}

export async function getPaymentOwnerOptions(viewer: PaymentViewer) {
  const teamId = await getViewerTeamId(viewer);

  if (viewer.role === "SALES") {
    return prisma.user.findMany({
      where: {
        id: viewer.id,
      },
      select: {
        id: true,
        name: true,
        username: true,
      },
    });
  }

  return prisma.user.findMany({
    where: {
      userStatus: UserStatus.ACTIVE,
      ...(viewer.role === "SUPERVISOR" && teamId ? { teamId } : {}),
      role: {
        code: {
          in: ["ADMIN", "SUPERVISOR", "SALES"],
        },
      },
    },
    orderBy: [{ name: "asc" }, { username: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
    },
  });
}

function buildPaymentRecordWhere(
  viewer: PaymentViewer,
  teamId: string | null,
  filters: PaymentRecordFilters,
): Prisma.PaymentRecordWhereInput {
  const andClauses: Prisma.PaymentRecordWhereInput[] = [
    buildPaymentRecordScope(viewer, teamId),
  ];

  if (filters.keyword) {
    andClauses.push({
      OR: [
        { salesOrder: { orderNo: { contains: filters.keyword } } },
        { giftRecord: { giftName: { contains: filters.keyword } } },
        { customer: { name: { contains: filters.keyword } } },
        { customer: { phone: { contains: filters.keyword } } },
        { owner: { is: { name: { contains: filters.keyword } } } },
        { owner: { is: { username: { contains: filters.keyword } } } },
        { referenceNo: { contains: filters.keyword } },
      ],
    });
  }

  if (filters.sourceType) {
    andClauses.push({ sourceType: filters.sourceType });
  }

  if (filters.status) {
    andClauses.push({ status: filters.status });
  }

  if (filters.channel) {
    andClauses.push({ channel: filters.channel });
  }

  if (filters.occurredFrom || filters.occurredTo) {
    const occurredAt: Prisma.DateTimeFilter = {};

    if (filters.occurredFrom) {
      occurredAt.gte = new Date(filters.occurredFrom);
    }

    if (filters.occurredTo) {
      const end = new Date(filters.occurredTo);
      end.setHours(23, 59, 59, 999);
      occurredAt.lte = end;
    }

    andClauses.push({ occurredAt });
  }

  return { AND: andClauses };
}

function buildCollectionTaskWhere(
  viewer: PaymentViewer,
  teamId: string | null,
  filters: CollectionTaskFilters,
): Prisma.CollectionTaskWhereInput {
  const andClauses: Prisma.CollectionTaskWhereInput[] = [
    buildCollectionTaskScope(viewer, teamId),
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueSoon = new Date(today);
  dueSoon.setDate(dueSoon.getDate() + 2);

  if (filters.keyword) {
    andClauses.push({
      OR: [
        { salesOrder: { orderNo: { contains: filters.keyword } } },
        { giftRecord: { giftName: { contains: filters.keyword } } },
        { customer: { name: { contains: filters.keyword } } },
        { customer: { phone: { contains: filters.keyword } } },
        { owner: { name: { contains: filters.keyword } } },
        { owner: { username: { contains: filters.keyword } } },
      ],
    });
  }

  if (filters.ownerId) {
    andClauses.push({ ownerId: filters.ownerId });
  }

  if (filters.sourceType) {
    andClauses.push({ sourceType: filters.sourceType });
  }

  if (filters.taskType) {
    andClauses.push({ taskType: filters.taskType });
  }

  if (filters.status) {
    andClauses.push({ status: filters.status });
  }

  if (filters.dueState === "OVERDUE") {
    andClauses.push({ dueAt: { lt: today } });
    andClauses.push({
      status: {
        in: [CollectionTaskStatus.PENDING, CollectionTaskStatus.IN_PROGRESS],
      },
    });
  }

  if (filters.dueState === "DUE_SOON") {
    andClauses.push({ dueAt: { gte: today, lte: dueSoon } });
    andClauses.push({
      status: {
        in: [CollectionTaskStatus.PENDING, CollectionTaskStatus.IN_PROGRESS],
      },
    });
  }

  if (filters.dueState === "NO_DUE_DATE") {
    andClauses.push({ dueAt: null });
  }

  return { AND: andClauses };
}

export async function getPaymentRecordsPageData(
  viewer: PaymentViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessPaymentRecordModule(viewer.role)) {
    throw new Error("You do not have access to payment records.");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parsePaymentRecordFilters(rawSearchParams);
  const where = buildPaymentRecordWhere(viewer, teamId, filters);

  const [totalCount, ownerOptions] = await Promise.all([
    prisma.paymentRecord.count({ where }),
    getPaymentOwnerOptions(viewer),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAYMENT_RECORD_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.paymentRecord.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * PAYMENT_RECORD_PAGE_SIZE,
    take: PAYMENT_RECORD_PAGE_SIZE,
    select: {
      id: true,
      sourceType: true,
      amount: true,
      channel: true,
      status: true,
      occurredAt: true,
      referenceNo: true,
      remark: true,
      createdAt: true,
      paymentPlan: {
        select: {
          id: true,
          subjectType: true,
          stageType: true,
          collectionChannel: true,
          plannedAmount: true,
          submittedAmount: true,
          confirmedAmount: true,
          remainingAmount: true,
          status: true,
        },
      },
      salesOrder: {
        select: {
          id: true,
          orderNo: true,
        },
      },
      giftRecord: {
        select: {
          id: true,
          giftName: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          shippingStatus: true,
          trackingNumber: true,
        },
      },
      submittedBy: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      confirmedBy: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  });

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: {
      ...filters,
      page,
    },
    items: items.map((item) => ({
      ...item,
      amount: item.amount.toString(),
      paymentPlan: {
        ...item.paymentPlan,
        plannedAmount: item.paymentPlan.plannedAmount.toString(),
        submittedAmount: item.paymentPlan.submittedAmount.toString(),
        confirmedAmount: item.paymentPlan.confirmedAmount.toString(),
        remainingAmount: item.paymentPlan.remainingAmount.toString(),
      },
    })),
    ownerOptions,
    pagination: {
      page,
      pageSize: PAYMENT_RECORD_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export async function getCollectionTasksPageData(
  viewer: PaymentViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessCollectionTaskModule(viewer.role)) {
    throw new Error("You do not have access to collection tasks.");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseCollectionTaskFilters(rawSearchParams);
  const where = buildCollectionTaskWhere(viewer, teamId, filters);

  const [totalCount, ownerOptions] = await Promise.all([
    prisma.collectionTask.count({ where }),
    getPaymentOwnerOptions(viewer),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / COLLECTION_TASK_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.collectionTask.findMany({
    where,
    orderBy: [{ nextFollowUpAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    skip: (page - 1) * COLLECTION_TASK_PAGE_SIZE,
    take: COLLECTION_TASK_PAGE_SIZE,
    select: {
      id: true,
      sourceType: true,
      taskType: true,
      status: true,
      dueAt: true,
      nextFollowUpAt: true,
      lastContactAt: true,
      closedAt: true,
      remark: true,
      createdAt: true,
      salesOrder: {
        select: {
          id: true,
          orderNo: true,
        },
      },
      giftRecord: {
        select: {
          id: true,
          giftName: true,
        },
      },
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          shippingStatus: true,
          trackingNumber: true,
        },
      },
      paymentPlan: {
        select: {
          id: true,
          subjectType: true,
          stageType: true,
          collectionChannel: true,
          plannedAmount: true,
          submittedAmount: true,
          confirmedAmount: true,
          remainingAmount: true,
          status: true,
        },
      },
    },
  });

  return {
    notice: parseActionNotice(rawSearchParams),
    filters: {
      ...filters,
      page,
    },
    items: items.map((item) => ({
      ...item,
      paymentPlan: {
        ...item.paymentPlan,
        plannedAmount: item.paymentPlan.plannedAmount.toString(),
        submittedAmount: item.paymentPlan.submittedAmount.toString(),
        confirmedAmount: item.paymentPlan.confirmedAmount.toString(),
        remainingAmount: item.paymentPlan.remainingAmount.toString(),
      },
    })),
    ownerOptions,
    pagination: {
      page,
      pageSize: COLLECTION_TASK_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}
