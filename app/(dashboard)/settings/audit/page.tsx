import { OperationModule, type Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { SettingsAuditWorkbench } from "@/components/settings/system-settings-workbench";
import { getParamValue, parseActionNotice } from "@/lib/action-notice";
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

const OPERATION_LOG_PAGE_SIZE = 100;
const OPERATION_MODULE_VALUES = Object.values(OperationModule) as OperationModule[];

function parseModuleParam(raw: string): OperationModule | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return (OPERATION_MODULE_VALUES as string[]).includes(upper)
    ? (upper as OperationModule)
    : null;
}

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

  const moduleRaw = getParamValue(resolvedSearchParams?.module).trim();
  const actorRaw = getParamValue(resolvedSearchParams?.actor).trim();
  const actionRaw = getParamValue(resolvedSearchParams?.action).trim();

  const moduleFilter = parseModuleParam(moduleRaw);

  const operationLogWhere: Prisma.OperationLogWhereInput = {};
  if (moduleFilter) {
    operationLogWhere.module = moduleFilter;
  }
  if (actionRaw) {
    operationLogWhere.action = { contains: actionRaw };
  }
  if (actorRaw) {
    operationLogWhere.actor = {
      OR: [
        { name: { contains: actorRaw } },
        { username: { contains: actorRaw } },
      ],
    };
  }

  const [
    systemLogCount,
    latestLogs,
    runtimeSetting,
    settingsOverview,
    operationLogs,
    operationLogTotal,
  ] = await Promise.all([
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
    prisma.operationLog.findMany({
      where: operationLogWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: OPERATION_LOG_PAGE_SIZE,
      select: {
        id: true,
        module: true,
        action: true,
        targetType: true,
        targetId: true,
        description: true,
        beforeData: true,
        afterData: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    }),
    prisma.operationLog.count({ where: operationLogWhere }),
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
      operationLogs={operationLogs}
      operationLogTotal={operationLogTotal}
      operationLogPageSize={OPERATION_LOG_PAGE_SIZE}
      operationLogFilters={{
        module: moduleFilter ?? "",
        actor: actorRaw,
        action: actionRaw,
      }}
      operationModules={OPERATION_MODULE_VALUES}
    />
  );
}
