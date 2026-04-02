import { redirect } from "next/navigation";
import { SettingsControlCenter } from "@/components/settings/settings-control-center";
import {
  canAccessSettingsModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getMasterDataOverviewData } from "@/lib/master-data/queries";

export default async function SettingsPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessSettingsModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const data = await getMasterDataOverviewData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return <SettingsControlCenter data={data} />;
}
