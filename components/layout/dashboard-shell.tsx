"use client";

import { useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { NavigationGroup } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const DESKTOP_SIDEBAR_WIDTH = "304px";
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = "0px";

export function DashboardShell({
  navigationGroups,
  currentUser,
  children,
}: Readonly<{
  navigationGroups: NavigationGroup[];
  currentUser: {
    name: string;
    username: string;
    role: RoleCode;
    roleName: string;
    homePath: string;
  };
  children: ReactNode;
}>) {
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

  return (
    <div
      className="min-h-screen bg-[linear-gradient(180deg,rgba(246,244,239,0.96),rgba(240,237,231,0.98))]"
      style={
        {
          "--dashboard-sidebar-width": desktopSidebarCollapsed
            ? DESKTOP_SIDEBAR_COLLAPSED_WIDTH
            : DESKTOP_SIDEBAR_WIDTH,
        } as CSSProperties
      }
      data-dashboard-sidebar-collapsed={desktopSidebarCollapsed ? "true" : "false"}
    >
      <SidebarNav
        groups={navigationGroups}
        currentUser={currentUser}
        desktopCollapsed={desktopSidebarCollapsed}
      />
      <main className="min-w-0 md:pl-[304px] lg:pl-[var(--dashboard-sidebar-width)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-4 py-4 md:px-6 md:py-6 xl:px-8 xl:py-7">
          <div className="hidden lg:flex">
            <button
              type="button"
              aria-label={desktopSidebarCollapsed ? "展开导航" : "隐藏导航"}
              aria-pressed={desktopSidebarCollapsed}
              onClick={() => setDesktopSidebarCollapsed((current) => !current)}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-[0.85rem] border border-black/8 bg-white/82 text-black/68 shadow-[0_8px_18px_rgba(31,35,41,0.05)] transition-colors hover:border-black/12 hover:bg-white hover:text-black/84",
              )}
            >
              {desktopSidebarCollapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </button>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
