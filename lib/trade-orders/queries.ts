import {
  Prisma,
  ProductBundleStatus,
  SalesOrderPaymentScheme,
  ShippingFulfillmentStatus,
  ShippingReportStatus,
  TradeOrderStatus,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
import { canAccessSalesOrderModule, canCreateSalesOrder } from "@/lib/auth/access";
import { findActiveCustomerRecycleEntry } from "@/lib/customers/recycle";
import { prisma } from "@/lib/db/prisma";
import { findProductDomainCurrentlyHiddenTargetIds } from "@/lib/products/recycle";
import {
  buildTradeOrderFinalizePreview,
  getTradeOrderRecycleTarget,
} from "@/lib/recycle-bin/trade-order-adapter";
import {
  findActiveTradeOrderRecycleEntry,
  listActiveTradeOrderIds,
} from "@/lib/trade-orders/recycle";
import type { TradeOrderRecycleGuard } from "@/lib/trade-orders/recycle-guards";
import type { RecycleFinalizePreview } from "@/lib/recycle-bin/types";
import { getSalesOrderCreateFormOptions } from "@/lib/sales-orders/queries";
import { getTradeOrderExecutionSummaryMap } from "@/lib/trade-orders/execution-summary";

export type TradeOrderViewer = {
  id: string;
  role: RoleCode;
};

export type TradeOrderFilters = {
  keyword: string;
  customerKeyword: string;
  supplierId: string;
  statusView: "" | "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  focusView:
    | ""
    | "PENDING_REVIEW"
    | "APPROVED"
    | "PENDING_REPORT"
    | "PENDING_TRACKING"
    | "SHIPPED"
    | "EXCEPTION";
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
  focusView: z
    .enum([
      "",
      "PENDING_REVIEW",
      "APPROVED",
      "PENDING_REPORT",
      "PENDING_TRACKING",
      "SHIPPED",
      "EXCEPTION",
    ])
    .default(""),
  supplierCount: z.enum(["", "1", "2", "3_PLUS"]).default(""),
  sortBy: z.enum(["UPDATED_DESC", "UPDATED_ASC", "CREATED_DESC"]).default("UPDATED_DESC"),
  page: z.coerce.number().int().min(1).default(1),
});

const TRADE_ORDER_PAGE_SIZE = 10;

function getRequiredTradeOrderRecycleGuard(
  recycleGuardByTradeOrderId: Map<string, TradeOrderRecycleGuard>,
  tradeOrderId: string,
) {
  const recycleGuard = recycleGuardByTradeOrderId.get(tradeOrderId);

  if (!recycleGuard) {
    throw new Error("Trade-order recycle guard is missing.");
  }

  return recycleGuard;
}

