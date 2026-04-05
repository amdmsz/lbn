import { redirect } from "next/navigation";
import { CustomerPublicPoolReportsWorkbench } from "@/components/customers/public-pool-reports-workbench";
import {
  canAccessCustomerPublicPoolReports,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCustomerPublicPoolReportsData } from "@/lib/customers/public-pool-reports";

export default async function CustomerPublicPoolReportsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerPublicPoolReports(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getCustomerPublicPoolReportsData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return <CustomerPublicPoolReportsWorkbench data={data} />;
}
