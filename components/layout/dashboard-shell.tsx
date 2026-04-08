"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import type { RoleCode } from "@prisma/client";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { NavigationGroup } from "@/lib/navigation";

const DESKTOP_SIDEBAR_WIDTH = "256px";
const DESKTOP_SIDEBAR_RAIL_WIDTH = "72px";

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
    homePath: string;
  };
  children: ReactNode;
}>) {
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  return (
    <div
      className="min-h-screen bg-transparent"
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
        <div className="mx-auto flex min-h-screen w-full max-w-[var(--crm-shell-max-width)] flex-col px-3 py-3 md:px-4 md:py-4 xl:px-6 xl:py-5">
          {children}
        </div>
      </main>
    </div>
  );
}
