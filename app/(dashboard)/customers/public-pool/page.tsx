import { redirect } from "next/navigation";
import { CustomerPublicPoolWorkbench } from "@/components/customers/public-pool-workbench";
import {
  canAccessCustomerPublicPool,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCustomerPublicPoolData } from "@/lib/customers/public-pool";

export default async function CustomerPublicPoolPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerPublicPool(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getCustomerPublicPoolData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return <CustomerPublicPoolWorkbench data={data} />;
}
