import { NextResponse } from "next/server";
import { canAccessCustomerModule } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCustomerDetailOrdersData } from "@/lib/customers/queries";
import {
  getSalesOrderPaymentModeLabel,
  getSalesOrderReviewStatusLabel,
} from "@/lib/fulfillment/metadata";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessCustomerModule(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const customerId = id?.trim();

  if (!customerId) {
    return NextResponse.json({ message: "Invalid customer id" }, { status: 400 });
  }

  const orders = await getCustomerDetailOrdersData(
    {
      id: session.user.id,
      role: session.user.role,
      teamId: session.user.teamId,
    },
    customerId,
  );

  if (!orders) {
    return NextResponse.json({ message: "Customer not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      orders: orders.map((order) => ({
        id: order.id,
        orderNo: order.orderNo,
        subOrderNo: order.subOrderNo,
        tradeOrderId: order.tradeOrderId,
        tradeNo: order.tradeOrder?.tradeNo ?? null,
        reviewStatusLabel: getSalesOrderReviewStatusLabel(order.reviewStatus),
        paymentModeLabel: getSalesOrderPaymentModeLabel(order.paymentMode),
        finalAmount: order.finalAmount.toString(),
        supplierName: order.supplier?.name ?? null,
        createdAt: order.createdAt.toISOString(),
        shippingStatus: order.shippingTask?.shippingStatus ?? null,
        trackingNumber: order.shippingTask?.trackingNumber ?? null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
