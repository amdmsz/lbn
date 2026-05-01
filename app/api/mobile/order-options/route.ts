import { type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { canCreateSalesOrder, getCustomerScope } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { salesOrderPaymentSchemeOptions } from "@/lib/fulfillment/metadata";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

const mobileOrderCustomerSelect = {
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
} satisfies Prisma.CustomerSelect;

type MobileOrderCustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof mobileOrderCustomerSelect;
}>;

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canCreateSalesOrder(session.user.role)) {
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

  const customerId = new URL(request.url).searchParams.get("customerId")?.trim() ?? "";

  if (!customerId) {
    return NextResponse.json(
      { message: "缺少 customerId。" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  try {
    const customer = await prisma.customer.findFirst({
      where: {
        AND: [{ id: customerId }, customerScope],
      },
      select: mobileOrderCustomerSelect,
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404, headers: noStoreHeaders },
      );
    }

    return NextResponse.json(
      {
        customer: mapMobileOrderCustomer(customer),
        paymentSchemeOptions: salesOrderPaymentSchemeOptions,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to load mobile order options API.", error);

    return NextResponse.json(
      { message: "移动端下单参数加载失败。" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}

function mapMobileOrderCustomer(customer: MobileOrderCustomerRecord) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    owner: customer.owner
      ? {
          id: customer.owner.id,
          name: customer.owner.name,
          username: customer.owner.username,
        }
      : null,
  };
}
