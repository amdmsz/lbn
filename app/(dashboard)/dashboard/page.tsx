import { redirect } from "next/navigation";
import { DashboardWorkbench } from "@/components/dashboard/dashboard-workbench";
import { ManagementDashboardWorkbench } from "@/components/dashboard/management-dashboard-workbench";
import { getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getCustomerOperatingDashboardData } from "@/lib/customers/queries";
import { getNavigationGroupsForRole } from "@/lib/navigation";
import { getDashboardData } from "@/lib/reports/queries";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = session.user.role;

  if (role === "SALES") {
    redirect("/customers");
  }

  const navigationGroups = getNavigationGroupsForRole(
    role,
    session.user.permissionCodes,
  );

  if (navigationGroups.length === 0) {
    redirect(getDefaultRouteForRole(role));
  }

  if (role === "ADMIN" || role === "SUPERVISOR") {
    const data = await getCustomerOperatingDashboardData({
      id: session.user.id,
      role,
      teamId: session.user.teamId,
    });

    return <ManagementDashboardWorkbench role={role} data={data} />;
  }

  const data = await getDashboardData({
    id: session.user.id,
    role,
    teamId: session.user.teamId,
    permissionCodes: session.user.permissionCodes,
  });

  return (
    <DashboardWorkbench
      role={role}
      permissionCodes={session.user.permissionCodes}
      navigationGroups={navigationGroups}
      data={data}
    />
  );
}
