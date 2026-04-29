import { FollowUpTaskStatus, TradeOrderStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { canAccessMobileApp, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  getLocalDayRange,
  getLocalMonthRange,
  toDecimalString,
} from "@/lib/mobile/api-contract";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessMobileApp(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const customerScope = getCustomerScope(
    session.user.role,
    session.user.id,
    session.user.teamId,
  );

  if (!customerScope) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const today = getLocalDayRange();
    const month = getLocalMonthRange();
    const scopedCustomerRelation = { is: customerScope };

    const [todayFollowUpCustomers, monthlyCalls, monthlySales] = await Promise.all([
      prisma.followUpTask.findMany({
        where: {
          customerId: { not: null },
          customer: scopedCustomerRelation,
          status: FollowUpTaskStatus.PENDING,
          dueAt: {
            lt: today.next,
          },
        },
        distinct: ["customerId"],
        select: {
          customerId: true,
        },
      }),
      prisma.callRecord.count({
        where: {
          customerId: { not: null },
          customer: scopedCustomerRelation,
          callTime: {
            gte: month.start,
            lt: month.next,
          },
        },
      }),
      prisma.tradeOrder.aggregate({
        where: {
          customer: scopedCustomerRelation,
          tradeStatus: TradeOrderStatus.APPROVED,
          createdAt: {
            gte: month.start,
            lt: month.next,
          },
        },
        _sum: {
          finalAmount: true,
        },
      }),
    ]);

    return NextResponse.json(
      {
        dashboard: {
          todayFollowUps: todayFollowUpCustomers.length,
          monthlyCalls,
          monthlySalesVolume: toDecimalString(monthlySales._sum.finalAmount),
        },
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load mobile dashboard API.", error);

    return NextResponse.json(
      { message: "移动端工作台统计加载失败。" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
