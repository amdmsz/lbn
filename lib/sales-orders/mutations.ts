import {
  OperationModule,
  OperationTargetType,
  SalesOrderPaymentMode,
  SalesOrderPaymentScheme,
  SalesOrderReviewStatus,
  ShippingFulfillmentStatus,
  ShippingReportStatus,
  ShippingTaskStatus,
  type Prisma,
  type RoleCode,
} from "@prisma/client";
import { z } from "zod";
import {
  canCreateSalesOrder,
  canReviewSalesOrder,
} from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import {
  attachSalesOrderPaymentArtifactsToShippingTask,
  cancelSalesOrderCollectionTasks,
  syncSalesOrderPaymentArtifacts,
} from "@/lib/payments/mutations";
import {
  calculateSalesOrderPaymentBreakdown,
  calculateSalesOrderPricing,
  mapPaymentSchemeToLegacyPaymentMode,
  paymentSchemeRequiresDeposit,
} from "@/lib/sales-orders/workflow";
import { findProductDomainCurrentlyHiddenTargetIds } from "@/lib/products/recycle";

export type SalesOrderActor = {
  id: string;
  role: RoleCode;
};

const saveSalesOrderSchema = z.object({
  id: z.string().trim().default(""),
  customerId: z.string().trim().min(1, "Customer is required."),
  skuId: z.string().trim().min(1, "SKU is required."),
  qty: z.coerce.number().int().min(1, "Quantity must be at least 1."),
  dealPrice: z.coerce.number().min(0, "Deal price cannot be negative."),
  discountReason: z.string().trim().max(500).default(""),
  giftName: z.string().trim().max(120).default(""),
  giftQty: z.coerce.number().int().min(0).default(0),
  giftRemark: z.string().trim().max(500).default(""),
  paymentScheme: z.nativeEnum(SalesOrderPaymentScheme),
  depositAmount: z.coerce.number().min(0, "Deposit cannot be negative.").default(0),
  receiverName: z.string().trim().min(1, "Receiver name is required."),
  receiverPhone: z.string().trim().min(1, "Receiver phone is required.").max(30),
  receiverAddress: z.string().trim().min(1, "Receiver address is required.").max(500),
  insuranceRequired: z.coerce.boolean().default(false),
  insuranceAmount: z.coerce.number().min(0, "Insurance amount cannot be negative.").default(0),
  remark: z.string().trim().max(1000).default(""),
});

const reviewSalesOrderSchema = z
  .object({
    salesOrderId: z.string().trim().min(1, "Sales order is required."),
    reviewStatus: z.enum(["APPROVED", "REJECTED"]),
    rejectReason: z.string().trim().max(500).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.reviewStatus === "REJECTED" && !value.rejectReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rejectReason"],
        message: "Reject reason is required.",
      });
    }
  });

async function getActorTeamId(actor: SalesOrderActor) {
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
  actor: SalesOrderActor,
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
      : { id: "__missing_team_scope__" };
  }

  return { ownerId: actor.id };
}

function buildActorSalesOrderWhere(
  actor: SalesOrderActor,
  teamId: string | null,
): Prisma.SalesOrderWhereInput {
  if (actor.role === "ADMIN") {
    return {};
  }

  if (actor.role === "SUPERVISOR") {
    return teamId
      ? {
          OR: [
            { owner: { is: { teamId } } },
            { customer: { owner: { is: { teamId } } } },
          ],
        }
      : { id: "__missing_team_scope__" };
  }

  return {
    OR: [{ ownerId: actor.id }, { customer: { ownerId: actor.id } }],
  };
}

function createOrderNo() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes(),
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const suffix = Math.random().toString().slice(2, 6);
  return `SO${stamp}${suffix}`;
}

function assertDepositAmount(
  paymentScheme: SalesOrderPaymentScheme,
  depositAmount: number,
  finalAmount: number,
) {
  if (!paymentSchemeRequiresDeposit(paymentScheme)) {
    return;
  }

  if (depositAmount <= 0) {
    throw new Error("Deposit is required for the selected payment scheme.");
  }

  if (finalAmount > 0 && depositAmount >= finalAmount) {
    throw new Error("Deposit must be smaller than the final order amount.");
  }
}

