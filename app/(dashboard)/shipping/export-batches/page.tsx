import { redirect } from "next/navigation";
import {
  canAccessShippingExportBatchModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { buildOrderFulfillmentHrefFromSearchParams } from "@/lib/fulfillment/navigation";

export default async function ShippingExportBatchesPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessShippingExportBatchModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  redirect(buildOrderFulfillmentHrefFromSearchParams("batches", resolvedSearchParams));
}
