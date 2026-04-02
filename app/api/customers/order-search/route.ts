import { NextResponse } from "next/server";
import { canAccessSalesOrderModule } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { searchSalesOrderCustomers } from "@/lib/sales-orders/queries";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessSalesOrderModule(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyword = searchParams.get("q")?.trim() ?? "";

  const items = await searchSalesOrderCustomers(
    {
      id: session.user.id,
      role: session.user.role,
    },
    keyword,
  );

  return NextResponse.json({ items });
}
