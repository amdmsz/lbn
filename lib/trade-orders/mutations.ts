import {
  OperationModule,
  OperationTargetType,
  ProductBundleStatus,
  SalesOrderPaymentMode,
  SalesOrderPaymentScheme,
  SalesOrderReviewStatus,
  SalesSubOrderStatus,
  ShippingFulfillmentStatus,
  ShippingReportStatus,
  ShippingTaskStatus,
  TradeOrderComponentType,
  TradeOrderItemComponentSourceType,
  TradeOrderItemSourceType,
  TradeOrderItemType,
  TradeOrderStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import { canCreateSalesOrder, canReviewSalesOrder } from "@/lib/auth/access";
import { assertCustomerNotInActiveRecycleBin } from "@/lib/customers/recycle";
import { touchCustomerEffectiveFollowUpFromTradeOrderTx } from "@/lib/customers/ownership";
import { prisma } from "@/lib/db/prisma";
import { syncSalesOrderPaymentArtifacts } from "@/lib/payments/mutations";
import { findProductDomainCurrentlyHiddenTargetIds } from "@/lib/products/recycle";
import { assertTradeOrderNotInActiveRecycleBin } from "@/lib/trade-orders/recycle";
import {
  buildTradeOrderDraftComputation,
  isTradeOrderDraftReadyForSubmit,
  mapPaymentSchemeToLegacyPaymentMode,
  type TradeOrderBundleLineInput,
  type TradeOrderBundleOption,
  type TradeOrderGiftLineInput,
  type TradeOrderLineInput,
  type TradeOrderSkuOption,
} from "@/lib/trade-orders/workflow";

export type TradeOrderActor = {
  id: string;
  role: RoleCode;
};

const tradeOrderLineSchema = z.object({
  lineId: z.string().trim().default(""),
  skuId: z.string().trim().min(1, "SKU is required."),
  qty: z.coerce.number().int().min(1, "Quantity must be at least 1."),
  dealPrice: z.coerce.number().min(0, "Deal price cannot be negative."),
  discountReason: z.string().trim().max(500).default(""),
});

const tradeOrderGiftLineSchema = z.object({
  lineId: z.string().trim().default(""),
  skuId: z.string().trim().min(1, "Gift SKU is required."),
  qty: z.coerce.number().int().min(1, "Gift quantity must be at least 1."),
  remark: z.string().trim().max(500).default(""),
});

const tradeOrderBundleLineSchema = z.object({
  lineId: z.string().trim().default(""),
  bundleId: z.string().trim().min(1, "Bundle is required."),
  qty: z.coerce.number().int().min(1, "Bundle quantity must be at least 1."),
  dealPrice: z.coerce.number().min(0, "Bundle deal price cannot be negative."),
  remark: z.string().trim().max(500).default(""),
});

const tradeOrderDraftSchema = z.object({
  id: z.string().trim().default(""),
  customerId: z.string().trim().min(1, "Customer is required."),
  lines: z.array(tradeOrderLineSchema).default([]),
  giftLines: z.array(tradeOrderGiftLineSchema).default([]),
  bundleLines: z.array(tradeOrderBundleLineSchema).default([]),
  paymentScheme: z.nativeEnum(SalesOrderPaymentScheme),
  depositAmount: z.coerce.number().min(0, "Deposit cannot be negative.").default(0),
  receiverName: z.string().trim().min(1, "Receiver name is required."),
  receiverPhone: z.string().trim().min(1, "Receiver phone is required.").max(30),
  receiverAddress: z.string().trim().min(1, "Receiver address is required.").max(500),
  insuranceRequired: z.coerce.boolean().default(false),
  insuranceAmount: z.coerce.number().min(0, "Insurance amount cannot be negative.").default(0),
  remark: z.string().trim().max(1000).default(""),
}).superRefine((value, ctx) => {
  if (
    value.lines.length === 0 &&
    value.giftLines.length === 0 &&
    value.bundleLines.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lines"],
      message: "At least one SKU, gift, or bundle line is required.",
    });
  }
});

const reviewTradeOrderSchema = z
  .object({
    tradeOrderId: z.string().trim().default(""),
    salesOrderId: z.string().trim().default(""),
    reviewStatus: z.enum(["APPROVED", "REJECTED"]),
    rejectReason: z.string().trim().max(500).default(""),
  })
  .superRefine((value, ctx) => {
    if (!value.tradeOrderId && !value.salesOrderId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tradeOrderId"],
        message: "Trade order or sales order is required.",
      });
    }

    if (value.reviewStatus === "REJECTED" && !value.rejectReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectReason"],
        message: "Reject reason is required.",
      });
    }
  });

