import { NextResponse } from "next/server";
import { canCreateSalesOrder } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { searchVisibleSkuOptions } from "@/lib/sales-orders/queries";

export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canCreateSalesOrder(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const keyword = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (!keyword) {
    return NextResponse.json({ items: [] }, { headers: noStoreHeaders });
  }

  try {
    const items = await searchVisibleSkuOptions(
      {
        id: session.user.id,
        role: session.user.role,
      },
      keyword,
      12,
    );

    return NextResponse.json(
      {
        items: items.map((item) => ({
          id: item.id,
          skuName: item.skuName,
          defaultUnitPrice: item.defaultUnitPrice,
          codSupported: item.codSupported,
          insuranceSupported: item.insuranceSupported,
          defaultInsuranceAmount: item.defaultInsuranceAmount,
          product: {
            id: item.product.id,
            name: item.product.name,
          },
        })),
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Failed to search mobile SKU options API.", error);

    return NextResponse.json(
      { message: "移动端商品搜索失败。" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
