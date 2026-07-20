import type { RoleCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeShippingPackageSnapshots } from "@/lib/shipping/package-snapshots";

export type ShipperOrderDetailViewer = {
  id: string;
  role: RoleCode;
};

export async function getShipperOrderDetail(
  viewer: ShipperOrderDetailViewer,
  salesOrderId: string,
) {
  if (viewer.role !== "SHIPPER") {
    throw new Error("当前详情仅供发货员从履约工作台查看。");
  }

  const order = await prisma.salesOrder.findFirst({
    where: {
      id: salesOrderId,
      shippingTask: {
        isNot: null,
      },
    },
    select: {
      id: true,
      orderNo: true,
      subOrderNo: true,
      reviewStatus: true,
      paymentScheme: true,
      finalAmount: true,
      codAmount: true,
      insuranceRequired: true,
      insuranceAmount: true,
      receiverNameSnapshot: true,
      receiverPhoneSnapshot: true,
      receiverAddressSnapshot: true,
      remark: true,
      createdAt: true,
      owner: {
        select: {
          id: true,
          name: true,
          username: true,
        },
      },
      customer: {
        select: {
          name: true,
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
          remark: true,
        },
      },
      items: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          itemTypeSnapshot: true,
          titleSnapshot: true,
          exportDisplayNameSnapshot: true,
          productNameSnapshot: true,
          skuNameSnapshot: true,
          specSnapshot: true,
          unitSnapshot: true,
          qty: true,
          tradeOrderItem: {
            select: {
              remark: true,
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
          shippingPackages: true,
          reportedAt: true,
          shippedAt: true,
          remark: true,
          exportBatch: {
            select: {
              id: true,
              exportNo: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  return {
    ...order,
    finalAmount: order.finalAmount.toString(),
    codAmount: order.codAmount.toString(),
    insuranceAmount: order.insuranceAmount.toString(),
    shippingTask: order.shippingTask
      ? {
          ...order.shippingTask,
          shippingPackages: normalizeShippingPackageSnapshots(
            order.shippingTask.shippingPackages,
          ),
        }
      : null,
  };
}

export type ShipperOrderDetail = NonNullable<
  Awaited<ReturnType<typeof getShipperOrderDetail>>
>;
