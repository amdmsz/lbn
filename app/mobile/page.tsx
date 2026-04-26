import { redirect } from "next/navigation";
import { MobileAppShell } from "@/components/mobile/mobile-app-shell";
import {
  canAccessCallRecordingModule,
  canAccessCustomerModule,
  canCreateCallRecord,
  getDefaultRouteForRole,
} from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import {
  getCustomerCenterData,
  getCustomerOperatingDashboardData,
} from "@/lib/customers/queries";
import { prisma } from "@/lib/db/prisma";
import { getNavigationGroupsForRole } from "@/lib/navigation";

export const dynamic = "force-dynamic";

export default async function MobilePage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/mobile");
  }

  if (!canAccessCustomerModule(session.user.role)) {
    redirect(getDefaultRouteForRole(session.user.role));
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewer = {
    id: session.user.id,
    role: session.user.role,
    teamId: session.user.teamId,
  };
  const navigationGroups = getNavigationGroupsForRole(
    session.user.role,
    session.user.permissionCodes,
  );
  const [data, dashboardData, profile] = await Promise.all([
    getCustomerCenterData(
      viewer,
      {
        ...resolvedSearchParams,
        pageSize: "20",
      },
    ),
    getCustomerOperatingDashboardData(viewer, resolvedSearchParams),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        team: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return (
    <MobileAppShell
      data={data}
      currentUser={{
        name: session.user.name ?? session.user.username,
        username: session.user.username,
        role: session.user.role,
        roleName: session.user.roleName,
        teamName: profile?.team?.name ?? null,
      }}
      dashboardData={dashboardData}
      navigationGroups={navigationGroups}
      canCreateCallRecord={canCreateCallRecord(session.user.role)}
      canAccessCallRecordings={canAccessCallRecordingModule(session.user.role)}
    />
  );
}
