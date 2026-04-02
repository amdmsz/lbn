import { redirect } from "next/navigation";
import { TradeOrdersWorkbench } from "@/components/trade-orders/trade-orders-workbench";
import {
  canAccessSalesOrderModule,
  canCreateSalesOrder,
  canReviewSalesOrder,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getTradeOrdersPageData } from "@/lib/trade-orders/queries";
import { reviewTradeOrderAction } from "./actions";

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
  const data = await getTradeOrdersPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return (
    <TradeOrdersWorkbench
      role={session.user.role}
      data={data}
      canCreate={canCreateSalesOrder(session.user.role)}
      canReview={canReviewSalesOrder(session.user.role)}
      reviewAction={reviewTradeOrderAction}
    />
  );
}
