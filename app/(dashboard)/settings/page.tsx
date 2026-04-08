import { redirect } from "next/navigation";
import { SettingsControlCenter } from "@/components/settings/settings-control-center";
import { getMergedCallResultDefinitions } from "@/lib/calls/settings";
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
  const viewer = {
    id: session.user.id,
    role: session.user.role,
  };
  const [masterData, callResultDefinitions] = await Promise.all([
    getMasterDataOverviewData(viewer, resolvedSearchParams),
    getMergedCallResultDefinitions(),
  ]);

  return (
    <SettingsControlCenter
      data={{
        ...masterData,
        callResultsSummary: {
          totalCount: callResultDefinitions.length,
          enabledCount: callResultDefinitions.filter((item) => item.isEnabled).length,
          customCount: callResultDefinitions.filter((item) => !item.isSystem).length,
        },
      }}
    />
  );
}
