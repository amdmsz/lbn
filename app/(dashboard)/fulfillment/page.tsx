import { redirect } from "next/navigation";
import { OrderFulfillmentCenter } from "@/components/fulfillment/order-fulfillment-center";
import {
  canAccessOrderFulfillmentCenter,
  canAccessSalesOrderModule,
  canAccessShippingModule,
  canCreateSalesOrder,
  canManageShippingReporting,
  canReviewSalesOrder,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  buildOrderFulfillmentHref,
  resolveOrderFulfillmentView,
} from "@/lib/fulfillment/navigation";
import {
  getShippingExportBatchesPageData,
  getShippingOperationsPageData,
} from "@/lib/shipping/queries";
import { getTradeOrdersPageData } from "@/lib/trade-orders/queries";
import {
  moveTradeOrderToRecycleBinAction,
  reviewTradeOrderAction,
} from "../orders/actions";
import {
  bulkUpdateSalesOrderShippingAction,
  createShippingExportBatchAction,
  regenerateShippingExportBatchFileAction,
  updateSalesOrderShippingAction,
} from "../shipping/actions";

export default async function FulfillmentPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessOrderFulfillmentCenter(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedTab =
    typeof resolvedSearchParams?.tab === "string"
      ? resolvedSearchParams.tab
      : Array.isArray(resolvedSearchParams?.tab)
        ? resolvedSearchParams.tab[0]
        : undefined;
  const activeView = resolveOrderFulfillmentView(session.user.role, requestedTab);

  if (requestedTab !== activeView) {
    redirect(buildOrderFulfillmentHref(activeView));
  }

  const viewer = {
    id: session.user.id,
    role: session.user.role,
  } as const;

  const tradeOrdersData =
    activeView === "trade-orders" && canAccessSalesOrderModule(session.user.role)
      ? await getTradeOrdersPageData(viewer, resolvedSearchParams)
      : null;

  const shippingData =
    activeView === "shipping" && canAccessShippingModule(session.user.role)
      ? await getShippingOperationsPageData(viewer, resolvedSearchParams)
      : null;

  const batchData =
    activeView === "batches" && canAccessShippingModule(session.user.role)
      ? await getShippingExportBatchesPageData(viewer, resolvedSearchParams)
      : null;

  return (
    <OrderFulfillmentCenter
      role={session.user.role}
      activeView={activeView}
      tradeOrdersData={tradeOrdersData}
      shippingData={shippingData}
      batchData={batchData}
      canCreateTradeOrder={canCreateSalesOrder(session.user.role)}
      canReviewTradeOrder={canReviewSalesOrder(session.user.role)}
      canManageShippingReporting={canManageShippingReporting(session.user.role)}
      reviewTradeOrderAction={reviewTradeOrderAction}
      moveTradeOrderToRecycleBinAction={moveTradeOrderToRecycleBinAction}
      createShippingExportBatchAction={createShippingExportBatchAction}
      updateShippingAction={updateSalesOrderShippingAction}
      bulkUpdateShippingAction={bulkUpdateSalesOrderShippingAction}
      regenerateShippingExportBatchFileAction={regenerateShippingExportBatchFileAction}
    />
  );
}
