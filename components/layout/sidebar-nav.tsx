"use client";

import { useEffect, useState } from "react";
import type { RoleCode } from "@prisma/client";
import {
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  Gift,
  LayoutDashboard,
  Menu,
  Package,
  ScrollText,
  Settings,
  ShipWheel,
  Users,
  Video,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import type {
  NavigationGroup,
  NavigationIconName,
  NavigationItem,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const iconMap: Record<NavigationIconName, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  leads: Boxes,
  leadImports: FileSpreadsheet,
  customers: Users,
  suppliers: Building2,
  products: Package,
  liveSessions: Video,
  orders: Package,
  fulfillmentCenter: Package,
  paymentRecords: WalletCards,
  collectionTasks: ClipboardList,
  gifts: Gift,
  shipping: ShipWheel,
  shippingExportBatches: ScrollText,
  reports: BarChart3,
  settings: Settings,
};

function isItemActive(pathname: string, item: NavigationItem) {
  const activePrefixes = item.activePrefixes ?? [item.href];
  const excludePrefixes = item.excludePrefixes ?? [];
  const excluded = excludePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (excluded) {
    return false;
  }

  return activePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function SidebarBody({
  groups,
  pathname,
  currentUser,
  onNavigate,
  mobile = false,
}: Readonly<{
  groups: NavigationGroup[];
  pathname: string;
  currentUser: {
    name: string;
    username: string;
    role: RoleCode;
    roleName: string;
    homePath: string;
  };
  onNavigate?: () => void;
  mobile?: boolean;
}>) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-sidebar-muted)]">
          Liquor CRM
        </p>
        <h1 className="mt-2 text-[1.05rem] font-semibold tracking-tight text-white">
          销售执行平台
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-sidebar-muted)]">
          导航按业务域组织，按角色裁剪工作树，避免不同岗位共享同一套入口。
        </p>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <div className="px-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/72">
                {group.title}
              </p>
              <p className="mt-1 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
                {group.description}
              </p>
            </div>

            <div className="space-y-3">
              {group.sections.map((section, index) => (
                <div key={`${group.key}-${section.title ?? index}`} className="space-y-1.5">
                  {section.title ? (
                    <div className="px-2 pt-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/56">
                        {section.title}
                      </p>
                      {section.description ? (
                        <p className="mt-1 text-[11px] leading-5 text-[var(--color-sidebar-muted)]">
                          {section.description}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = iconMap[item.iconName];
                      const active = isItemActive(pathname, item);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          scroll={false}
                          onClick={onNavigate}
                          className={cn(
                            "group relative flex items-start gap-3 rounded-[1rem] border px-3 py-3 transition-colors",
                            active
                              ? "border-[rgba(234,215,193,0.16)] bg-[rgba(255,255,255,0.08)] text-white"
                              : "border-transparent text-[var(--color-sidebar-muted)] hover:border-white/10 hover:bg-white/5 hover:text-white",
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.9rem] border text-sm",
                              active
                                ? "border-[rgba(234,215,193,0.24)] bg-[rgba(234,215,193,0.12)]"
                                : "border-white/10 bg-white/5",
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{item.title}</span>
                            <span className="mt-1 block text-[11px] leading-5 opacity-80">
                              {item.description}
                            </span>
                          </span>
                          {active ? (
                            <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-[var(--color-accent)]" />
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 p-4">
        <div className="rounded-[1rem] border border-white/10 bg-white/6 p-4 shadow-[0_16px_30px_rgba(0,0,0,0.16)]">
          <p className="text-sm font-medium text-white">{currentUser.name}</p>
          <p className="mt-1 text-xs text-[var(--color-sidebar-muted)]">@{currentUser.username}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs text-white/84">
              {currentUser.roleName}
            </span>
            <Link
              href={currentUser.homePath}
              scroll={false}
              onClick={onNavigate}
              className="text-xs text-[var(--color-sidebar-muted)] hover:text-white"
            >
              返回主入口
            </Link>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn(
              "crm-button crm-button-primary mt-4 w-full",
              mobile ? "min-h-[2.45rem]" : "",
            )}
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}

export function SidebarNav({
  groups,
  currentUser,
  desktopCollapsed = false,
}: Readonly<{
  groups: NavigationGroup[];
  currentUser: {
    name: string;
    username: string;
    role: RoleCode;
    roleName: string;
    homePath: string;
  };
  desktopCollapsed?: boolean;
}>) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeGroup =
    groups.find((group) =>
      group.sections.some((section) =>
        section.items.some((item) => isItemActive(pathname, item)),
      ),
    ) ?? groups[0];
  const activeItem =
    activeGroup?.sections
      .flatMap((section) => section.items)
      .find((item) => isItemActive(pathname, item)) ?? activeGroup?.sections[0]?.items[0];

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-black/8 bg-[rgba(246,244,239,0.94)] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Liquor CRM
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-black/82">
              {activeItem?.title ?? activeGroup?.title ?? "工作台"}
            </p>
            <p className="mt-1 truncate text-xs leading-5 text-black/55">
              {activeGroup?.title ? `${activeGroup.title} · ${currentUser.roleName}` : currentUser.roleName}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-sheet"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-black/8 bg-white/78 text-black/72 shadow-[0_8px_18px_rgba(31,35,41,0.06)] transition-colors hover:border-[var(--color-accent)]/20 hover:text-[var(--color-accent)]"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <div id="mobile-sidebar-sheet" className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭导航"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/32 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] shadow-[0_22px_40px_rgba(0,0,0,0.28)]">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-sidebar-muted)]">
                  导航
                </p>
                <p className="mt-1 text-sm font-medium text-white">
                  {currentUser.roleName}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭导航"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 text-white/72 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarBody
              groups={groups}
              pathname={pathname}
              currentUser={currentUser}
              onNavigate={() => setMobileOpen(false)}
              mobile
            />
          </div>
        </div>
      ) : null}

      <aside
        className={cn(
          "hidden bg-[var(--color-sidebar)] text-[var(--color-sidebar-foreground)] md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex md:w-[304px] md:flex-col md:border-r md:border-r-white/10",
          "lg:w-[var(--dashboard-sidebar-width)] lg:overflow-hidden lg:transition-[width,border-color] lg:duration-200",
          desktopCollapsed && "lg:border-r-transparent",
        )}
        aria-hidden={desktopCollapsed ? true : undefined}
      >
        <SidebarBody
          groups={groups}
          pathname={pathname}
          currentUser={currentUser}
        />
      </aside>
    </>
  );
}
