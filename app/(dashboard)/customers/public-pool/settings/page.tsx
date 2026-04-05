import { redirect } from "next/navigation";
import { CustomerPublicPoolSettingsWorkbench } from "@/components/customers/public-pool-settings-workbench";
import {
  canAccessCustomerPublicPoolSettings,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCustomerPublicPoolSettingsPageData } from "@/lib/customers/public-pool-settings";

export default async function CustomerPublicPoolSettingsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessCustomerPublicPoolSettings(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getCustomerPublicPoolSettingsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return <CustomerPublicPoolSettingsWorkbench data={data} />;
}
