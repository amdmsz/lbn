import { redirect } from "next/navigation";
import { CustomerCenterWorkbench } from "@/components/customers/customer-center-workbench";
import {
  canAccessCustomerModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCustomerCenterData } from "@/lib/customers/queries";

export default async function CustomersPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getCustomerCenterData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return <CustomerCenterWorkbench role={session.user.role} data={data} />;
}