async function getActorTeamId(actor: TradeOrderActor) {
  if (actor.role !== "SUPERVISOR") {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { teamId: true },
  });

  return user?.teamId ?? null;
}

function buildActorCustomerWhere(
  actor: TradeOrderActor,
  teamId: string | null,
): Prisma.CustomerWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
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

  return { ownerId: actor.id };
}

function buildActorTradeOrderWhere(
  actor: TradeOrderActor,
  teamId: string | null,
): Prisma.TradeOrderWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
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
    OR: [{ ownerId: actor.id }, { customer: { is: { ownerId: actor.id } } }],
  };
}

function createTradeNo() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes(),
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const suffix = Math.random().toString().slice(2, 6);
  return `TO${stamp}${suffix}`;
}

function createSubOrderNo(tradeNo: string, sequence: number) {
  return `${tradeNo}-S${String(sequence).padStart(2, "0")}`;
}

function extractLinesSummary(lines: TradeOrderLineInput[]) {
  return lines.map((line) => ({
    skuId: line.skuId,
    qty: line.qty,
    dealPrice: line.dealPrice,
  }));
}

function extractGiftLinesSummary(lines: TradeOrderGiftLineInput[]) {
  return lines.map((line) => ({
    skuId: line.skuId,
    qty: line.qty,
    remark: line.remark,
  }));
}

function extractBundleLinesSummary(lines: TradeOrderBundleLineInput[]) {
  return lines.map((line) => ({
    bundleId: line.bundleId,
    qty: line.qty,
    dealPrice: line.dealPrice,
    remark: line.remark,
  }));
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
      } satisfies TradeOrderBundleOption;
    })
    .filter((bundle) => bundle.items.length > 0);
}