function normalizeInsuranceAmount(input: {
  insuranceRequired: boolean;
  insuranceAmount: number;
  insuranceSupported: boolean;
  defaultInsuranceAmount: number;
}) {
  if (!input.insuranceRequired) {
    return 0;
  }

  if (!input.insuranceSupported) {
    throw new Error("The selected SKU does not support insurance.");
  }

  const normalized = input.insuranceAmount || input.defaultInsuranceAmount;
  if (normalized <= 0) {
    throw new Error("Insurance amount is required when insurance is enabled.");
  }

  return normalized;
}

export async function saveSalesOrder(
  actor: SalesOrderActor,
  rawInput: z.input<typeof saveSalesOrderSchema>,
) {
  if (!canCreateSalesOrder(actor.role)) {
    throw new Error("You do not have permission to create or resubmit sales orders.");
  }

  const input = saveSalesOrderSchema.parse(rawInput);
  const teamId = await getActorTeamId(actor);
  const customerWhere = buildActorCustomerWhere(actor, teamId);
  const salesOrderWhere = buildActorSalesOrderWhere(actor, teamId);
  const [hiddenProductSkuIds, hiddenProductIds, hiddenSupplierIds] = await Promise.all([
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT_SKU"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "PRODUCT"),
    findProductDomainCurrentlyHiddenTargetIds(prisma, "SUPPLIER"),
  ]);

  const [customer, sku, existing] = await Promise.all([
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
    prisma.productSku.findFirst({
      where: {
        id: input.skuId,
        enabled: true,
        ...(hiddenProductSkuIds.includes(input.skuId)
          ? {
              id: "__recycled_product_sku__",
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
    }),
    input.id
      ? prisma.salesOrder.findFirst({
          where: {
            id: input.id,
            ...salesOrderWhere,
          },
          select: {
            id: true,
            orderNo: true,
            tradeOrderId: true,
            ownerId: true,
            reviewStatus: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!customer) {
    throw new Error("Customer not found or out of scope.");
  }

  if (!sku) {
    throw new Error("SKU not found or unavailable.");
  }

  if (
    actor.role === "SALES" &&
    existing &&
    existing.reviewStatus !== SalesOrderReviewStatus.REJECTED
  ) {
    throw new Error("Sales can only edit rejected sales orders.");
  }

  if (existing?.tradeOrderId) {
    throw new Error(
      "Trade-order backed sales orders must be edited from the customer trade-order flow.",
    );
  }

  const pricing = calculateSalesOrderPricing({
    listUnitPrice: Number(sku.defaultUnitPrice),
    dealUnitPrice: input.dealPrice,
    qty: input.qty,
  });

  if (
    pricing.dealUnitPrice < pricing.listUnitPrice &&
    !input.discountReason.trim()
  ) {
    throw new Error("Discount reason is required when deal price is below list price.");
  }

  if (
    (input.paymentScheme === SalesOrderPaymentScheme.FULL_COD ||
      input.paymentScheme === SalesOrderPaymentScheme.DEPOSIT_PLUS_COD) &&
    !sku.codSupported
  ) {
    throw new Error("The selected SKU does not support COD.");
  }

  assertDepositAmount(
    input.paymentScheme,
    input.depositAmount,
    pricing.finalAmount,
  );

  const insuranceAmount = normalizeInsuranceAmount({
    insuranceRequired: input.insuranceRequired,
    insuranceAmount: input.insuranceAmount,
    insuranceSupported: sku.insuranceSupported,
    defaultInsuranceAmount: Number(sku.defaultInsuranceAmount),
  });

  const payment = calculateSalesOrderPaymentBreakdown({
    paymentScheme: input.paymentScheme,
    finalAmount: pricing.finalAmount,
    depositAmount: input.depositAmount,
  });
  const paymentMode = mapPaymentSchemeToLegacyPaymentMode(input.paymentScheme);
  const ownerId = customer.ownerId ?? (actor.role === "SALES" ? actor.id : null);

  const result = await prisma.$transaction(async (tx) => {
    const order = existing
      ? await tx.salesOrder.update({
          where: { id: existing.id },
          data: {
            ownerId,
            supplierId: sku.product.supplier.id,
            reviewStatus: SalesOrderReviewStatus.PENDING_REVIEW,
            paymentScheme: input.paymentScheme,
            paymentMode: paymentMode as SalesOrderPaymentMode,
            listAmount: pricing.listAmount,
            dealAmount: pricing.dealAmount,
            goodsAmount: pricing.dealAmount,
            discountAmount: pricing.discountAmount,
            finalAmount: pricing.finalAmount,
            depositAmount: payment.depositAmount,
            collectedAmount: payment.collectedAmount,
            paidAmount: payment.collectedAmount,
            remainingAmount: payment.remainingAmount,
            codAmount: payment.codAmount,
            insuranceRequired: input.insuranceRequired,
            insuranceAmount,
            discountReason:
              pricing.dealUnitPrice < pricing.listUnitPrice
                ? input.discountReason || null
                : null,
            receiverNameSnapshot: input.receiverName,
            receiverPhoneSnapshot: input.receiverPhone,
            receiverAddressSnapshot: input.receiverAddress,
            reviewerId: null,
            reviewedAt: null,
            rejectReason: null,
            remark: input.remark || null,
            updatedById: actor.id,
          },
          select: {
            id: true,
            orderNo: true,
          },
        })
      : await tx.salesOrder.create({
          data: {
            orderNo: createOrderNo(),
            customerId: customer.id,
            ownerId,
            supplierId: sku.product.supplier.id,
            reviewStatus: SalesOrderReviewStatus.PENDING_REVIEW,
            paymentScheme: input.paymentScheme,
            paymentMode: paymentMode as SalesOrderPaymentMode,
            listAmount: pricing.listAmount,
            dealAmount: pricing.dealAmount,
            goodsAmount: pricing.dealAmount,
            discountAmount: pricing.discountAmount,
            finalAmount: pricing.finalAmount,
            depositAmount: payment.depositAmount,
            collectedAmount: payment.collectedAmount,
            paidAmount: payment.collectedAmount,
            remainingAmount: payment.remainingAmount,
            codAmount: payment.codAmount,
            insuranceRequired: input.insuranceRequired,
            insuranceAmount,
            discountReason:
              pricing.dealUnitPrice < pricing.listUnitPrice
                ? input.discountReason || null
                : null,
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
          },
        });

    await tx.salesOrderItem.deleteMany({
      where: { salesOrderId: order.id },
    });

    await tx.salesOrderGiftItem.deleteMany({
      where: { salesOrderId: order.id },
    });

    await tx.salesOrderItem.create({
      data: {
        salesOrderId: order.id,
        productId: sku.product.id,
        skuId: sku.id,
        productNameSnapshot: sku.product.name,
        skuNameSnapshot: sku.skuName,
        specSnapshot: sku.skuName,
        unitSnapshot: "",
        listPriceSnapshot: sku.defaultUnitPrice,
        dealPriceSnapshot: pricing.dealUnitPrice,
        qty: input.qty,
        subtotal: pricing.dealAmount,
      },
    });

    if (input.giftName && input.giftQty > 0) {
      await tx.salesOrderGiftItem.create({
        data: {
          salesOrderId: order.id,
          giftName: input.giftName,
          qty: input.giftQty,
          remark: input.giftRemark || null,
        },
      });
    }

    await syncSalesOrderPaymentArtifacts(tx, {
      salesOrderId: order.id,
      customerId: customer.id,
      ownerId,
      paymentScheme: input.paymentScheme,
      finalAmount: pricing.finalAmount,
      depositAmount: payment.depositAmount,
      actorId: actor.id,
    });

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action: existing ? "sales_order.resubmitted" : "sales_order.created",
        targetType: OperationTargetType.SALES_ORDER,
        targetId: order.id,
        description: `${existing ? "Resubmitted" : "Created"} sales order ${order.orderNo}`,
        beforeData: existing ?? undefined,
        afterData: {
          customerId: customer.id,
          supplierId: sku.product.supplier.id,
          supplierName: sku.product.supplier.name,
          skuId: sku.id,
          qty: input.qty,
          listUnitPrice: pricing.listUnitPrice,
          dealUnitPrice: pricing.dealUnitPrice,
          listAmount: pricing.listAmount,
          dealAmount: pricing.dealAmount,
          discountAmount: pricing.discountAmount,
          paymentScheme: input.paymentScheme,
          depositAmount: payment.depositAmount,
          collectedAmount: payment.collectedAmount,
          remainingAmount: payment.remainingAmount,
          codAmount: payment.codAmount,
          insuranceRequired: input.insuranceRequired,
          insuranceAmount,
          reviewStatus: SalesOrderReviewStatus.PENDING_REVIEW,
        },
      },
    });

    return order;
  });

  return {
    id: result.id,
    orderNo: result.orderNo,
    customerId: customer.id,
  };
}

export async function reviewSalesOrder(
  actor: SalesOrderActor,
  rawInput: z.input<typeof reviewSalesOrderSchema>,
) {
  if (!canReviewSalesOrder(actor.role)) {
    throw new Error("You do not have permission to review sales orders.");
  }

  const input = reviewSalesOrderSchema.parse(rawInput);
  const teamId = await getActorTeamId(actor);
  const where = buildActorSalesOrderWhere(actor, teamId);

  const existing = await prisma.salesOrder.findFirst({
    where: {
      id: input.salesOrderId,
      ...where,
    },
    select: {
      id: true,
      orderNo: true,
      tradeOrderId: true,
      customerId: true,
      supplierId: true,
      reviewStatus: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
      shippingTask: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Sales order not found or out of scope.");
  }

  if (existing.tradeOrderId) {
    throw new Error(
      "Trade-order backed sales orders must be reviewed from the trade-order review flow.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.salesOrder.update({
      where: { id: existing.id },
      data: {
        reviewStatus: input.reviewStatus,
        reviewerId: actor.id,
        reviewedAt: new Date(),
        rejectReason:
          input.reviewStatus === "REJECTED" ? input.rejectReason : null,
        updatedById: actor.id,
      },
    });

    if (input.reviewStatus === "APPROVED") {
      let shippingTaskId = existing.shippingTask?.id ?? null;

      if (existing.shippingTask) {
        const updatedTask = await tx.shippingTask.update({
          where: { id: existing.shippingTask.id },
          data: {
            supplierId: existing.supplierId,
            reportStatus: ShippingReportStatus.PENDING,
            shippingStatus: ShippingFulfillmentStatus.READY_TO_SHIP,
            codAmount: existing.codAmount,
            insuranceRequired: existing.insuranceRequired,
            insuranceAmount: existing.insuranceAmount,
            status: ShippingTaskStatus.PROCESSING,
          },
          select: {
            id: true,
          },
        });

        shippingTaskId = updatedTask.id;
      } else {
        const createdTask = await tx.shippingTask.create({
          data: {
            customerId: existing.customerId,
            salesOrderId: existing.id,
            supplierId: existing.supplierId,
            reportStatus: ShippingReportStatus.PENDING,
            shippingStatus: ShippingFulfillmentStatus.READY_TO_SHIP,
            codAmount: existing.codAmount,
            insuranceRequired: existing.insuranceRequired,
            insuranceAmount: existing.insuranceAmount,
            status: ShippingTaskStatus.PROCESSING,
            content: "Auto-created after sales order approval.",
          },
          select: {
            id: true,
          },
        });

        shippingTaskId = createdTask.id;
      }

      if (shippingTaskId) {
        await attachSalesOrderPaymentArtifactsToShippingTask(
          tx,
          existing.id,
          shippingTaskId,
        );
      }
    } else {
      await cancelSalesOrderCollectionTasks(tx, existing.id);
    }

    await tx.operationLog.create({
      data: {
        actorId: actor.id,
        module: OperationModule.SALES_ORDER,
        action:
          input.reviewStatus === "APPROVED"
            ? "sales_order.approved"
            : "sales_order.rejected",
        targetType: OperationTargetType.SALES_ORDER,
        targetId: existing.id,
        description: `${input.reviewStatus === "APPROVED" ? "Approved" : "Rejected"} sales order ${existing.orderNo}`,
        beforeData: {
          reviewStatus: existing.reviewStatus,
        },
        afterData: {
          reviewStatus: input.reviewStatus,
          rejectReason: input.reviewStatus === "REJECTED" ? input.rejectReason : null,
        },
      },
    });
  });

  return {
    id: existing.id,
    customerId: existing.customerId,
  };
}
