import type { Prisma, RoleCode } from "@prisma/client";
import { getShippingTaskScope } from "@/lib/auth/access";
import { prisma } from "@/lib/db/prisma";
import { getReceiverPhoneTail } from "@/lib/logistics/metadata";
import { queryShippingLogisticsTrace } from "@/lib/logistics/provider";

export type LogisticsViewer = {
  id: string;
  role: RoleCode;
};

export async function getShippingTaskLogisticsTrace(
  viewer: LogisticsViewer,
  shippingTaskId: string,
) {
  const andClauses: Prisma.ShippingTaskWhereInput[] = [{ id: shippingTaskId }];

  if (viewer.role === "SUPERVISOR") {
    const user = await prisma.user.findUnique({
      where: { id: viewer.id },
      select: { teamId: true },
    });

    if (!user?.teamId) {
      return null;
    }

    andClauses.push({
      OR: [
        { salesOrder: { owner: { is: { teamId: user.teamId } } } },
        { salesOrder: { customer: { owner: { is: { teamId: user.teamId } } } } },
      ],
    });
  } else {
    const scope = getShippingTaskScope(viewer.role, viewer.id);

    if (!scope) {
      throw new Error("You do not have access to logistics trace.");
    }

    if (Object.keys(scope).length > 0) {
      andClauses.push(scope);
    }
  }

  const shippingTask = await prisma.shippingTask.findFirst({
    where: {
      AND: andClauses,
    },
    select: {
      id: true,
      carrier: true,
      shippingProvider: true,
      trackingNumber: true,
      shippingStatus: true,
      shippedAt: true,
      receiverPhoneSnapshot: true,
      salesOrder: {
        select: {
          id: true,
          orderNo: true,
          subOrderNo: true,
          receiverPhoneSnapshot: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      tradeOrder: {
        select: {
          id: true,
          tradeNo: true,
        },
      },
    },
  });

  if (!shippingTask) {
    return null;
  }

  const receiverPhoneTail = getReceiverPhoneTail(
    shippingTask.receiverPhoneSnapshot || shippingTask.salesOrder?.receiverPhoneSnapshot,
  );

  const trace = await queryShippingLogisticsTrace({
    shippingProvider: shippingTask.shippingProvider,
    carrier: shippingTask.carrier,
    trackingNumber: shippingTask.trackingNumber,
    receiverPhoneTail,
  });

  return {
    shippingTask: {
      id: shippingTask.id,
      shippingProvider: shippingTask.shippingProvider,
      trackingNumber: shippingTask.trackingNumber,
      shippingStatus: shippingTask.shippingStatus,
      shippedAt: shippingTask.shippedAt?.toISOString() ?? null,
      tradeOrder: shippingTask.tradeOrder,
      salesOrder: shippingTask.salesOrder
        ? {
            ...shippingTask.salesOrder,
            displayNo:
              shippingTask.salesOrder.subOrderNo || shippingTask.salesOrder.orderNo || shippingTask.id,
          }
        : null,
    },
    trace,
  };
}
