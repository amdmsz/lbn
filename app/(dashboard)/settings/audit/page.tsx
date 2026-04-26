import { OperationModule } from "@prisma/client";
import { redirect } from "next/navigation";
import { SettingsAuditWorkbench } from "@/components/settings/system-settings-workbench";
import { parseActionNotice } from "@/lib/action-notice";
import {
  canAccessSystemSettings,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  getSystemSetting,
  getSystemSettingsOverview,
} from "@/lib/system-settings/queries";

export default async function SettingsAuditPage({
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
  const [systemLogCount, latestLogs, runtimeSetting, settingsOverview] = await Promise.all([
    prisma.operationLog.count({
      where: {
        module: OperationModule.SYSTEM,
      },
    }),
    prisma.operationLog.findMany({
      where: {
        module: OperationModule.SYSTEM,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
      select: {
        id: true,
        action: true,
        description: true,
        createdAt: true,
        targetId: true,
        actor: {
          select: {
            name: true,
            username: true,
          },
        },
      },
    }),
    getSystemSetting("runtime.worker", "active"),
    getSystemSettingsOverview(),
  ]);
  const configuredCount = settingsOverview.filter(
    (item) => item.source === "database",
  ).length;

  return (
    <SettingsAuditWorkbench
      runtimeSetting={runtimeSetting}
      logs={latestLogs}
      systemLogCount={systemLogCount}
      configuredCount={configuredCount}
      viewerRole={session.user.role}
      notice={parseActionNotice(resolvedSearchParams)}
    />
  );
}
