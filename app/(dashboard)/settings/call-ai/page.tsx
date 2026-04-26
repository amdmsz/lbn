import { redirect } from "next/navigation";
import { CallAiSettingsWorkbench } from "@/components/settings/system-settings-workbench";
import { parseActionNotice } from "@/lib/action-notice";
import {
  canAccessSystemSettings,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getSystemSetting } from "@/lib/system-settings/queries";

export default async function SettingsCallAiPage({
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
  const [asrSetting, llmSetting, diarizationSetting] = await Promise.all([
    getSystemSetting("call_ai.asr", "active"),
    getSystemSetting("call_ai.llm", "active"),
    getSystemSetting("call_ai.diarization", "active"),
  ]);

  return (
    <CallAiSettingsWorkbench
      asrSetting={asrSetting}
      llmSetting={llmSetting}
      diarizationSetting={diarizationSetting}
      viewerRole={session.user.role}
      notice={parseActionNotice(resolvedSearchParams)}
    />
  );
}