async function resolveDraftContext(
  actor: TradeOrderActor,
  input: z.infer<typeof tradeOrderDraftSchema>,
) {
  const teamId = await getActorTeamId(actor);
  const customerWhere = buildActorCustomerWhere(actor, teamId);
  const tradeOrderWhere = buildActorTradeOrderWhere(actor, teamId);
  const [hiddenProductSkuIds, hiddenProductIds, hiddenSupplierIds] = await Promise.all([
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT_SKU"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "SUPPLIER"),
  ]);
  const requestedSkuIds = [
    ...new Set([
      ...input.lines.map((line) => line.skuId),
      ...input.giftLines.map((line) => line.skuId),
    ]),
  ];
  const visibleRequestedSkuIds = requestedSkuIds.filter(
    (skuId) => !hiddenProductSkuIds.includes(skuId),
  );

  const [customer, existingTradeOrder, skuRecords, bundleOptions] = await Promise.all([
    prisma.customer.findFirst({
      where: {
        id: input.customerId,
        ...customerWhere,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        ownerId: true,
      },
    }),
    input.id
      ? prisma.tradeOrder.findFirst({
          where: {
            id: input.id,
            ...tradeOrderWhere,
          },
          select: {
            id: true,
            tradeNo: true,
            customerId: true,
            ownerId: true,
            reviewStatus: true,
            tradeStatus: true,
            paymentPlans: {
              select: { id: true },
            },
            paymentRecords: {
              select: { id: true },
            },
            collectionTasks: {
              select: { id: true },
            },
            salesOrders: {
              select: {
                id: true,
                shippingTask: {
                  select: { id: true },
                },
                paymentPlans: {
                  select: { id: true },
                },
                paymentRecords: {
                  select: { id: true },
                },
                collectionTasks: {
                  select: { id: true },
                },
                logisticsFollowUpTasks: {
                  select: { id: true },
                },
                codCollectionRecords: {
                  select: { id: true },
                },
              },
            },
          },
        })
      : Promise.resolve(null),
    prisma.productSku.findMany({
      where: {
        id: {
          in: visibleRequestedSkuIds,
        },
        enabled: true,
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
    }),
    getVisibleBundleOptions(),
  ]);

  if (!customer) {
    throw new Error("Customer not found or out of scope.");
  }

  await assertCustomerNotInActiveRecycleBin(prisma, customer.id);

  if (existingTradeOrder && existingTradeOrder.customerId !== customer.id) {
    throw new Error("Trade order does not belong to the current customer.");
  }

  const skuOptions: TradeOrderSkuOption[] = skuRecords.map((sku) => ({
    ...sku,
    defaultUnitPrice: sku.defaultUnitPrice.toString(),
    defaultInsuranceAmount: sku.defaultInsuranceAmount.toString(),
  }));

  const computation = buildTradeOrderDraftComputation({
    lines: input.lines,
    giftLines: input.giftLines,
    bundleLines: input.bundleLines,
    skuOptions,
    bundleOptions,
    paymentScheme: input.paymentScheme,
    depositAmount: input.depositAmount,
    insuranceRequired: input.insuranceRequired,
    insuranceAmount: input.insuranceAmount,
  });

  const ownerId = customer.ownerId ?? (actor.role === "SALES" ? actor.id : null);

  return {
    customer,
    existingTradeOrder,
    computation,
    ownerId,
  };
}

function hasInitializedChildArtifacts(
  tradeOrder: NonNullable<Awaited<ReturnType<typeof resolveDraftContext>>["existingTradeOrder"]>,
) {
  if (
    tradeOrder.paymentPlans.length > 0 ||
    tradeOrder.paymentRecords.length > 0 ||
    tradeOrder.collectionTasks.length > 0
  ) {
    return true;
  }

  return tradeOrder.salesOrders.some(
    (salesOrder) =>
      Boolean(salesOrder.shippingTask) ||
      salesOrder.paymentPlans.length > 0 ||
      salesOrder.paymentRecords.length > 0 ||
      salesOrder.collectionTasks.length > 0 ||
      salesOrder.logisticsFollowUpTasks.length > 0 ||
      salesOrder.codCollectionRecords.length > 0,
  );
}

async function replaceTradeOrderItems(
  tx: Prisma.TransactionClient,
  tradeOrderId: string,
  computation: Awaited<ReturnType<typeof resolveDraftContext>>["computation"],
) {
  await tx.salesOrderItem.updateMany({
    where: {
      tradeOrderId,
    },
    data: {
      tradeOrderItemId: null,
      tradeOrderItemComponentId: null,
    },
  });

  await tx.tradeOrderItemComponent.deleteMany({
    where: { tradeOrderId },
  });

  await tx.tradeOrderItem.deleteMany({
    where: { tradeOrderId },
  });

  const componentMappings = new Map<
    string,
    {
      tradeOrderItemId: string;
      componentId: string;
      itemType: TradeOrderItemType;
    }
  >();

  for (const parentItem of computation.items) {
    const createdItem = await tx.tradeOrderItem.create({
      data: {
        tradeOrderId,
        lineNo: parentItem.lineNo,
        itemType:
          parentItem.itemType === "GIFT"
            ? TradeOrderItemType.GIFT
            : parentItem.itemType === "BUNDLE"
              ? TradeOrderItemType.BUNDLE
              : TradeOrderItemType.SKU,
        itemSourceType:
          parentItem.itemType === "GIFT"
            ? TradeOrderItemSourceType.MANUAL_GIFT
            : parentItem.itemType === "BUNDLE"
              ? TradeOrderItemSourceType.BUNDLE_SALE
              : TradeOrderItemSourceType.DIRECT_SKU,
        productId: parentItem.productId,
        skuId: parentItem.skuId,
        bundleId: parentItem.bundleId,
        titleSnapshot: parentItem.title,
        productNameSnapshot: parentItem.productName ?? null,
        skuNameSnapshot: parentItem.skuName ?? null,
        specSnapshot: parentItem.skuName ?? null,
        unitSnapshot: "",
        bundleCodeSnapshot: parentItem.bundleCode ?? null,
        bundleNameSnapshot: parentItem.bundleName ?? null,
        bundleVersionSnapshot: parentItem.bundleVersion ?? null,
        listUnitPriceSnapshot: parentItem.listUnitPrice,
        dealUnitPriceSnapshot: parentItem.dealUnitPrice,
        qty: parentItem.qty,
        subtotal: parentItem.finalAmount,
        discountAmount: parentItem.discountAmount,
        remark: parentItem.remark || null,
      },
      select: {
        id: true,
      },
    });

    for (const component of parentItem.components) {
      const createdComponent = await tx.tradeOrderItemComponent.create({
        data: {
          tradeOrderId,
          tradeOrderItemId: createdItem.id,
          componentSeq: component.componentSeq,
          componentType:
            component.componentType === "GIFT"
              ? TradeOrderComponentType.GIFT
              : TradeOrderComponentType.GOODS,
          componentSourceType:
            component.componentSourceType === "GIFT_COMPONENT"
              ? TradeOrderItemComponentSourceType.GIFT_COMPONENT
              : component.componentSourceType === "BUNDLE_COMPONENT"
                ? TradeOrderItemComponentSourceType.BUNDLE_COMPONENT
                : TradeOrderItemComponentSourceType.DIRECT_SKU,
          supplierId: component.supplierId,
          productId: component.productId,
          skuId: component.skuId,
          supplierNameSnapshot: component.supplierName,
          productNameSnapshot: component.productName,
          skuNameSnapshot: component.skuName,
          specSnapshot: component.skuName ?? null,
          unitSnapshot: "",
          exportDisplayNameSnapshot: component.exportDisplayName,
          qty: component.qty,
          allocatedListUnitPriceSnapshot: component.listUnitPrice,
          allocatedDealUnitPriceSnapshot: component.dealUnitPrice,
          allocatedSubtotal: component.finalAmount,
          allocatedDiscountAmount: component.discountAmount,
        },
        select: {
          id: true,
        },
      });

      componentMappings.set(component.componentKey, {
        tradeOrderItemId: createdItem.id,
        componentId: createdComponent.id,
        itemType:
          parentItem.itemType === "GIFT"
            ? TradeOrderItemType.GIFT
            : parentItem.itemType === "BUNDLE"
              ? TradeOrderItemType.BUNDLE
              : TradeOrderItemType.SKU,
      });
    }
  }

  return componentMappings;
}

async function upsertTradeOrderRecord(
  tx: Prisma.TransactionClient,
  input: {
    actor: TradeOrderActor;
    customer: Awaited<ReturnType<typeof resolveDraftContext>>["customer"];
    existingTradeOrder: Awaited<ReturnType<typeof resolveDraftContext>>["existingTradeOrder"];
    ownerId: string | null;
    form: z.infer<typeof tradeOrderDraftSchema>;
    computation: Awaited<ReturnType<typeof resolveDraftContext>>["computation"];
    tradeStatus: TradeOrderStatus;
    reviewStatus: SalesOrderReviewStatus;
    clearReviewMeta?: boolean;
  },
) {
  const tradeNo = input.existingTradeOrder?.tradeNo || createTradeNo();

  return input.existingTradeOrder
    ? tx.tradeOrder.update({
        where: { id: input.existingTradeOrder.id },
        data: {
          tradeNo,
          customerId: input.customer.id,
          ownerId: input.ownerId,
          reviewStatus: input.reviewStatus,
          tradeStatus: input.tradeStatus,
          paymentScheme: input.form.paymentScheme,
          listAmount: input.computation.totals.listAmount,
          dealAmount: input.computation.totals.dealAmount,
          goodsAmount: input.computation.totals.goodsAmount,
          discountAmount: input.computation.totals.discountAmount,
          finalAmount: input.computation.totals.finalAmount,
          depositAmount: input.computation.totals.depositAmount,
          collectedAmount: input.computation.totals.collectedAmount,
          paidAmount: input.computation.totals.collectedAmount,
          remainingAmount: input.computation.totals.remainingAmount,
          codAmount: input.computation.totals.codAmount,
          insuranceRequired:
            input.form.insuranceRequired && input.computation.totals.insuranceAmount > 0,
          insuranceAmount: input.computation.totals.insuranceAmount,
          discountReason: null,
          receiverNameSnapshot: input.form.receiverName,
          receiverPhoneSnapshot: input.form.receiverPhone,
          receiverAddressSnapshot: input.form.receiverAddress,
          reviewerId: input.clearReviewMeta ? null : undefined,
          reviewedAt: input.clearReviewMeta ? null : undefined,
          rejectReason: input.clearReviewMeta ? null : undefined,
          remark: input.form.remark || null,
          updatedById: input.actor.id,
        },
        select: {
          id: true,
          tradeNo: true,
          customerId: true,
        },
      })
    : tx.tradeOrder.create({
        data: {
          tradeNo,
          customerId: input.customer.id,
          ownerId: input.ownerId,
          reviewStatus: input.reviewStatus,
          tradeStatus: input.tradeStatus,
          paymentScheme: input.form.paymentScheme,
          listAmount: input.computation.totals.listAmount,
          dealAmount: input.computation.totals.dealAmount,
          goodsAmount: input.computation.totals.goodsAmount,
          discountAmount: input.computation.totals.discountAmount,
          finalAmount: input.computation.totals.finalAmount,
          depositAmount: input.computation.totals.depositAmount,
          collectedAmount: input.computation.totals.collectedAmount,
          paidAmount: input.computation.totals.collectedAmount,
          remainingAmount: input.computation.totals.remainingAmount,
          codAmount: input.computation.totals.codAmount,
          insuranceRequired:
            input.form.insuranceRequired && input.computation.totals.insuranceAmount > 0,
          insuranceAmount: input.computation.totals.insuranceAmount,
          receiverNameSnapshot: input.form.receiverName,
          receiverPhoneSnapshot: input.form.receiverPhone,
          receiverAddressSnapshot: input.form.receiverAddress,
          remark: input.form.remark || null,
          createdById: input.actor.id,
          updatedById: input.actor.id,
        },
        select: {
          id: true,
          tradeNo: true,
          customerId: true,
        },
      });
}

async function deleteTradeOrderSalesOrders(
  tx: Prisma.TransactionClient,
  salesOrderIds: string[],
) {
  if (salesOrderIds.length === 0) {
    return;
  }

  await tx.salesOrderGiftItem.deleteMany({
    where: {
      salesOrderId: {
        in: salesOrderIds,
      },
    },
  });

  await tx.salesOrderItem.deleteMany({
    where: {
      salesOrderId: {
        in: salesOrderIds,
      },
    },
  });

  await tx.salesOrder.deleteMany({
    where: {
      id: {
        in: salesOrderIds,
      },
    },
  });
}

function assertEditableTradeOrderForDraft(
  existingTradeOrder: Awaited<ReturnType<typeof resolveDraftContext>>["existingTradeOrder"],
) {
  if (!existingTradeOrder) {
    return;
  }

  if (existingTradeOrder.tradeStatus === TradeOrderStatus.APPROVED) {
    throw new Error("Approved trade orders cannot be edited from the draft form.");
  }

  if (
    existingTradeOrder.tradeStatus === TradeOrderStatus.PENDING_REVIEW &&
    existingTradeOrder.salesOrders.length > 0
  ) {
    throw new Error("Pending-review trade orders cannot be overwritten as drafts.");
  }
}

function assertRebuildableTradeOrder(
  existingTradeOrder: Awaited<ReturnType<typeof resolveDraftContext>>["existingTradeOrder"],
) {
  if (!existingTradeOrder) {
    return;
  }

  if (existingTradeOrder.tradeStatus === TradeOrderStatus.APPROVED) {
    throw new Error("Approved trade orders cannot rebuild supplier sub-orders.");
  }

  if (hasInitializedChildArtifacts(existingTradeOrder)) {
    throw new Error("Current trade order already initialized shipping or payment artifacts.");
  }
}

function getSupplierGroupsSummary(
  computation: Awaited<ReturnType<typeof resolveDraftContext>>["computation"],
) {
  return computation.groups.map((group) => ({
    supplierId: group.supplierId,
    supplierName: group.supplierName,
    lineCount: group.lineCount,
    skuLineCount: group.skuLineCount,
    giftLineCount: group.giftLineCount,
    bundleLineCount: group.bundleLineCount,
    componentCount: group.componentCount,
    qtyTotal: group.qtyTotal,
    finalAmount: group.finalAmount,
  }));
}

export async function createTradeOrder(
  actor: TradeOrderActor,
  rawInput: z.input<typeof tradeOrderDraftSchema>,
) {
  return saveTradeOrderDraft(actor, rawInput);
}

export async function saveTradeOrderDraft(
  actor: TradeOrderActor,
  rawInput: z.input<typeof tradeOrderDraftSchema>,
) {
  if (!canCreateSalesOrder(actor.role)) {
    throw new Error("You do not have permission to create trade order drafts.");
  }

  const input = tradeOrderDraftSchema.parse(rawInput);

  if (input.id) {
    await assertTradeOrderNotInActiveRecycleBin(prisma, input.id);
  }

  const context = await resolveDraftContext(actor, input);

  assertEditableTradeOrderForDraft(context.existingTradeOrder);

  if (context.computation.issues.length > 0) {
    throw new Error(context.computation.issues[0]?.message ?? "Trade order draft is invalid.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const tradeOrder = await upsertTradeOrderRecord(tx, {
      actor,
      customer: context.customer,
      existingTradeOrder: context.existingTradeOrder,
      ownerId: context.ownerId,
      form: input,
      computation: context.computation,
      tradeStatus: TradeOrderStatus.DRAFT,
      reviewStatus:
        context.existingTradeOrder?.reviewStatus ?? SalesOrderReviewStatus.PENDING_REVIEW,
      clearReviewMeta: false,
    });

    await replaceTradeOrderItems(tx, tradeOrder.id, context.computation);

    if (context.existingTradeOrder?.salesOrders.length) {
      assertRebuildableTradeOrder(context.existingTradeOrder);

      await deleteTradeOrderSalesOrders(
        tx,
        context.existingTradeOrder.salesOrders.map((salesOrder) => salesOrder.id),
      );
    }

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action: context.existingTradeOrder ? "trade_order.draft_saved" : "trade_order.created",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: tradeOrder.id,
        description: `${context.existingTradeOrder ? "Saved draft" : "Created"} trade order ${tradeOrder.tradeNo}`,
        beforeData: context.existingTradeOrder
          ? {
              tradeStatus: context.existingTradeOrder.tradeStatus,
              reviewStatus: context.existingTradeOrder.reviewStatus,
            }
          : undefined,
        afterData: {
          tradeNo: tradeOrder.tradeNo,
          customerId: context.customer.id,
          ownerId: context.ownerId,
          paymentScheme: input.paymentScheme,
          totals: context.computation.totals,
          lines: extractLinesSummary(input.lines),
          giftLines: extractGiftLinesSummary(input.giftLines),
          bundleLines: extractBundleLinesSummary(input.bundleLines),
          supplierGroups: getSupplierGroupsSummary(context.computation),
        },
      },
    });

    await touchCustomerEffectiveFollowUpFromTradeOrderTx(tx, {
      customerId: context.customer.id,
      occurredAt: new Date(),
    });

    return tradeOrder;
  });

  return {
    id: result.id,
    customerId: result.customerId,
    tradeNo: result.tradeNo,
  };
}

