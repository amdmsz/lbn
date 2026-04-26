import { redirect } from "next/navigation";
import { RecordingStorageSettingsWorkbench } from "@/components/settings/system-settings-workbench";
import { parseActionNotice } from "@/lib/action-notice";
import {
  canAccessSystemSettings,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getSystemSetting } from "@/lib/system-settings/queries";

export default async function SettingsRecordingStoragePage({
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
  const [storageSetting, uploadSetting] = await Promise.all([
    getSystemSetting("recording.storage", "active"),
    getSystemSetting("recording.upload", "active"),
  ]);

  return (
    <RecordingStorageSettingsWorkbench
      storageSetting={storageSetting}
      uploadSetting={uploadSetting}
      viewerRole={session.user.role}
      notice={parseActionNotice(resolvedSearchParams)}
    />
  );
}
