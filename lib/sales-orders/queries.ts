import {
  SalesOrderPaymentScheme,
  SalesOrderReviewStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import { canAccessSalesOrderModule } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { salesOrderPaymentSchemeOptions } from "@/lib/fulfillment/metadata";
import { getPaymentOwnerOptions } from "@/lib/payments/queries";
import { findProductDomainCurrentlyHiddenTargetIds } from "@/lib/products/recycle";

type SearchParamsValue = string | string[] | undefined;

export type SalesOrderViewer = {
  id: string;
  role: RoleCode;
};

export type SalesOrderFilters = {
  keyword: string;
  supplierId: string;
  reviewStatus: "" | SalesOrderReviewStatus;
  paymentScheme: "" | SalesOrderPaymentScheme;
  page: number;
  createCustomerId: string;
};

const filtersSchema = z.object({
  keyword: z.string().trim().default(""),
  supplierId: z.string().trim().default(""),
  reviewStatus: z.enum(["", "PENDING_REVIEW", "APPROVED", "REJECTED"]).default(""),
  paymentScheme: z
    .enum(["", "FULL_PREPAID", "DEPOSIT_PLUS_BALANCE", "FULL_COD", "DEPOSIT_PLUS_COD"])
    .default(""),
  page: z.coerce.number().int().min(1).default(1),
  createCustomerId: z.string().trim().default(""),
});

const PAGE_SIZE = 10;

export type VisibleSkuOption = {
  id: string;
  skuName: string;
  defaultUnitPrice: Prisma.Decimal;
  codSupported: boolean;
  insuranceSupported: boolean;
  defaultInsuranceAmount: Prisma.Decimal;
  product: {
    id: string;
    name: string;
    supplier: {
      id: string;
      name: string;
    };
  };
};

export type SerializedVisibleSkuOption = Omit<
  VisibleSkuOption,
  "defaultUnitPrice" | "defaultInsuranceAmount"
> & {
  defaultUnitPrice: string;
  defaultInsuranceAmount: string;
};

async function getViewerTeamId(viewer: SalesOrderViewer) {
  if (viewer.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function buildVisibleCustomerWhere(
  viewer: SalesOrderViewer,
  teamId: string | null,
): Prisma.CustomerWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    return teamId
      ? {
          owner: {
            is: {
              teamId,
            },
          },
        }
      : { id: "__missing_sales_order_scope__" };
  }

  return {
    ownerId: viewer.id,
  };
}

function buildSalesOrderWhereInput(
  viewer: SalesOrderViewer,
  teamId: string | null,
  filters: SalesOrderFilters,
): Prisma.SalesOrderWhereInput {
  const andClauses: Prisma.SalesOrderWhereInput[] = [];

  if (viewer.role === "SUPERVISOR") {
    andClauses.push(
      teamId
        ? {
            OR: [
              { owner: { is: { teamId } } },
              { customer: { owner: { is: { teamId } } } },
            ],
          }
        : { id: "__missing_sales_order_scope__" },
    );
  }

  if (viewer.role === "SALES") {
    andClauses.push({
      OR: [{ ownerId: viewer.id }, { customer: { ownerId: viewer.id } }],
    });
  }

  if (filters.keyword) {
    andClauses.push({
      OR: [
        { orderNo: { contains: filters.keyword } },
        { subOrderNo: { contains: filters.keyword } },
        { tradeOrder: { is: { tradeNo: { contains: filters.keyword } } } },
        { receiverNameSnapshot: { contains: filters.keyword } },
        { receiverPhoneSnapshot: { contains: filters.keyword } },
        { customer: { name: { contains: filters.keyword } } },
        { customer: { phone: { contains: filters.keyword } } },
        { customer: { owner: { is: { name: { contains: filters.keyword } } } } },
        { customer: { owner: { is: { username: { contains: filters.keyword } } } } },
      ],
    });
  }

  if (filters.supplierId) {
    andClauses.push({ supplierId: filters.supplierId });
  }

  if (filters.reviewStatus) {
    andClauses.push({ reviewStatus: filters.reviewStatus });
  }

  if (filters.paymentScheme) {
    andClauses.push({ paymentScheme: filters.paymentScheme });
  }

  return andClauses.length > 0 ? { AND: andClauses } : {};
}

async function getCreateCustomer(
  viewer: SalesOrderViewer,
  teamId: string | null,
  createCustomerId: string,
) {
  if (!createCustomerId) {
    return null;
  }

  return prisma.customer.findFirst({
    where: {
      id: createCustomerId,
      ...buildVisibleCustomerWhere(viewer, teamId),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
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

function serializeVisibleSkuOptions(items: VisibleSkuOption[]): SerializedVisibleSkuOption[] {
  return items.map((sku) => ({
    ...sku,
    defaultUnitPrice: sku.defaultUnitPrice.toString(),
    defaultInsuranceAmount: sku.defaultInsuranceAmount.toString(),
  }));
}

async function getVisibleSkuOptions(limit = 200) {
  const [hiddenProductSkuIds, hiddenProductIds, hiddenSupplierIds] = await Promise.all([
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT_SKU"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "SUPPLIER"),
  ]);

  return prisma.productSku.findMany({
    where: {
      enabled: true,
      ...(hiddenProductSkuIds.length > 0
        ? {
            id: {
              notIn: hiddenProductSkuIds,
            },
          }
        : {}),
      product: {
        enabled: true,
        ...(hiddenProductIds.length > 0
          ? {
              id: {
                notIn: hiddenProductIds,
              },
            }
          : {}),
        supplier: {
          enabled: true,
          ...(hiddenSupplierIds.length > 0
            ? {
                id: {
                  notIn: hiddenSupplierIds,
                },
              }
            : {}),
        },
      },
    },
    orderBy: [
      { product: { supplier: { name: "asc" } } },
      { product: { name: "asc" } },
      { skuName: "asc" },
    ],
    take: limit,
    select: {
      id: true,
      skuName: true,
      defaultUnitPrice: true,
      codSupported: true,
      insuranceSupported: true,
      defaultInsuranceAmount: true,
      product: {
        select: {
          id: true,
          name: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  }) as Promise<VisibleSkuOption[]>;
}

export async function getSalesOrderCreateFormOptions() {
  const skuOptions = await getVisibleSkuOptions();

  return {
    skuOptions: serializeVisibleSkuOptions(skuOptions),
    paymentSchemeOptions: salesOrderPaymentSchemeOptions,
  };
}

export async function searchVisibleSkuOptions(
  viewer: SalesOrderViewer,
  keyword: string,
  limit = 12,
) {
  if (!canAccessSalesOrderModule(viewer.role)) {
    throw new Error("当前角色无权搜索商品规格。");
  }

  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    return [] as SerializedVisibleSkuOption[];
  }

  const [hiddenProductSkuIds, hiddenProductIds, hiddenSupplierIds] = await Promise.all([
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT_SKU"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "SUPPLIER"),
  ]);

  const items = (await prisma.productSku.findMany({
    where: {
      enabled: true,
      ...(hiddenProductSkuIds.length > 0
        ? {
            id: {
              notIn: hiddenProductSkuIds,
            },
          }
        : {}),
      product: {
        enabled: true,
        ...(hiddenProductIds.length > 0
          ? {
              id: {
                notIn: hiddenProductIds,
              },
            }
          : {}),
        supplier: {
          enabled: true,
          ...(hiddenSupplierIds.length > 0
            ? {
                id: {
                  notIn: hiddenSupplierIds,
                },
              }
            : {}),
        },
      },
      OR: [
        { skuName: { contains: normalizedKeyword } },
        { product: { name: { contains: normalizedKeyword } } },
        { product: { code: { contains: normalizedKeyword } } },
        { product: { supplier: { name: { contains: normalizedKeyword } } } },
      ],
    },
    orderBy: [
      { product: { supplier: { name: "asc" } } },
      { product: { name: "asc" } },
      { skuName: "asc" },
    ],
    take: Math.min(Math.max(limit, 1), 20),
    select: {
      id: true,
      skuName: true,
      defaultUnitPrice: true,
      codSupported: true,
      insuranceSupported: true,
      defaultInsuranceAmount: true,
      product: {
        select: {
          id: true,
          name: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  })) as VisibleSkuOption[];

  return serializeVisibleSkuOptions(items);
}

export async function searchSalesOrderCustomers(
  viewer: SalesOrderViewer,
  keyword: string,
  limit = 8,
) {
  if (!canAccessSalesOrderModule(viewer.role)) {
    throw new Error("当前角色无权搜索下单客户。");
  }

  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) {
    return [];
  }

  const teamId = await getViewerTeamId(viewer);
  const visibleWhere = buildVisibleCustomerWhere(viewer, teamId);

  const items = await prisma.customer.findMany({
    where: {
      AND: [
        visibleWhere,
        {
          OR: [
            { name: { contains: normalizedKeyword } },
            { phone: { contains: normalizedKeyword } },
            { owner: { is: { name: { contains: normalizedKeyword } } } },
            { owner: { is: { username: { contains: normalizedKeyword } } } },
          ],
        },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 20),
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
    },
  });

  return items;
}

export function parseSalesOrderFilters(
  rawSearchParams: Record<string, SearchParamsValue> | undefined,
) {
  return filtersSchema.parse({
    keyword: getParamValue(rawSearchParams?.keyword),
    supplierId: getParamValue(rawSearchParams?.supplierId),
    reviewStatus: getParamValue(rawSearchParams?.reviewStatus),
    paymentScheme: getParamValue(rawSearchParams?.paymentScheme),
    page: getParamValue(rawSearchParams?.page) || "1",
    createCustomerId: getParamValue(rawSearchParams?.createCustomerId),
  });
}

export async function getSalesOrdersPageData(
  viewer: SalesOrderViewer,
  rawSearchParams?: Record<string, SearchParamsValue>,
) {
  if (!canAccessSalesOrderModule(viewer.role)) {
    throw new Error("当前角色无权访问销售订单模块。");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseSalesOrderFilters(rawSearchParams);
  const where = buildSalesOrderWhereInput(viewer, teamId, filters);

  const [
    totalCount,
    pendingReviewCount,
    approvedCount,
    rejectedCount,
    codOrderCount,
    amountSummary,
    suppliers,
    skuOptions,
    createCustomer,
  ] = await Promise.all([
    prisma.salesOrder.count({ where }),
    prisma.salesOrder.count({
      where: {
        AND: [where, { reviewStatus: SalesOrderReviewStatus.PENDING_REVIEW }],
      },
    }),
    prisma.salesOrder.count({
      where: {
        AND: [where, { reviewStatus: SalesOrderReviewStatus.APPROVED }],
      },
    }),
    prisma.salesOrder.count({
      where: {
        AND: [where, { reviewStatus: SalesOrderReviewStatus.REJECTED }],
      },
    }),
    prisma.salesOrder.count({
      where: {
        AND: [
          where,
          {
            paymentScheme: {
              in: [
                SalesOrderPaymentScheme.FULL_COD,
                SalesOrderPaymentScheme.DEPOSIT_PLUS_COD,
              ],
            },
          },
        ],
      },
    }),
    prisma.salesOrder.aggregate({
      where,
      _sum: {
        finalAmount: true,
        remainingAmount: true,
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
    getVisibleSkuOptions(),
    getCreateCustomer(viewer, teamId, filters.createCustomerId),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.salesOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      orderNo: true,
      tradeOrderId: true,
      subOrderNo: true,
      reviewStatus: true,
      paymentScheme: true,
      listAmount: true,
      dealAmount: true,
      discountAmount: true,
      finalAmount: true,
      depositAmount: true,
      collectedAmount: true,
      remainingAmount: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
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
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
        },
      },
      items: {
        take: 3,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          itemTypeSnapshot: true,
          titleSnapshot: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          qty: true,
          listPriceSnapshot: true,
          dealPriceSnapshot: true,
        },
      },
      giftItems: {
        take: 3,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          giftName: true,
          qty: true,
        },
      },
      shippingTask: {
        select: {
          id: true,
          reportStatus: true,
          shippingStatus: true,
          trackingNumber: true,
        },
      },
    },
  });

  return {
    notice: parseActionNotice(rawSearchParams),
    summary: {
      totalCount,
      pendingReviewCount,
      approvedCount,
      rejectedCount,
      codOrderCount,
      totalFinalAmount: amountSummary._sum.finalAmount?.toString() ?? "0",
      totalRemainingAmount: amountSummary._sum.remainingAmount?.toString() ?? "0",
    },
    filters: {
      ...filters,
      page,
    },
    items: items.map((item) => ({
      ...item,
      listAmount: item.listAmount.toString(),
      dealAmount: item.dealAmount.toString(),
      discountAmount: item.discountAmount.toString(),
      finalAmount: item.finalAmount.toString(),
      depositAmount: item.depositAmount.toString(),
      collectedAmount: item.collectedAmount.toString(),
      remainingAmount: item.remainingAmount.toString(),
      codAmount: item.codAmount.toString(),
      insuranceAmount: item.insuranceAmount.toString(),
      items: item.items.map((orderItem) => ({
        ...orderItem,
        listPriceSnapshot: orderItem.listPriceSnapshot.toString(),
        dealPriceSnapshot: orderItem.dealPriceSnapshot.toString(),
      })),
    })),
    createCustomer,
    suppliers,
    skuOptions: serializeVisibleSkuOptions(skuOptions),
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export async function getSalesOrderDetail(
  viewer: SalesOrderViewer,
  salesOrderId: string,
) {
  if (!canAccessSalesOrderModule(viewer.role)) {
    throw new Error("当前角色无权访问销售订单模块。");
  }

  const teamId = await getViewerTeamId(viewer);
  const scope = buildSalesOrderWhereInput(viewer, teamId, {
    keyword: "",
    supplierId: "",
    reviewStatus: "",
    paymentScheme: "",
    page: 1,
    createCustomerId: "",
  });

  const scopedWhere: Prisma.SalesOrderWhereInput =
    "AND" in scope && Array.isArray(scope.AND)
      ? { AND: [{ id: salesOrderId }, ...scope.AND] }
      : { ...scope, id: salesOrderId };

  const order = await prisma.salesOrder.findFirst({
    where: scopedWhere,
    select: {
      id: true,
      orderNo: true,
      tradeOrderId: true,
      subOrderNo: true,
      reviewStatus: true,
      paymentScheme: true,
      listAmount: true,
      dealAmount: true,
      discountAmount: true,
      finalAmount: true,
      depositAmount: true,
      collectedAmount: true,
      paidAmount: true,
      remainingAmount: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
      discountReason: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
      receiverAddressSnapshot: true,
      reviewedAt: true,
      rejectReason: true,
      remark: true,
      createdAt: true,
      updatedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
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
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
        },
      },
      reviewer: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          itemTypeSnapshot: true,
          titleSnapshot: true,
          exportDisplayNameSnapshot: true,
          productId: true,
          skuId: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          unitSnapshot: true,
          listPriceSnapshot: true,
          dealPriceSnapshot: true,
          qty: true,
          subtotal: true,
        },
      },
      giftItems: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          giftName: true,
          qty: true,
          remark: true,
        },
      },
      paymentPlans: {
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          sourceType: true,
          subjectType: true,
          stageType: true,
          collectionChannel: true,
          plannedAmount: true,
          submittedAmount: true,
          confirmedAmount: true,
          remainingAmount: true,
          dueAt: true,
          status: true,
          remark: true,
          codCollectionRecord: {
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
                  remark: true,
                },
              },
            },
          },
          paymentRecords: {
            orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              amount: true,
              channel: true,
              status: true,
              occurredAt: true,
              referenceNo: true,
              remark: true,
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
          },
          collectionTasks: {
            orderBy: [{ createdAt: "desc" }],
            select: {
              id: true,
              taskType: true,
              status: true,
              ownerId: true,
              dueAt: true,
              nextFollowUpAt: true,
              lastContactAt: true,
              closedAt: true,
              remark: true,
              owner: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                },
              },
            },
          },
        },
      },
      shippingTask: {
        select: {
          id: true,
          reportStatus: true,
          shippingStatus: true,
          shippingProvider: true,
          trackingNumber: true,
          reportedAt: true,
          shippedAt: true,
          exportBatch: {
            select: {
              id: true,
              exportNo: true,
            },
          },
          codCollectionRecords: {
            orderBy: { createdAt: "desc" },
            take: 3,
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
      },
      logisticsFollowUpTasks: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          status: true,
          intervalDays: true,
          nextTriggerAt: true,
          lastTriggeredAt: true,
          lastFollowedUpAt: true,
          closedAt: true,
          createdAt: true,
          remark: true,
          owner: {
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

  if (!order) {
    return null;
  }

  const [skuOptions, paymentOwnerOptions, operationLogs] = await Promise.all([
    getVisibleSkuOptions(),
    getPaymentOwnerOptions({
      id: viewer.id,
      role: viewer.role,
    }),
    prisma.operationLog.findMany({
      where: {
        OR: [
          {
            targetType: "SALES_ORDER",
            targetId: order.id,
          },
          order.tradeOrderId
            ? {
                targetType: "TRADE_ORDER",
                targetId: order.tradeOrderId,
              }
            : undefined,
          order.shippingTask
            ? {
                targetType: "SHIPPING_TASK",
                targetId: order.shippingTask.id,
              }
            : undefined,
          ...order.paymentPlans.map((plan) => ({
            targetType: "PAYMENT_PLAN" as const,
            targetId: plan.id,
          })),
          ...order.paymentPlans.flatMap((plan) =>
            plan.codCollectionRecord
              ? [
                  {
                    targetType: "COD_COLLECTION_RECORD" as const,
                    targetId: plan.codCollectionRecord.id,
                  },
                ]
              : [],
          ),
          ...order.paymentPlans.flatMap((plan) =>
            plan.paymentRecords.map((record) => ({
              targetType: "PAYMENT_RECORD" as const,
              targetId: record.id,
            })),
          ),
          ...order.paymentPlans.flatMap((plan) =>
            plan.collectionTasks.map((task) => ({
              targetType: "COLLECTION_TASK" as const,
              targetId: task.id,
            })),
          ),
          ...order.logisticsFollowUpTasks.map((task) => ({
            targetType: "LOGISTICS_FOLLOW_UP_TASK" as const,
            targetId: task.id,
          })),
        ].filter(Boolean) as Prisma.OperationLogWhereInput[],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        module: true,
        action: true,
        description: true,
        createdAt: true,
        actor: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
  ]);

  return {
    order: {
      ...order,
      listAmount: order.listAmount.toString(),
      dealAmount: order.dealAmount.toString(),
      discountAmount: order.discountAmount.toString(),
      finalAmount: order.finalAmount.toString(),
      depositAmount: order.depositAmount.toString(),
      collectedAmount: order.collectedAmount.toString(),
      paidAmount: order.paidAmount.toString(),
      remainingAmount: order.remainingAmount.toString(),
      codAmount: order.codAmount.toString(),
      insuranceAmount: order.insuranceAmount.toString(),
      items: order.items.map((item) => ({
        ...item,
        listPriceSnapshot: item.listPriceSnapshot.toString(),
        dealPriceSnapshot: item.dealPriceSnapshot.toString(),
        subtotal: item.subtotal.toString(),
      })),
      paymentPlans: order.paymentPlans.map((plan) => ({
        ...plan,
        plannedAmount: plan.plannedAmount.toString(),
        submittedAmount: plan.submittedAmount.toString(),
        confirmedAmount: plan.confirmedAmount.toString(),
        remainingAmount: plan.remainingAmount.toString(),
        codCollectionRecord: plan.codCollectionRecord
          ? {
              ...plan.codCollectionRecord,
              expectedAmount: plan.codCollectionRecord.expectedAmount.toString(),
              collectedAmount: plan.codCollectionRecord.collectedAmount.toString(),
              paymentRecord: plan.codCollectionRecord.paymentRecord
                ? {
                    ...plan.codCollectionRecord.paymentRecord,
                    amount: plan.codCollectionRecord.paymentRecord.amount.toString(),
                  }
                : null,
            }
          : null,
        paymentRecords: plan.paymentRecords.map((record) => ({
          ...record,
          amount: record.amount.toString(),
        })),
      })),
      shippingTask: order.shippingTask
        ? {
            ...order.shippingTask,
            codCollectionRecords: order.shippingTask.codCollectionRecords.map((record) => ({
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
          }
        : null,
    },
    skuOptions: serializeVisibleSkuOptions(skuOptions),
    paymentOwnerOptions,
    operationLogs,
  };
}