export async function submitTradeOrderForReview(
  actor: TradeOrderActor,
  rawInput: z.input<typeof tradeOrderDraftSchema>,
) {
  if (!canCreateSalesOrder(actor.role)) {
    throw new Error("You do not have permission to submit trade orders.");
  }

  const input = tradeOrderDraftSchema.parse(rawInput);

  if (input.id) {
    await assertTradeOrderNotInActiveRecycleBin(prisma, input.id);
  }

  const context = await resolveDraftContext(actor, input);

  if (!isTradeOrderDraftReadyForSubmit(context.computation)) {
    throw new Error(context.computation.issues[0]?.message ?? "Trade order draft is invalid.");
  }

  assertRebuildableTradeOrder(context.existingTradeOrder);

  const result = await prisma.$transaction(async (tx) => {
    const tradeOrder = await upsertTradeOrderRecord(tx, {
      actor,
      customer: context.customer,
      existingTradeOrder: context.existingTradeOrder,
      ownerId: context.ownerId,
      form: input,
      computation: context.computation,
      tradeStatus: TradeOrderStatus.PENDING_REVIEW,
      reviewStatus: SalesOrderReviewStatus.PENDING_REVIEW,
      clearReviewMeta: true,
    });

    const componentMappings = await replaceTradeOrderItems(
      tx,
      tradeOrder.id,
      context.computation,
    );

    if (context.existingTradeOrder?.salesOrders.length) {
      await deleteTradeOrderSalesOrders(
        tx,
        context.existingTradeOrder.salesOrders.map((salesOrder) => salesOrder.id),
      );
    }

    const createdSalesOrderIds: string[] = [];

    for (const [groupIndex, group] of context.computation.groups.entries()) {
      const subOrderNo = createSubOrderNo(tradeOrder.tradeNo, groupIndex + 1);
      const paymentMode = mapPaymentSchemeToLegacyPaymentMode(input.paymentScheme);

      const salesOrder = await tx.salesOrder.create({
        data: {
          orderNo: subOrderNo,
          tradeOrderId: tradeOrder.id,
          subOrderNo,
          supplierSequence: groupIndex + 1,
          subOrderStatus: SalesSubOrderStatus.PENDING_PARENT_REVIEW,
          customerId: context.customer.id,
          ownerId: context.ownerId,
          supplierId: group.supplierId,
          reviewStatus: SalesOrderReviewStatus.PENDING_REVIEW,
          paymentScheme: input.paymentScheme,
          paymentMode: paymentMode as SalesOrderPaymentMode,
          listAmount: group.listAmount,
          dealAmount: group.dealAmount,
          goodsAmount: group.finalAmount,
          discountAmount: group.discountAmount,
          finalAmount: group.finalAmount,
          depositAmount: group.depositAmount,
          collectedAmount: group.collectedAmount,
          paidAmount: group.collectedAmount,
          remainingAmount: group.remainingAmount,
          codAmount: group.codAmount,
          insuranceRequired: group.insuranceAmount > 0,
          insuranceAmount: group.insuranceAmount,
          receiverNameSnapshot: input.receiverName,
          receiverPhoneSnapshot: input.receiverPhone,
          receiverAddressSnapshot: input.receiverAddress,
          remark: input.remark || null,
          createdById: actor.id,
          updatedById: actor.id,
        },
        select: {
          id: true,
          orderNo: true,
          subOrderNo: true,
        },
      });

      createdSalesOrderIds.push(salesOrder.id);

      for (const [componentIndex, component] of group.components.entries()) {
        const mapping = componentMappings.get(component.componentKey);
        if (!mapping) {
          throw new Error("Trade order component mapping is missing.");
        }

        await tx.salesOrderItem.create({
          data: {
            salesOrderId: salesOrder.id,
            tradeOrderId: tradeOrder.id,
            tradeOrderItemId: mapping.tradeOrderItemId,
            tradeOrderItemComponentId: mapping.componentId,
            lineNo: componentIndex + 1,
            itemTypeSnapshot: mapping.itemType,
            titleSnapshot: component.title,
            exportDisplayNameSnapshot: component.exportDisplayName,
            productId: component.productId,
            skuId: component.skuId,
            productNameSnapshot: component.productName,
            skuNameSnapshot: component.skuName,
            specSnapshot: component.skuName,
            unitSnapshot: "",
            listPriceSnapshot: component.listUnitPrice,
            dealPriceSnapshot: component.dealUnitPrice,
            qty: component.qty,
            subtotal: component.finalAmount,
            discountAmount: component.discountAmount,
          },
        });
      }

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SALES_ORDER,
          action: "sales_order.created_from_trade_order",
          targetType: OperationTargetType.SALES_ORDER,
          targetId: salesOrder.id,
          description: `Created supplier sub-order ${salesOrder.orderNo} from trade order ${tradeOrder.tradeNo}`,
          afterData: {
            tradeOrderId: tradeOrder.id,
            tradeNo: tradeOrder.tradeNo,
            subOrderNo: salesOrder.subOrderNo,
            supplierId: group.supplierId,
            supplierName: group.supplierName,
            finalAmount: group.finalAmount,
            skuLineCount: group.skuLineCount,
            giftLineCount: group.giftLineCount,
            bundleLineCount: group.bundleLineCount,
            componentCount: group.componentCount,
          },
        },
      });
    }

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action: "trade_order.submitted_for_review",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: tradeOrder.id,
        description: `Submitted trade order ${tradeOrder.tradeNo} for review`,
        afterData: {
          tradeNo: tradeOrder.tradeNo,
          supplierGroupCount: context.computation.groups.length,
          skuLineCount: context.computation.totals.skuLineCount,
          giftLineCount: context.computation.totals.giftLineCount,
          bundleLineCount: context.computation.totals.bundleLineCount,
          salesOrderIds: createdSalesOrderIds,
        },
      },
    });

    await touchCustomerEffectiveFollowUpFromTradeOrderTx(tx, {
      customerId: context.customer.id,
      occurredAt: new Date(),
    });

    return {
      tradeOrderId: tradeOrder.id,
      tradeNo: tradeOrder.tradeNo,
      customerId: context.customer.id,
      salesOrderIds: createdSalesOrderIds,
    };
  });

  return result;
}

