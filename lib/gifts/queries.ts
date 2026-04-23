import {
  GiftReviewStatus,
  ShippingStatus,
  UserStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canAccessGiftModule,
  getGiftScope,
} from "@/lib/auth/access";
import { GIFTS_PAGE_SIZE } from "@/lib/fulfillment/metadata";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type GiftViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

export type GiftListFilters = {
  customerId: string;
  reviewStatus: "" | GiftReviewStatus;
  shippingStatus: "" | ShippingStatus;
  page: number;
};

const filtersSchema = z.object({
  customerId: z.string().trim().default(""),
  reviewStatus: z.enum(["", "PENDING_REVIEW", "APPROVED", "REJECTED"]).default(""),
  shippingStatus: z
    .enum(["", "PENDING", "READY", "SHIPPED", "SIGNED", "FINISHED", "CANCELED"])
    .default(""),
  page: z.coerce.number().int().min(1).default(1),
});

function getParamValue(value: SearchParamsValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export function parseGiftListFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  return filtersSchema.parse({
    customerId: getParamValue(searchParams?.customerId),
    reviewStatus: getParamValue(searchParams?.reviewStatus),
    shippingStatus: getParamValue(searchParams?.shippingStatus),
    page: getParamValue(searchParams?.page) || "1",
  });
}

function buildGiftWhereInput(viewer: GiftViewer, filters: GiftListFilters) {
  const scope = getGiftScope(viewer.role, viewer.id, viewer.teamId);

  if (!scope) {
    throw new Error("You do not have access to gift records.");
  }

  const andClauses: Prisma.GiftRecordWhereInput[] = [scope];

  if (filters.customerId) {
    andClauses.push({ customerId: filters.customerId });
  }

  if (filters.reviewStatus) {
    andClauses.push({ reviewStatus: filters.reviewStatus });
  }

  if (filters.shippingStatus) {
    andClauses.push({ shippingStatus: filters.shippingStatus });
  }

  return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
}

async function getVisibleCustomers(viewer: GiftViewer) {
  const scope =
    viewer.role === "SALES"
      ? { ownerId: viewer.id }
      : viewer.role === "SUPERVISOR"
        ? viewer.teamId
          ? { owner: { is: { teamId: viewer.teamId } } }
          : { id: "__missing_gift_customer_team_scope__" }
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

async function getGiftCompatAssignees() {
  return prisma.user.findMany({
    where: {
      userStatus: UserStatus.ACTIVE,
      role: {
        code: "SHIPPER",
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

export async function getGiftsPageData(
  viewer: GiftViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessGiftModule(viewer.role)) {
    throw new Error("You do not have access to gift records.");
  }

  const filters = parseGiftListFilters(rawSearchParams);
  const where = buildGiftWhereInput(viewer, filters);
  const [totalCount, customers, liveSessions, assignees] = await Promise.all([
    prisma.giftRecord.count({ where }),
    getVisibleCustomers(viewer),
    prisma.liveSession.findMany({
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        id: true,
        title: true,
        startAt: true,
      },
    }),
    getGiftCompatAssignees(),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / GIFTS_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.giftRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * GIFTS_PAGE_SIZE,
    take: GIFTS_PAGE_SIZE,
    select: {
      id: true,
      giftName: true,
      qualificationSource: true,
      freightAmount: true,
      reviewStatus: true,
      shippingStatus: true,
      receiverInfo: true,
      receiverName: true,
      receiverPhone: true,
      receiverAddress: true,
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
      sales: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      liveSession: {
        select: {
          id: true,
          title: true,
          startAt: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          status: true,
          trackingNumber: true,
          remark: true,
          shippedAt: true,
          assignee: {
            select: {
              id: true,
              name: true,
              username: true,
            },
          },
        },
      },
    },
  });

  const serializedItems = items.map((item) => ({
    ...item,
    freightAmount: item.freightAmount.toString(),
  }));

  return {
    filters: {
      ...filters,
      page,
    },
    items: serializedItems,
    customers,
    liveSessions,
    assignees,
    pagination: {
      page,
      pageSize: GIFTS_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}
