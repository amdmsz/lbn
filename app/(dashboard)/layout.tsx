import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getDefaultRouteForRole } from "@/lib/auth/access";
import { auth } from "@/lib/auth/session";
import { getNavigationGroupsForRole } from "@/lib/navigation";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <DashboardShell
      navigationGroups={getNavigationGroupsForRole(
        session.user.role,
        session.user.permissionCodes,
      )}
      currentUser={{
        name: session.user.name ?? session.user.username,
        username: session.user.username,
        avatarPath: session.user.avatarPath,
        role: session.user.role,
        roleName: session.user.roleName,
        homePath: getDefaultRouteForRole(session.user.role),
      }}
    >
      {children}
    </DashboardShell>
  );
}
