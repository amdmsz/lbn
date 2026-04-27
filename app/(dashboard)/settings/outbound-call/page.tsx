import { redirect } from "next/navigation";
import { OutboundCallSettingsWorkbench } from "@/components/settings/system-settings-workbench";
import { parseActionNotice } from "@/lib/action-notice";
import {
  canAccessSystemSettings,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getOutboundCallSeatBindingRows } from "@/lib/outbound-calls/seat-bindings";
import { getSystemSetting } from "@/lib/system-settings/queries";

export default async function SettingsOutboundCallPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessSystemSettings(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [providerSetting, seatBindings] = await Promise.all([
    getSystemSetting("outbound_call.provider", "active"),
    getOutboundCallSeatBindingRows(),
  ]);

  return (
    <OutboundCallSettingsWorkbench
      providerSetting={providerSetting}
      seatBindings={seatBindings}
      viewerRole={session.user.role}
      notice={parseActionNotice(resolvedSearchParams)}
    />
  );
}
