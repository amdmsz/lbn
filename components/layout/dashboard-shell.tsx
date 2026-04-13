"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import type { RoleCode } from "@prisma/client";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { NavigationGroup } from "@/lib/navigation";

const DESKTOP_SIDEBAR_WIDTH = "280px";
const DESKTOP_SIDEBAR_RAIL_WIDTH = "80px";

export function DashboardShell({
  navigationGroups,
  currentUser,
  children,
}: Readonly<{
  navigationGroups: NavigationGroup[];
  currentUser: {
    name: string;
    username: string;
    avatarPath: string | null;
    role: RoleCode;
    roleName: string;
    teamName: string | null;
    homePath: string;
  };
  children: ReactNode;
}>) {
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  return (
    <div
      className="relative min-h-screen bg-transparent"
      style={
        {
          "--dashboard-sidebar-width": desktopSidebarCollapsed
            ? DESKTOP_SIDEBAR_RAIL_WIDTH
            : DESKTOP_SIDEBAR_WIDTH,
        } as CSSProperties
      }
      data-dashboard-sidebar-collapsed={desktopSidebarCollapsed ? "true" : "false"}
    >
      <SidebarNav
        groups={navigationGroups}
        currentUser={currentUser}
        desktopCollapsed={desktopSidebarCollapsed}
        onDesktopToggle={() => setDesktopSidebarCollapsed((current) => !current)}
      />

      <main className="min-w-0 transition-[padding-left] duration-200 md:pl-[var(--dashboard-sidebar-width)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[var(--crm-shell-max-width)] flex-col px-4 py-4 md:px-5 md:py-5 xl:px-7 xl:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
