"use client";

import type { CSSProperties, ReactNode } from "react";
import type { RoleCode } from "@prisma/client";
import { useSearchParams } from "next/navigation";
import { DesktopWindowControls } from "@/components/layout/desktop-window-frame";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { WebRtcSoftphone } from "@/components/outbound-calls/webrtc-softphone";
import { ToastProvider } from "@/components/shared/toast-provider";
import type { NavigationGroup } from "@/lib/navigation";
import { cn } from "@/lib/utils";

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
  const searchParams = useSearchParams();
  const isPopupMode = searchParams.get("mode") === "popup";

  return (
    <div
      className="relative min-h-screen bg-transparent text-foreground"
      style={
        {
          "--dashboard-sidebar-width": "0px",
        } as CSSProperties
      }
    >
      {isPopupMode ? (
        <div className="desktop-drag-region sticky top-0 z-40 flex h-9 select-none items-center justify-between border-b border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface-strong)] pl-4 text-[12px] text-[var(--color-sidebar-muted)] backdrop-blur-[18px]">
          <div className="min-w-0 truncate text-[11px] font-medium">
            Lbn CRM / 弹窗详情
          </div>
          <DesktopWindowControls />
        </div>
      ) : (
        <SidebarNav groups={navigationGroups} currentUser={currentUser} />
      )}

      <main className="min-w-0">
        <div
          className={cn(
            "mx-auto flex w-full max-w-[var(--crm-shell-max-width)] flex-col px-4 md:px-5 xl:px-6",
            isPopupMode
              ? "min-h-[calc(100vh-2.25rem)] pb-8 pt-3 md:pb-10 md:pt-4 xl:pb-10 xl:pt-4"
              : "min-h-[calc(100vh-3.5rem)] pb-32 pt-4 md:pb-32 md:pt-5 xl:pb-32 xl:pt-6",
          )}
        >
          {children}
        </div>
      </main>

      {isPopupMode ? null : <WebRtcSoftphone role={currentUser.role} />}
      <ToastProvider />
    </div>
  );
}
