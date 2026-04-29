"use client";

import type { CSSProperties, ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { WebRtcSoftphone } from "@/components/outbound-calls/webrtc-softphone";
import { ToastProvider } from "@/components/shared/toast-provider";
import type { NavigationGroup } from "@/lib/navigation";

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
  return (
    <div
      className="relative min-h-screen bg-transparent text-foreground"
      style={
        {
          "--dashboard-sidebar-width": "0px",
        } as CSSProperties
      }
    >
      <SidebarNav groups={navigationGroups} currentUser={currentUser} />

      <main className="min-w-0">
        <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-[var(--crm-shell-max-width)] flex-col px-4 pb-32 pt-4 md:px-5 md:pb-32 md:pt-5 xl:px-6 xl:pb-32 xl:pt-6">
          {children}
        </div>
      </main>

      <WebRtcSoftphone role={currentUser.role} />
      <ToastProvider />
    </div>
  );
}
