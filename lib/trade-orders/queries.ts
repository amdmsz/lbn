import {
  Prisma,
  ProductBundleStatus,
  SalesOrderPaymentScheme,
  TradeOrderStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import { canAccessSalesOrderModule, canCreateSalesOrder } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { getSalesOrderCreateFormOptions } from "@/lib/sales-orders/queries";

export type TradeOrderViewer = {
  id: string;
  role: RoleCode;
};

export type TradeOrderFilters = {
  keyword: string;
  customerKeyword: string;
  supplierId: string;
  statusView: "" | "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  supplierCount: "" | "1" | "2" | "3_PLUS";
  sortBy: "UPDATED_DESC" | "UPDATED_ASC" | "CREATED_DESC";
  page: number;
};

const tradeOrderFiltersSchema = z.object({
  keyword: z.string().trim().default(""),
  customerKeyword: z.string().trim().default(""),
  supplierId: z.string().trim().default(""),
  statusView: z
    .enum(["", "DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED"])
    .default(""),
  supplierCount: z.enum(["", "1", "2", "3_PLUS"]).default(""),
  sortBy: z.enum(["UPDATED_DESC", "UPDATED_ASC", "CREATED_DESC"]).default("UPDATED_DESC"),
  page: z.coerce.number().int().min(1).default(1),
});

const TRADE_ORDER_PAGE_SIZE = 10;

async function getViewerTeamId(viewer: TradeOrderViewer) {
  if (viewer.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: viewer.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function buildActorCustomerWhere(
  viewer: TradeOrderViewer,
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
      : { id: "__missing_trade_order_scope__" };
  }

  return { ownerId: viewer.id };
}

function buildActorTradeOrderWhere(
  viewer: TradeOrderViewer,
  teamId: string | null,
): Prisma.TradeOrderWhereInput {
  if (viewer.role === "ADMIN") {
    return {};
  }

  if (viewer.role === "SUPERVISOR") {
    return teamId
      ? {
          customer: {
            is: {
              owner: {
                is: {
                  teamId,
                },
              },
            },
          },
        }
      : { id: "__missing_trade_order_scope__" };
  }

  return {
    OR: [{ ownerId: viewer.id }, { customer: { is: { ownerId: viewer.id } } }],
  };
}

async function getVisibleBundleOptions() {
  const bundles = await prisma.productBundle.findMany({
    where: {
      enabled: true,
      status: ProductBundleStatus.ACTIVE,
      items: {
        some: {
          enabled: true,
        },
      },
    },
    orderBy: [{ name: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      defaultBundlePrice: true,
      version: true,
      items: {
        where: {
          enabled: true,
        },
        orderBy: [{ sortOrder: "asc" }, { lineNo: "asc" }],
        select: {
          id: true,
          lineNo: true,
          supplierId: true,
          productId: true,
          skuId: true,
          qty: true,
          sortOrder: true,
          enabled: true,
        },
      },
    },
  });

  const skuIds = [...new Set(bundles.flatMap((bundle) => bundle.items.map((item) => item.skuId)))];
  const skuRecords = await prisma.productSku.findMany({
    where: {
      id: {
        in: skuIds,
      },
      enabled: true,
      product: {
        enabled: true,
        supplier: {
          enabled: true,
        },
      },
    },
    select: {
      id: true,
      skuCode: true,
      skuName: true,
      specText: true,
      unit: true,
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
  });

  const skuMap = new Map(skuRecords.map((sku) => [sku.id, sku]));

  return bundles
    .map((bundle) => {
      const items = bundle.items
        .map((item) => {
          const sku = skuMap.get(item.skuId);
          if (!sku) {
            return null;
          }

          if (
            sku.product.id !== item.productId ||
            sku.product.supplier.id !== item.supplierId
          ) {
            return null;
          }

          return {
            id: item.id,
            lineNo: item.lineNo,
            supplierId: item.supplierId,
            supplierName: sku.product.supplier.name,
            productId: item.productId,
            productName: sku.product.name,
            skuId: item.skuId,
            skuName: sku.skuName,
            specText: sku.specText,
            unit: sku.unit,
            qty: item.qty,
            sortOrder: item.sortOrder,
            enabled: item.enabled,
            defaultUnitPrice: sku.defaultUnitPrice.toString(),
            codSupported: sku.codSupported,
            insuranceSupported: sku.insuranceSupported,
            defaultInsuranceAmount: sku.defaultInsuranceAmount.toString(),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      return {
        id: bundle.id,
        code: bundle.code,
        name: bundle.name,
        description: bundle.description ?? "",
        defaultBundlePrice: bundle.defaultBundlePrice?.toString() ?? "0",
        version: bundle.version,
        items,
      };
    })
    .filter((bundle) => bundle.items.length > 0);
}

export async function getCustomerTradeOrderComposerData(
  viewer: TradeOrderViewer,
  customerId: string,
  tradeOrderId?: string,
) {
  if (!canCreateSalesOrder(viewer.role)) {
    throw new Error("当前角色无权为该客户创建订单。");
  }

  const teamId = await getViewerTeamId(viewer);
  const [customer, formOptions, bundleOptions] = await Promise.all([
    prisma.customer.findFirst({
      where: {
        id: customerId,
        ...buildActorCustomerWhere(viewer, teamId),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        ownerId: true,
        owner: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    }),
    getSalesOrderCreateFormOptions(),
    getVisibleBundleOptions(),
  ]);

  if (!customer) {
    return null;
  }

  const draft = tradeOrderId
    ? await prisma.tradeOrder.findFirst({
        where: {
          id: tradeOrderId,
          customerId: customer.id,
          ...buildActorTradeOrderWhere(viewer, teamId),
        },
        select: {
          id: true,
          tradeNo: true,
          reviewStatus: true,
          tradeStatus: true,
          paymentScheme: true,
          depositAmount: true,
          insuranceRequired: true,
          insuranceAmount: true,
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          remark: true,
          rejectReason: true,
          items: {
            where: {
              itemType: {
                in: ["SKU", "GIFT", "BUNDLE"],
              },
            },
            orderBy: { lineNo: "asc" },
            select: {
              id: true,
              itemType: true,
              skuId: true,
              bundleId: true,
              qty: true,
              dealUnitPriceSnapshot: true,
              remark: true,
            },
          },
        },
      })
    : null;

  return {
    customer,
    paymentSchemeOptions: formOptions.paymentSchemeOptions,
    skuOptions: formOptions.skuOptions,
    bundleOptions,
    draft: draft
      ? {
          ...draft,
          depositAmount: draft.depositAmount.toString(),
          insuranceAmount: draft.insuranceAmount.toString(),
          items: draft.items
            .filter((item) => item.itemType === "SKU")
            .map((item) => ({
              id: item.id,
              skuId: item.skuId,
              qty: item.qty,
              dealUnitPriceSnapshot: item.dealUnitPriceSnapshot.toString(),
              remark: item.remark,
            })),
          giftItems: draft.items
            .filter((item) => item.itemType === "GIFT")
            .map((item) => ({
              id: item.id,
              skuId: item.skuId,
              qty: item.qty,
              remark: item.remark,
            })),
          bundleItems: draft.items
            .filter((item) => item.itemType === "BUNDLE")
            .map((item) => ({
              id: item.id,
              bundleId: item.bundleId,
              qty: item.qty,
              dealUnitPriceSnapshot: item.dealUnitPriceSnapshot.toString(),
              remark: item.remark,
            })),
        }
      : null,
  };
}

export function parseTradeOrderFilters(
  rawSearchParams: Record<string, string | string[] | undefined> | undefined,
) {
  return tradeOrderFiltersSchema.parse({
    keyword: getParamValue(rawSearchParams?.keyword),
    customerKeyword: getParamValue(rawSearchParams?.customerKeyword),
    supplierId: getParamValue(rawSearchParams?.supplierId),
    statusView:
      getParamValue(rawSearchParams?.statusView) ||
      getParamValue(rawSearchParams?.reviewStatus),
    supplierCount: getParamValue(rawSearchParams?.supplierCount),
    sortBy: getParamValue(rawSearchParams?.sortBy) || "UPDATED_DESC",
    page: getParamValue(rawSearchParams?.page) || "1",
  });
}

function buildTradeOrderWhereInput(
  viewer: TradeOrderViewer,
  teamId: string | null,
  filters: TradeOrderFilters,
): Prisma.TradeOrderWhereInput {
  const andClauses: Prisma.TradeOrderWhereInput[] = [];
  const scope = buildActorTradeOrderWhere(viewer, teamId);

  if (Object.keys(scope).length > 0) {
    andClauses.push(scope);
  }

  if (filters.keyword) {
    andClauses.push({
      OR: [
        { tradeNo: { contains: filters.keyword } },
        { receiverNameSnapshot: { contains: filters.keyword } },
        { receiverPhoneSnapshot: { contains: filters.keyword } },
        { customer: { is: { name: { contains: filters.keyword } } } },
        { customer: { is: { phone: { contains: filters.keyword } } } },
        { customer: { is: { owner: { is: { name: { contains: filters.keyword } } } } } },
        { customer: { is: { owner: { is: { username: { contains: filters.keyword } } } } } },
        { components: { some: { supplierNameSnapshot: { contains: filters.keyword } } } },
        { salesOrders: { some: { subOrderNo: { contains: filters.keyword } } } },
        { salesOrders: { some: { orderNo: { contains: filters.keyword } } } },
        { salesOrders: { some: { supplier: { is: { name: { contains: filters.keyword } } } } } },
      ],
    });
  }

  if (filters.customerKeyword) {
    andClauses.push({
      OR: [
        { customer: { is: { name: { contains: filters.customerKeyword } } } },
        { customer: { is: { phone: { contains: filters.customerKeyword } } } },
        { receiverNameSnapshot: { contains: filters.customerKeyword } },
        { receiverPhoneSnapshot: { contains: filters.customerKeyword } },
      ],
    });
  }

  if (filters.supplierId) {
    andClauses.push({
      components: {
        some: {
          supplierId: filters.supplierId,
        },
      },
    });
  }

  if (filters.statusView) {
    andClauses.push({ tradeStatus: filters.statusView });
  }

  return andClauses.length > 0 ? { AND: andClauses } : {};
}

async function resolveSupplierCountTradeOrderIds(
  where: Prisma.TradeOrderWhereInput,
  supplierCount: TradeOrderFilters["supplierCount"],
) {
  if (!supplierCount) {
    return null;
  }

  const componentWhere: Prisma.TradeOrderItemComponentWhereInput =
    Object.keys(where).length > 0 ? { tradeOrder: { is: where } } : {};

  const groupedPairs = await prisma.tradeOrderItemComponent.groupBy({
    by: ["tradeOrderId", "supplierId"],
    where: componentWhere,
  });

  const distinctSupplierCounts = new Map<string, number>();

  for (const pair of groupedPairs) {
    distinctSupplierCounts.set(
      pair.tradeOrderId,
      (distinctSupplierCounts.get(pair.tradeOrderId) ?? 0) + 1,
    );
  }

  return Array.from(distinctSupplierCounts.entries())
    .filter(([, count]) => {
      if (supplierCount === "1") {
        return count === 1;
      }

      if (supplierCount === "2") {
        return count === 2;
      }

      return count >= 3;
    })
    .map(([tradeOrderId]) => tradeOrderId);
}

function buildTradeOrderOrderBy(
  sortBy: TradeOrderFilters["sortBy"],
): Prisma.TradeOrderOrderByWithRelationInput[] {
  if (sortBy === "UPDATED_ASC") {
    return [{ updatedAt: "asc" }, { id: "asc" }];
  }

  if (sortBy === "CREATED_DESC") {
    return [{ createdAt: "desc" }, { id: "desc" }];
  }

  return [{ updatedAt: "desc" }, { id: "desc" }];
}

export async function getTradeOrdersPageData(
  viewer: TradeOrderViewer,
  rawSearchParams?: Record<string, string | string[] | undefined>,
) {
  if (!canAccessSalesOrderModule(viewer.role)) {
    throw new Error("褰撳墠瑙掕壊鏃犳潈璁块棶鎴愪氦涓诲崟妯″潡銆?");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseTradeOrderFilters(rawSearchParams);
  const baseWhere = buildTradeOrderWhereInput(viewer, teamId, filters);
  const supplierCountTradeOrderIds = await resolveSupplierCountTradeOrderIds(
    baseWhere,
    filters.supplierCount,
  );
  const where =
    supplierCountTradeOrderIds === null
      ? baseWhere
      : supplierCountTradeOrderIds.length > 0
        ? {
            AND: [baseWhere, { id: { in: supplierCountTradeOrderIds } }],
          }
        : { id: "__missing_trade_order_supplier_count__" };
  const orderBy = buildTradeOrderOrderBy(filters.sortBy);

  const [
    totalCount,
    draftCount,
    pendingReviewCount,
    approvedCount,
    rejectedCount,
    codTradeCount,
    amountSummary,
    suppliers,
  ] = await Promise.all([
    prisma.tradeOrder.count({ where }),
    prisma.tradeOrder.count({
      where: {
        AND: [where, { tradeStatus: TradeOrderStatus.DRAFT }],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [where, { tradeStatus: TradeOrderStatus.PENDING_REVIEW }],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [where, { tradeStatus: TradeOrderStatus.APPROVED }],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [where, { tradeStatus: TradeOrderStatus.REJECTED }],
      },
    }),
    prisma.tradeOrder.count({
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
    prisma.tradeOrder.aggregate({
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
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / TRADE_ORDER_PAGE_SIZE));
  const page = Math.min(filters.page, totalPages);

  const items = await prisma.tradeOrder.findMany({
    where,
    orderBy,
    skip: (page - 1) * TRADE_ORDER_PAGE_SIZE,
    take: TRADE_ORDER_PAGE_SIZE,
    select: {
      id: true,
      tradeNo: true,
      reviewStatus: true,
      tradeStatus: true,
      paymentScheme: true,
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
      items: {
        orderBy: { lineNo: "asc" },
        take: 4,
        select: {
          id: true,
          itemType: true,
          titleSnapshot: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          qty: true,
          subtotal: true,
        },
      },
      components: {
        distinct: ["supplierId"],
        orderBy: { supplierId: "asc" },
        select: {
          supplierId: true,
          supplierNameSnapshot: true,
        },
      },
      salesOrders: {
        orderBy: [{ supplierSequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          orderNo: true,
          subOrderNo: true,
          reviewStatus: true,
          paymentScheme: true,
          finalAmount: true,
          remainingAmount: true,
          codAmount: true,
          supplier: {
            select: {
              id: true,
              name: true,
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
      },
    },
  });

  return {
    notice: parseActionNotice(rawSearchParams),
    summary: {
      totalCount,
      draftCount,
      pendingReviewCount,
      approvedCount,
      rejectedCount,
      codTradeCount,
      totalFinalAmount: amountSummary._sum.finalAmount?.toString() ?? "0",
      totalRemainingAmount: amountSummary._sum.remainingAmount?.toString() ?? "0",
    },
    filters: {
      ...filters,
      page,
    },
    suppliers,
    items: items.map((item) => ({
      ...item,
      finalAmount: item.finalAmount.toString(),
      depositAmount: item.depositAmount.toString(),
      collectedAmount: item.collectedAmount.toString(),
      remainingAmount: item.remainingAmount.toString(),
      codAmount: item.codAmount.toString(),
      insuranceAmount: item.insuranceAmount.toString(),
      items: item.items.map((tradeItem) => ({
        ...tradeItem,
        subtotal: tradeItem.subtotal.toString(),
      })),
      components: item.components,
      salesOrders: item.salesOrders.map((salesOrder) => ({
        ...salesOrder,
        finalAmount: salesOrder.finalAmount.toString(),
        remainingAmount: salesOrder.remainingAmount.toString(),
        codAmount: salesOrder.codAmount.toString(),
      })),
    })),
    pagination: {
      page,
      pageSize: TRADE_ORDER_PAGE_SIZE,
      totalCount,
      totalPages,
    },
  };
}

export async function getTradeOrderDetail(
  viewer: TradeOrderViewer,
  tradeOrderId: string,
) {
  if (!canAccessSalesOrderModule(viewer.role)) {
    throw new Error("褰撳墠瑙掕壊鏃犳潈璁块棶鎴愪氦涓诲崟妯″潡銆?");
  }

  const teamId = await getViewerTeamId(viewer);
  const scope = buildActorTradeOrderWhere(viewer, teamId);
  const scopedWhere: Prisma.TradeOrderWhereInput =
    Object.keys(scope).length > 0
      ? {
          AND: [{ id: tradeOrderId }, scope],
        }
      : { id: tradeOrderId };

  const tradeOrder = await prisma.tradeOrder.findFirst({
    where: scopedWhere,
    select: {
      id: true,
      tradeNo: true,
      ownerId: true,
      reviewStatus: true,
      tradeStatus: true,
      paymentScheme: true,
      listAmount: true,
      dealAmount: true,
      goodsAmount: true,
      discountAmount: true,
      finalAmount: true,
      depositAmount: true,
      collectedAmount: true,
      paidAmount: true,
      remainingAmount: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
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
      items: {
        orderBy: { lineNo: "asc" },
        select: {
          id: true,
          lineNo: true,
          itemType: true,
          bundleId: true,
          titleSnapshot: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          unitSnapshot: true,
          bundleCodeSnapshot: true,
          bundleNameSnapshot: true,
          bundleVersionSnapshot: true,
          qty: true,
          listUnitPriceSnapshot: true,
          dealUnitPriceSnapshot: true,
          subtotal: true,
          discountAmount: true,
          remark: true,
          components: {
            orderBy: { componentSeq: "asc" },
            select: {
              id: true,
              componentSeq: true,
              componentType: true,
              componentSourceType: true,
              supplierId: true,
              supplierNameSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              specSnapshot: true,
              unitSnapshot: true,
              qty: true,
              allocatedSubtotal: true,
              salesOrderItems: {
                orderBy: { createdAt: "asc" },
                select: {
                  id: true,
                  salesOrder: {
                    select: {
                      id: true,
                      orderNo: true,
                      subOrderNo: true,
                      supplier: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        orderBy: [{ supplierId: "asc" }, { componentSeq: "asc" }],
        select: {
          id: true,
          supplierId: true,
          supplierNameSnapshot: true,
          qty: true,
          allocatedSubtotal: true,
        },
      },
      salesOrders: {
        orderBy: [{ supplierSequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          orderNo: true,
          subOrderNo: true,
          supplierSequence: true,
          subOrderStatus: true,
          reviewStatus: true,
          paymentScheme: true,
          finalAmount: true,
          depositAmount: true,
          collectedAmount: true,
          remainingAmount: true,
          codAmount: true,
          insuranceRequired: true,
          insuranceAmount: true,
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          remark: true,
          createdAt: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          items: {
            orderBy: [{ lineNo: "asc" }, { createdAt: "asc" }],
            take: 6,
            select: {
              id: true,
              titleSnapshot: true,
              productNameSnapshot: true,
              skuNameSnapshot: true,
              specSnapshot: true,
              qty: true,
              subtotal: true,
            },
          },
          shippingTask: {
            select: {
              id: true,
              reportStatus: true,
              shippingStatus: true,
              trackingNumber: true,
              reportedAt: true,
              shippedAt: true,
            },
          },
        },
      },
    },
  });

  if (!tradeOrder) {
    return null;
  }

  const operationLogs = await prisma.operationLog.findMany({
    where: {
      OR: [
        {
          targetType: "TRADE_ORDER",
          targetId: tradeOrder.id,
        },
        ...tradeOrder.salesOrders.map((salesOrder) => ({
          targetType: "SALES_ORDER" as const,
          targetId: salesOrder.id,
        })),
        ...tradeOrder.salesOrders.flatMap((salesOrder) =>
          salesOrder.shippingTask
            ? [
                {
                  targetType: "SHIPPING_TASK" as const,
                  targetId: salesOrder.shippingTask.id,
                },
              ]
            : [],
        ),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 30,
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
  });

  return {
    order: {
      ...tradeOrder,
      listAmount: tradeOrder.listAmount.toString(),
      dealAmount: tradeOrder.dealAmount.toString(),
      goodsAmount: tradeOrder.goodsAmount.toString(),
      discountAmount: tradeOrder.discountAmount.toString(),
      finalAmount: tradeOrder.finalAmount.toString(),
      depositAmount: tradeOrder.depositAmount.toString(),
      collectedAmount: tradeOrder.collectedAmount.toString(),
      paidAmount: tradeOrder.paidAmount.toString(),
      remainingAmount: tradeOrder.remainingAmount.toString(),
      codAmount: tradeOrder.codAmount.toString(),
      insuranceAmount: tradeOrder.insuranceAmount.toString(),
      items: tradeOrder.items.map((item) => ({
        ...item,
        listUnitPriceSnapshot: item.listUnitPriceSnapshot.toString(),
        dealUnitPriceSnapshot: item.dealUnitPriceSnapshot.toString(),
        subtotal: item.subtotal.toString(),
        discountAmount: item.discountAmount.toString(),
        components: item.components.map((component) => ({
          ...component,
          allocatedSubtotal: component.allocatedSubtotal.toString(),
        })),
      })),
      components: tradeOrder.components.map((component) => ({
        ...component,
        allocatedSubtotal: component.allocatedSubtotal.toString(),
      })),
      salesOrders: tradeOrder.salesOrders.map((salesOrder) => ({
        ...salesOrder,
        finalAmount: salesOrder.finalAmount.toString(),
        depositAmount: salesOrder.depositAmount.toString(),
        collectedAmount: salesOrder.collectedAmount.toString(),
        remainingAmount: salesOrder.remainingAmount.toString(),
        codAmount: salesOrder.codAmount.toString(),
        insuranceAmount: salesOrder.insuranceAmount.toString(),
        items: salesOrder.items.map((item) => ({
          ...item,
          subtotal: item.subtotal.toString(),
        })),
      })),
    },
    operationLogs,
  };
}