export async function reviewTradeOrder(
  actor: TradeOrderActor,
  rawInput: z.input<typeof reviewTradeOrderSchema>,
) {
  if (!canReviewSalesOrder(actor.role)) {
    throw new Error("You do not have permission to review trade orders.");
  }

  const input = reviewTradeOrderSchema.parse(rawInput);
  const teamId = await getActorTeamId(actor);
  const tradeOrderWhere = buildActorTradeOrderWhere(actor, teamId);

  const tradeOrder = await prisma.tradeOrder.findFirst({
    where: input.tradeOrderId
      ? {
          id: input.tradeOrderId,
          ...tradeOrderWhere,
        }
      : {
          ...tradeOrderWhere,
          salesOrders: {
            some: {
              id: input.salesOrderId,
            },
          },
        },
    select: {
      id: true,
      tradeNo: true,
      customerId: true,
      reviewStatus: true,
      tradeStatus: true,
      salesOrders: {
        orderBy: [{ supplierSequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          supplierId: true,
          ownerId: true,
          paymentScheme: true,
          finalAmount: true,
          depositAmount: true,
          codAmount: true,
          insuranceRequired: true,
          insuranceAmount: true,
          customerId: true,
          receiverNameSnapshot: true,
          receiverPhoneSnapshot: true,
          receiverAddressSnapshot: true,
          shippingTask: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!tradeOrder) {
    throw new Error("Trade order not found or out of scope.");
  }

  await assertTradeOrderNotInActiveRecycleBin(prisma, tradeOrder.id);

  if (tradeOrder.tradeStatus !== TradeOrderStatus.PENDING_REVIEW) {
    throw new Error("Only pending-review trade orders can be reviewed.");
  }

  const reviewedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.tradeOrder.update({
      where: { id: tradeOrder.id },
      data: {
        reviewStatus: input.reviewStatus,
        tradeStatus:
          input.reviewStatus === "APPROVED"
            ? TradeOrderStatus.APPROVED
            : TradeOrderStatus.REJECTED,
        reviewerId: actor.id,
        reviewedAt,
        rejectReason: input.reviewStatus === "REJECTED" ? input.rejectReason : null,
        updatedById: actor.id,
      },
    });

    for (const salesOrder of tradeOrder.salesOrders) {
      await tx.salesOrder.update({
        where: { id: salesOrder.id },
        data: {
          reviewStatus: input.reviewStatus,
          subOrderStatus:
            input.reviewStatus === "APPROVED"
              ? SalesSubOrderStatus.READY_FOR_FULFILLMENT
              : SalesSubOrderStatus.CANCELED,
          reviewerId: actor.id,
          reviewedAt,
          rejectReason: input.reviewStatus === "REJECTED" ? input.rejectReason : null,
          updatedById: actor.id,
        },
      });

      if (input.reviewStatus === "APPROVED") {
        const shippingTask = salesOrder.shippingTask
          ? await tx.shippingTask.update({
              where: { id: salesOrder.shippingTask.id },
              data: {
                tradeOrderId: tradeOrder.id,
                supplierId: salesOrder.supplierId,
                reportStatus: ShippingReportStatus.PENDING,
                shippingStatus: ShippingFulfillmentStatus.READY_TO_SHIP,
                codAmount: salesOrder.codAmount,
                insuranceRequired: salesOrder.insuranceRequired,
                insuranceAmount: salesOrder.insuranceAmount,
                receiverNameSnapshot: salesOrder.receiverNameSnapshot,
                receiverPhoneSnapshot: salesOrder.receiverPhoneSnapshot,
                receiverAddressSnapshot: salesOrder.receiverAddressSnapshot,
                status: ShippingTaskStatus.PROCESSING,
                content: "Auto-created after trade order approval.",
              },
              select: {
                id: true,
              },
            })
          : await tx.shippingTask.create({
              data: {
                tradeOrderId: tradeOrder.id,
                customerId: salesOrder.customerId,
                salesOrderId: salesOrder.id,
                supplierId: salesOrder.supplierId,
                reportStatus: ShippingReportStatus.PENDING,
                shippingStatus: ShippingFulfillmentStatus.READY_TO_SHIP,
                codAmount: salesOrder.codAmount,
                insuranceRequired: salesOrder.insuranceRequired,
                insuranceAmount: salesOrder.insuranceAmount,
                receiverNameSnapshot: salesOrder.receiverNameSnapshot,
                receiverPhoneSnapshot: salesOrder.receiverPhoneSnapshot,
                receiverAddressSnapshot: salesOrder.receiverAddressSnapshot,
                status: ShippingTaskStatus.PROCESSING,
                content: "Auto-created after trade order approval.",
              },
              select: {
                id: true,
              },
            });

        if (
          Number(salesOrder.finalAmount) > 0 ||
          Number(salesOrder.depositAmount) > 0 ||
          Number(salesOrder.codAmount) > 0
        ) {
          await syncSalesOrderPaymentArtifacts(tx, {
            tradeOrderId: tradeOrder.id,
            salesOrderId: salesOrder.id,
            customerId: salesOrder.customerId,
            ownerId: salesOrder.ownerId,
            paymentScheme: salesOrder.paymentScheme,
            finalAmount: salesOrder.finalAmount,
            depositAmount: salesOrder.depositAmount,
            actorId: actor.id,
            shippingTaskId: shippingTask.id,
          });
        }
      }

      await tx.operationLog.create({
        data: {
          actorId: actor.id,
          module: OperationModule.SALES_ORDER,
          action:
            input.reviewStatus === "APPROVED"
              ? "sales_order.approved_via_trade_order"
              : "sales_order.rejected_via_trade_order",
          targetType: OperationTargetType.SALES_ORDER,
          targetId: salesOrder.id,
          description: `${input.reviewStatus === "APPROVED" ? "Approved" : "Rejected"} supplier sub-order from trade order ${tradeOrder.tradeNo}`,
          afterData: {
            tradeOrderId: tradeOrder.id,
            reviewStatus: input.reviewStatus,
            rejectReason: input.reviewStatus === "REJECTED" ? input.rejectReason : null,
          },
        },
      });
    }

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action:
          input.reviewStatus === "APPROVED"
            ? "trade_order.approved"
            : "trade_order.rejected",
        targetType: OperationTargetType.TRADE_ORDER,
        targetId: tradeOrder.id,
        description: `${input.reviewStatus === "APPROVED" ? "Approved" : "Rejected"} trade order ${tradeOrder.tradeNo}`,
        beforeData: {
          reviewStatus: tradeOrder.reviewStatus,
          tradeStatus: tradeOrder.tradeStatus,
        },
        afterData: {
          reviewStatus: input.reviewStatus,
          tradeStatus:
            input.reviewStatus === "APPROVED"
              ? TradeOrderStatus.APPROVED
              : TradeOrderStatus.REJECTED,
          rejectReason: input.reviewStatus === "REJECTED" ? input.rejectReason : null,
        },
      },
    });
  });

  return {
    id: tradeOrder.id,
    customerId: tradeOrder.customerId,
    salesOrderIds: tradeOrder.salesOrders.map((salesOrder) => salesOrder.id),
  };
}
