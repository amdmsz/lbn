import {
  CollectionTaskStatus,
  ShippingFulfillmentStatus,
  ShippingReportStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export type TradeOrderExecutionSubOrderSummary = {
  id: string;
  subOrderNo: string;
  supplierId: string;
  supplierName: string;
  reportStatus: ShippingReportStatus | null;
  shippingStatus: ShippingFulfillmentStatus | null;
  trackingNumber: string | null;
  hasTrackingNumber: boolean;
  hasFileIssue: boolean;
  hasException: boolean;
  paymentRecordCount: number;
  hasPaymentRecord: boolean;
  openCollectionTaskCount: number;
};

export type TradeOrderExecutionSummary = {
  tradeOrderId: string;
  tradeNo: string;
  totalSubOrderCount: number;
  pendingReportSubOrderCount: number;
  pendingTrackingSubOrderCount: number;
  reportedSubOrderCount: number;
  shippedSubOrderCount: number;
  deliveredSubOrderCount: number;
  exceptionSubOrderCount: number;
  paymentRecordedSubOrderCount: number;
  openCollectionSubOrderCount: number;
  allShipped: boolean;
  salesOrders: TradeOrderExecutionSubOrderSummary[];
};

function isShippedStatus(status: ShippingFulfillmentStatus | null) {
  return (
    status === ShippingFulfillmentStatus.SHIPPED ||
    status === ShippingFulfillmentStatus.DELIVERED ||
    status === ShippingFulfillmentStatus.COMPLETED
  );
}

function isDeliveredStatus(status: ShippingFulfillmentStatus | null) {
  return (
    status === ShippingFulfillmentStatus.DELIVERED ||
    status === ShippingFulfillmentStatus.COMPLETED
  );
}

function hasTrackingNumber(trackingNumber: string | null) {
  return Boolean(trackingNumber?.trim());
}

function hasShippingException(input: {
  reportStatus: ShippingReportStatus | null;
  shippingStatus: ShippingFulfillmentStatus | null;
  trackingNumber: string | null;
  hasFileIssue: boolean;
}) {
  return (
    input.shippingStatus === ShippingFulfillmentStatus.CANCELED ||
    (input.reportStatus === ShippingReportStatus.PENDING &&
      hasTrackingNumber(input.trackingNumber)) ||
    (input.reportStatus === ShippingReportStatus.REPORTED && input.hasFileIssue)
  );
}

export async function getTradeOrderExecutionSummaryMap(tradeOrderIds: string[]) {
  const uniqueTradeOrderIds = [...new Set(tradeOrderIds.filter(Boolean))];

  if (uniqueTradeOrderIds.length === 0) {
    return new Map<string, TradeOrderExecutionSummary>();
  }

  const [tradeOrders, salesOrders, paymentRecordGroups, collectionTaskGroups] =
    await Promise.all([
      prisma.tradeOrder.findMany({
        where: {
          id: {
            in: uniqueTradeOrderIds,
          },
        },
        select: {
          id: true,
          tradeNo: true,
        },
      }),
      prisma.salesOrder.findMany({
        where: {
          tradeOrderId: {
            in: uniqueTradeOrderIds,
          },
        },
        orderBy: [{ supplierSequence: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          tradeOrderId: true,
          orderNo: true,
          subOrderNo: true,
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
          shippingTask: {
            select: {
              reportStatus: true,
              shippingStatus: true,
              trackingNumber: true,
              exportBatch: {
                select: {
                  fileUrl: true,
                },
              },
            },
          },
        },
      }),
      prisma.paymentRecord.groupBy({
        by: ["salesOrderId"],
        where: {
          tradeOrderId: {
            in: uniqueTradeOrderIds,
          },
          salesOrderId: {
            not: null,
          },
        },
        _count: {
          salesOrderId: true,
        },
      }),
      prisma.collectionTask.groupBy({
        by: ["salesOrderId"],
        where: {
          tradeOrderId: {
            in: uniqueTradeOrderIds,
          },
          salesOrderId: {
            not: null,
          },
          status: {
            in: [CollectionTaskStatus.PENDING, CollectionTaskStatus.IN_PROGRESS],
          },
        },
        _count: {
          salesOrderId: true,
        },
      }),
    ]);

  const tradeOrderMap = new Map(
    tradeOrders.map((tradeOrder) => [
      tradeOrder.id,
      {
        tradeOrderId: tradeOrder.id,
        tradeNo: tradeOrder.tradeNo,
        totalSubOrderCount: 0,
        pendingReportSubOrderCount: 0,
        pendingTrackingSubOrderCount: 0,
        reportedSubOrderCount: 0,
        shippedSubOrderCount: 0,
        deliveredSubOrderCount: 0,
        exceptionSubOrderCount: 0,
        paymentRecordedSubOrderCount: 0,
        openCollectionSubOrderCount: 0,
        allShipped: false,
        salesOrders: [] as TradeOrderExecutionSubOrderSummary[],
      },
    ]),
  );

  const paymentRecordCountBySalesOrderId = new Map<string, number>();
  for (const group of paymentRecordGroups) {
    if (group.salesOrderId) {
      paymentRecordCountBySalesOrderId.set(group.salesOrderId, group._count.salesOrderId);
    }
  }

  const openCollectionCountBySalesOrderId = new Map<string, number>();
  for (const group of collectionTaskGroups) {
    if (group.salesOrderId) {
      openCollectionCountBySalesOrderId.set(group.salesOrderId, group._count.salesOrderId);
    }
  }

  for (const salesOrder of salesOrders) {
    if (!salesOrder.tradeOrderId) {
      continue;
    }

    const tradeOrderSummary = tradeOrderMap.get(salesOrder.tradeOrderId);

    if (!tradeOrderSummary) {
      continue;
    }

    const paymentRecordCount = paymentRecordCountBySalesOrderId.get(salesOrder.id) ?? 0;
    const openCollectionTaskCount = openCollectionCountBySalesOrderId.get(salesOrder.id) ?? 0;
    const shippingStatus = salesOrder.shippingTask?.shippingStatus ?? null;
    const reportStatus = salesOrder.shippingTask?.reportStatus ?? null;
    const trackingNumber = salesOrder.shippingTask?.trackingNumber ?? null;
    const hasFileIssue =
      reportStatus === ShippingReportStatus.REPORTED &&
      salesOrder.shippingTask?.exportBatch !== null &&
      salesOrder.shippingTask?.exportBatch?.fileUrl === null;
    const hasException = hasShippingException({
      reportStatus,
      shippingStatus,
      trackingNumber,
      hasFileIssue,
    });

    tradeOrderSummary.salesOrders.push({
      id: salesOrder.id,
      subOrderNo: salesOrder.subOrderNo || salesOrder.orderNo,
      supplierId: salesOrder.supplier.id,
      supplierName: salesOrder.supplier.name,
      reportStatus,
      shippingStatus,
      trackingNumber,
      hasTrackingNumber: hasTrackingNumber(trackingNumber),
      hasFileIssue,
      hasException,
      paymentRecordCount,
      hasPaymentRecord: paymentRecordCount > 0,
      openCollectionTaskCount,
    });
  }

  for (const summary of tradeOrderMap.values()) {
    summary.totalSubOrderCount = summary.salesOrders.length;
    summary.pendingReportSubOrderCount = summary.salesOrders.filter(
      (salesOrder) =>
        salesOrder.reportStatus === ShippingReportStatus.PENDING &&
        !salesOrder.hasException &&
        !salesOrder.hasTrackingNumber,
    ).length;
    summary.pendingTrackingSubOrderCount = summary.salesOrders.filter(
      (salesOrder) =>
        salesOrder.reportStatus === ShippingReportStatus.REPORTED &&
        !salesOrder.hasException &&
        !salesOrder.hasTrackingNumber,
    ).length;
    summary.reportedSubOrderCount = summary.salesOrders.filter(
      (salesOrder) => salesOrder.reportStatus === ShippingReportStatus.REPORTED,
    ).length;
    summary.shippedSubOrderCount = summary.salesOrders.filter((salesOrder) =>
      isShippedStatus(salesOrder.shippingStatus),
    ).length;
    summary.deliveredSubOrderCount = summary.salesOrders.filter((salesOrder) =>
      isDeliveredStatus(salesOrder.shippingStatus),
    ).length;
    summary.exceptionSubOrderCount = summary.salesOrders.filter(
      (salesOrder) => salesOrder.hasException,
    ).length;
    summary.paymentRecordedSubOrderCount = summary.salesOrders.filter(
      (salesOrder) => salesOrder.hasPaymentRecord,
    ).length;
    summary.openCollectionSubOrderCount = summary.salesOrders.filter(
      (salesOrder) => salesOrder.openCollectionTaskCount > 0,
    ).length;
    summary.allShipped =
      summary.totalSubOrderCount > 0 &&
      summary.shippedSubOrderCount === summary.totalSubOrderCount;
  }

  return tradeOrderMap;
}
