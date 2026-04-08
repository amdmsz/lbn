import { redirect } from "next/navigation";
import { CallResultSettingsWorkbench } from "@/components/settings/call-result-settings-workbench";
import {
  canAccessSettingsModule,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCallResultSettingsPageData } from "@/lib/calls/settings";

export default async function SettingsCallResultsPage({
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
  const data = await getCallResultSettingsPageData(
    {
      id: session.user.id,
      role: session.user.role,
    },
    resolvedSearchParams,
  );

  return <CallResultSettingsWorkbench data={data} />;
}