function getRequiredTradeOrderFinalizePreview(
  finalizePreviewByTradeOrderId: Map<string, RecycleFinalizePreview>,
  tradeOrderId: string,
) {
  const finalizePreview = finalizePreviewByTradeOrderId.get(tradeOrderId);

  if (!finalizePreview) {
    throw new Error("Trade-order finalize preview is missing.");
  }

  return finalizePreview;
}

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
  const [hiddenProductSkuIds, hiddenProductIds, hiddenSupplierIds] = await Promise.all([
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT_SKU"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "SUPPLIER"),
  ]);

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
      ...(hiddenProductSkuIds.length > 0
        ? {
            id: {
              in: skuIds.filter((skuId) => !hiddenProductSkuIds.includes(skuId)),
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

  const customerRecycleEntry = await findActiveCustomerRecycleEntry(prisma, customer.id);

  if (customerRecycleEntry) {
    return null;
  }

  if (tradeOrderId) {
    const recycleEntry = await findActiveTradeOrderRecycleEntry(prisma, tradeOrderId);

    if (recycleEntry) {
      return null;
    }
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
    focusView: getParamValue(rawSearchParams?.focusView),
    supplierCount: getParamValue(rawSearchParams?.supplierCount),
    sortBy: getParamValue(rawSearchParams?.sortBy) || "UPDATED_DESC",
    page: getParamValue(rawSearchParams?.page) || "1",
  });
}

function buildTradeOrderCoreWhereInput(
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

  return andClauses.length > 0 ? { AND: andClauses } : {};
}

function mergeTradeOrderWhereClauses(
  ...clauses: Prisma.TradeOrderWhereInput[]
): Prisma.TradeOrderWhereInput {
  const filteredClauses = clauses.filter((clause) => Object.keys(clause).length > 0);

  if (filteredClauses.length === 0) {
    return {};
  }

  if (filteredClauses.length === 1) {
    return filteredClauses[0] ?? {};
  }

  return {
    AND: filteredClauses,
  };
}

function getNoTrackingWhere(): Prisma.ShippingTaskWhereInput {
  return {
    OR: [{ trackingNumber: null }, { trackingNumber: "" }],
  };
}

function getHasTrackingWhere(): Prisma.ShippingTaskWhereInput {
  return {
    AND: [{ trackingNumber: { not: null } }, { trackingNumber: { not: "" } }],
  };
}

function buildTradeOrderFocusWhereInput(
  focusView: TradeOrderFilters["focusView"],
): Prisma.TradeOrderWhereInput | null {
  if (!focusView) {
    return null;
  }

  if (focusView === "PENDING_REVIEW" || focusView === "APPROVED") {
    return { tradeStatus: focusView };
  }

  if (focusView === "PENDING_REPORT") {
    return {
      salesOrders: {
        some: {
          shippingTask: {
            is: {
              reportStatus: ShippingReportStatus.PENDING,
              shippingStatus: {
                not: ShippingFulfillmentStatus.CANCELED,
              },
              ...getNoTrackingWhere(),
            },
          },
        },
      },
    };
  }

  if (focusView === "PENDING_TRACKING") {
    return {
      salesOrders: {
        some: {
          shippingTask: {
            is: {
              reportStatus: ShippingReportStatus.REPORTED,
              shippingStatus: {
                not: ShippingFulfillmentStatus.CANCELED,
              },
              ...getNoTrackingWhere(),
            },
          },
        },
      },
    };
  }

  if (focusView === "SHIPPED") {
    return {
      salesOrders: {
        some: {
          shippingTask: {
            is: {
              shippingStatus: {
                in: [
                  ShippingFulfillmentStatus.SHIPPED,
                  ShippingFulfillmentStatus.DELIVERED,
                  ShippingFulfillmentStatus.COMPLETED,
                ],
              },
            },
          },
        },
      },
    };
  }

  return {
    salesOrders: {
      some: {
        shippingTask: {
          is: {
            OR: [
              {
                shippingStatus: ShippingFulfillmentStatus.CANCELED,
              },
              {
                AND: [
                  {
                    reportStatus: ShippingReportStatus.PENDING,
                  },
                  getHasTrackingWhere(),
                ],
              },
              {
                AND: [
                  {
                    reportStatus: ShippingReportStatus.REPORTED,
                  },
                  {
                    exportBatchId: {
                      not: null,
                    },
                  },
                  {
                    exportBatch: {
                      is: {
                        fileUrl: null,
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  };
}

function buildTradeOrderStateWhereInput(
  filters: TradeOrderFilters,
): Prisma.TradeOrderWhereInput {
  const andClauses: Prisma.TradeOrderWhereInput[] = [];

  if (filters.statusView) {
    andClauses.push({ tradeStatus: filters.statusView });
  }

  const focusWhere = buildTradeOrderFocusWhereInput(filters.focusView);
  if (focusWhere) {
    andClauses.push(focusWhere);
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
    throw new Error("当前角色无权访问成交主单模块。");
  }

  const teamId = await getViewerTeamId(viewer);
  const filters = parseTradeOrderFilters(rawSearchParams);
  const activeRecycleTradeOrderIds = await listActiveTradeOrderIds(prisma);
  const recycleExclusionWhere: Prisma.TradeOrderWhereInput =
    activeRecycleTradeOrderIds.length > 0
      ? {
          id: {
            notIn: activeRecycleTradeOrderIds,
          },
        }
      : {};
  const coreWhere = mergeTradeOrderWhereClauses(
    buildTradeOrderCoreWhereInput(viewer, teamId, filters),
    recycleExclusionWhere,
  );
  const supplierCountTradeOrderIds = await resolveSupplierCountTradeOrderIds(
    coreWhere,
    filters.supplierCount,
  );
  const scopedWhere =
    supplierCountTradeOrderIds === null
      ? coreWhere
      : supplierCountTradeOrderIds.length > 0
        ? mergeTradeOrderWhereClauses(coreWhere, {
            id: { in: supplierCountTradeOrderIds },
          })
        : { id: "__missing_trade_order_supplier_count__" };
  const stateWhere = buildTradeOrderStateWhereInput(filters);
  const where = mergeTradeOrderWhereClauses(scopedWhere, stateWhere);
  const orderBy = buildTradeOrderOrderBy(filters.sortBy);

  const [
    totalCount,
    draftCount,
    pendingReviewCount,
    approvedCount,
    rejectedCount,
    codTradeCount,
    amountSummary,
    focusAllCount,
    focusPendingReviewCount,
    focusApprovedCount,
    pendingReportCount,
    pendingTrackingCount,
    shippedCount,
    exceptionCount,
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
    prisma.tradeOrder.count({ where: scopedWhere }),
    prisma.tradeOrder.count({
      where: {
        AND: [scopedWhere, { tradeStatus: TradeOrderStatus.PENDING_REVIEW }],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [scopedWhere, { tradeStatus: TradeOrderStatus.APPROVED }],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [
          scopedWhere,
          buildTradeOrderFocusWhereInput("PENDING_REPORT") ?? {},
        ],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [
          scopedWhere,
          buildTradeOrderFocusWhereInput("PENDING_TRACKING") ?? {},
        ],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [scopedWhere, buildTradeOrderFocusWhereInput("SHIPPED") ?? {}],
      },
    }),
    prisma.tradeOrder.count({
      where: {
        AND: [scopedWhere, buildTradeOrderFocusWhereInput("EXCEPTION") ?? {}],
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
      receiverAddressSnapshot: true,
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
              shippingProvider: true,
              trackingNumber: true,
            },
          },
        },
      },
    },
  });

  const pageTradeOrderIds = items.map((item) => item.id);
  const executionSummaryMap = await getTradeOrderExecutionSummaryMap(pageTradeOrderIds);
  const latestExportLines = pageTradeOrderIds.length
    ? await prisma.shippingExportLine.findMany({
        where: {
          tradeOrderId: {
            in: pageTradeOrderIds,
          },
        },
        orderBy: [{ exportBatch: { exportedAt: "desc" } }, { rowNo: "asc" }],
        select: {
          tradeOrderId: true,
          supplierId: true,
          exportBatch: {
            select: {
              id: true,
              exportNo: true,
              exportedAt: true,
              fileUrl: true,
              supplier: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      })
    : [];

  const latestExportBatchByTradeOrderId = new Map<
    string,
    {
      id: string;
      exportNo: string;
      exportedAt: Date;
      fileUrl: string | null;
      supplier: {
        id: string;
        name: string;
      };
    }
  >();

  for (const line of latestExportLines) {
    if (latestExportBatchByTradeOrderId.has(line.tradeOrderId)) {
      continue;
    }

    latestExportBatchByTradeOrderId.set(line.tradeOrderId, {
      id: line.exportBatch.id,
      exportNo: line.exportBatch.exportNo,
      exportedAt: line.exportBatch.exportedAt,
      fileUrl: line.exportBatch.fileUrl,
      supplier: line.exportBatch.supplier,
    });
  }

  const recycleTargets = await Promise.all(
    pageTradeOrderIds.map((tradeOrderId) =>
      getTradeOrderRecycleTarget(prisma, "TRADE_ORDER", tradeOrderId),
    ),
  );
  const finalizePreviews = await Promise.all(
    pageTradeOrderIds.map((tradeOrderId) =>
      buildTradeOrderFinalizePreview(prisma, {
        targetType: "TRADE_ORDER",
        targetId: tradeOrderId,
        domain: "TRADE_ORDER",
      }),
    ),
  );
  const recycleGuardByTradeOrderId = new Map(
    recycleTargets
      .filter((target): target is NonNullable<(typeof recycleTargets)[number]> => Boolean(target))
      .map((target) => [target.targetId, target.guard]),
  );
  const finalizePreviewByTradeOrderId = new Map(
    pageTradeOrderIds.flatMap((tradeOrderId, index) => {
      const preview = finalizePreviews[index];
      return preview ? [[tradeOrderId, preview] as const] : [];
    }),
  );

  return {
    notice: parseActionNotice(rawSearchParams),
    summary: {
      totalCount,
      draftCount,
      pendingReviewCount,
      approvedCount,
      rejectedCount,
      codTradeCount,
      focusCounts: {
        all: focusAllCount,
        pendingReview: focusPendingReviewCount,
        approved: focusApprovedCount,
        pendingReport: pendingReportCount,
        pendingTracking: pendingTrackingCount,
        shipped: shippedCount,
        exception: exceptionCount,
      },
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
      executionSummary: executionSummaryMap.get(item.id) ?? null,
      latestExportBatch: latestExportBatchByTradeOrderId.get(item.id) ?? null,
      recycleGuard: getRequiredTradeOrderRecycleGuard(recycleGuardByTradeOrderId, item.id),
      finalizePreview: getRequiredTradeOrderFinalizePreview(
        finalizePreviewByTradeOrderId,
        item.id,
      ),
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
    throw new Error("当前角色无权访问成交主单模块。");
  }

  const recycleEntry = await findActiveTradeOrderRecycleEntry(prisma, tradeOrderId);

  if (recycleEntry) {
    return null;
  }

  const teamId = await getViewerTeamId(viewer);
  const scope = buildActorTradeOrderWhere(viewer, teamId);
  const scopedWhere = mergeTradeOrderWhereClauses({ id: tradeOrderId }, scope);

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
              shippingProvider: true,
              trackingNumber: true,
              reportedAt: true,
              shippedAt: true,
              exportBatch: {
                select: {
                  id: true,
                  exportNo: true,
                  exportedAt: true,
                  fileUrl: true,
                },
              },
            },
          },
        },
      },
      paymentRecords: {
        where: {
          salesOrderId: {
            not: null,
          },
        },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        take: 12,
        select: {
          id: true,
          status: true,
          amount: true,
          occurredAt: true,
          createdAt: true,
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
      collectionTasks: {
        where: {
          salesOrderId: {
            not: null,
          },
        },
        orderBy: [{ createdAt: "desc" }, { dueAt: "asc" }],
        take: 12,
        select: {
          id: true,
          status: true,
          taskType: true,
          createdAt: true,
          dueAt: true,
          nextFollowUpAt: true,
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
  });

  if (!tradeOrder) {
    return null;
  }

  const executionSummaryMap = await getTradeOrderExecutionSummaryMap([tradeOrder.id]);
  const recycleTarget = await getTradeOrderRecycleTarget(prisma, "TRADE_ORDER", tradeOrder.id);
  const finalizePreview = await buildTradeOrderFinalizePreview(prisma, {
    targetType: "TRADE_ORDER",
    targetId: tradeOrder.id,
    domain: "TRADE_ORDER",
  });

  if (!recycleTarget) {
    throw new Error("Trade-order recycle target is missing.");
  }

  if (!finalizePreview) {
    throw new Error("Trade-order finalize preview is missing.");
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
      paymentRecords: tradeOrder.paymentRecords.map((paymentRecord) => ({
        ...paymentRecord,
        amount: paymentRecord.amount.toString(),
      })),
      collectionTasks: tradeOrder.collectionTasks,
      executionSummary: executionSummaryMap.get(tradeOrder.id) ?? null,
      recycleGuard: recycleTarget.guard,
      finalizePreview,
    },
    operationLogs,
  };
}
