import { OrderType, PaymentStatus, ShippingStatus, type Prisma, type RoleCode } from "@prisma/client";
import { z } from "zod";
import {
  canAccessOrderModule,
  getOrderScope,
} from "@/lib/auth/access";
import { ORDERS_PAGE_SIZE } from "@/lib/fulfillment/metadata";
import { prisma } from "@/lib/db/prisma";

type SearchParamsValue = string | string[] | undefined;

export type OrderViewer = {
  id: string;
  role: RoleCode;
  teamId?: string | null;
};

export type OrderListFilters = {
  customerId: string;
  type: "" | OrderType;
  paymentStatus: "" | PaymentStatus;
  shippingStatus: "" | ShippingStatus;
  page: number;
};

const filtersSchema = z.object({
  customerId: z.string().trim().default(""),
  type: z.enum(["", "NORMAL_ORDER", "GIFT_FREIGHT_ORDER"]).default(""),
  paymentStatus: z.enum(["", "PENDING", "PAID", "FAILED", "REFUNDED"]).default(""),
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

export function parseOrderListFilters(
  searchParams: Record<string, SearchParamsValue> | undefined,
) {
  return filtersSchema.parse({
    customerId: getParamValue(searchParams?.customerId),
    type: getParamValue(searchParams?.type),
    paymentStatus: getParamValue(searchParams?.paymentStatus),
    shippingStatus: getParamValue(searchParams?.shippingStatus),
    page: getParamValue(searchParams?.page) || "1",
  });
}

function buildOrderWhereInput(viewer: OrderViewer, filters: OrderListFilters) {
  const scope = getOrderScope(viewer.role, viewer.id, viewer.teamId);

  if (!scope) {
    throw new Error("You do not have access to orders.");
  }

  const andClauses: Prisma.OrderWhereInput[] = [scope];

  if (filters.customerId) {
    andClauses.push({ customerId: filters.customerId });
  }

  if (filters.type) {
    andClauses.push({ type: filters.type });
  }

  if (filters.paymentStatus) {
    andClauses.push({ paymentStatus: filters.paymentStatus });
  }

  if (filters.shippingStatus) {
    andClauses.push({ shippingStatus: filters.shippingStatus });
  }

  return andClauses.length === 1 ? andClauses[0] : { AND: andClauses };
}

async function getVisibleCustomers(viewer: OrderViewer) {
  const scope =
    viewer.role === "SALES"
      ? { ownerId: viewer.id }
      : viewer.role === "SUPERVISOR"
        ? viewer.teamId
          ? { owner: { is: { teamId: viewer.teamId } } }
          : { id: "__missing_order_customer_team_scope__" }
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

export async function getOrdersPageData(
  viewer: OrderViewer,
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  if (!canAccessOrderModule(viewer.role)) {
    throw new Error("You do not have access to orders.");
  }

  const filters = parseOrderListFilters(rawSearchParams);
  const where = buildOrderWhereInput(viewer, filters);
  const [totalCount, customers] = await Promise.all([
    prisma.order.count({ where }),
    getVisibleCustomers(viewer),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalCount / ORDERS_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * ORDERS_PAGE_SIZE,
    take: ORDERS_PAGE_SIZE,
    select: {
      id: true,
      type: true,
      amount: true,
      paymentStatus: true,
      shippingStatus: true,
      sourceScene: true,
      receiverName: true,
      receiverPhone: true,
      receiverAddress: true,
      trackingNumber: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
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
          status: true,
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
    amount: item.amount.toString(),
  }));

  return {
    filters: {
      ...filters,
      page,
    },
    items: serializedItems,
    customers,
    pagination: {
      page,
      pageSize: ORDERS_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}
