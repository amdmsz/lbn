import { redirect } from "next/navigation";
import { ShippingExecutionWorkbench } from "@/components/shipping/shipping-execution-workbench";
import {
  canAccessShippingModule,
  canManageShippingReporting,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getShippingOperationsPageData } from "@/lib/shipping/queries";
import {
  createShippingExportBatchAction,
  updateSalesOrderShippingAction,
} from "./actions";

export default async function ShippingPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessShippingModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getShippingOperationsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return (
    <ShippingExecutionWorkbench
      role={session.user.role}
      data={data}
      canManageReporting={canManageShippingReporting(session.user.role)}
      createExportBatchAction={createShippingExportBatchAction}
      updateShippingAction={updateSalesOrderShippingAction}
    />
  );
}
