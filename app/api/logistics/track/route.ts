import { NextResponse } from "next/server";
import {
  canAccessSalesOrderModule,
  canAccessShippingModule,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getShippingTaskLogisticsTrace } from "@/lib/logistics/queries";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (
    !canAccessSalesOrderModule(session.user.role) &&
    !canAccessShippingModule(session.user.role)
  ) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const shippingTaskId = searchParams.get("shippingTaskId")?.trim();

  if (!shippingTaskId) {
    return NextResponse.json({ message: "Missing shippingTaskId" }, { status: 400 });
  }

  const result = await getShippingTaskLogisticsTrace(
    {
      id: session.user.id,
      role: session.user.role,
    },
    shippingTaskId,
  );

  if (!result) {
    console.warn("[logistics-track] shipping task not found or outside scope", {
      shippingTaskId,
      userId: session.user.id,
      role: session.user.role,
    });
    return NextResponse.json({ message: "Shipping task not found" }, { status: 404 });
  }

  if (result.trace.mode !== "remote") {
    console.warn("[logistics-track] trace query did not return remote checkpoints", {
      shippingTaskId,
      traceMode: result.trace.mode,
      shippingProvider: result.trace.shippingProvider,
      carrierCode: result.trace.carrierCode,
      trackingNumber: result.trace.trackingNumber,
      message: result.trace.message,
    });
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
