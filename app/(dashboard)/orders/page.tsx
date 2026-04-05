import { redirect } from "next/navigation";
import {
  canAccessSalesOrderModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { buildOrderFulfillmentHrefFromSearchParams } from "@/lib/fulfillment/navigation";

export default async function OrdersPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessSalesOrderModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  redirect(buildOrderFulfillmentHrefFromSearchParams("trade-orders", resolvedSearchParams));
}
