"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AccountMenu } from "@/components/layout/account-menu";
import type {
  NavigationGroup,
  NavigationIconName,
  NavigationItem,
} from "@/lib/navigation";
import { BRAND_NAME_EN } from "@/lib/branding";
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

function getRailItems(groups: NavigationGroup[]) {
  const seen = new Set<string>();
  const items: NavigationItem[] = [];

  for (const group of groups) {
    for (const section of group.sections) {
      for (const item of section.items) {
        if (seen.has(item.href)) {
          continue;
        }
        seen.add(item.href);
        items.push(item);
      }
    }
  }

  return items;
}

function DesktopToggle({
  collapsed,
  onToggle,
  inRail = false,
}: Readonly<{
  collapsed: boolean;
  onToggle: () => void;
  inRail?: boolean;
}>) {
  return (
    <button
      type="button"
      aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
      aria-pressed={!collapsed}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center justify-center rounded-[0.9rem] border transition-colors",
        inRail
          ? "h-10 w-10 border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--foreground)] shadow-[0_10px_22px_rgba(18,24,31,0.06)] hover:border-[rgba(154,97,51,0.24)]"
          : "h-9 w-9 border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--foreground)] hover:border-[rgba(154,97,51,0.24)]",
      )}
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}

function HomeLogoButton({
  spinning,
  onNavigate,
}: Readonly<{
  spinning: boolean;
  onNavigate: () => void;
}>) {
  return (
    <button
      type="button"
      aria-label="返回主页面"
      onClick={onNavigate}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-[0.95rem] border border-black/8 bg-white/90 shadow-[0_8px_16px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow,transform,background-color] duration-200",
        "hover:-translate-y-[1px] hover:scale-[1.045] hover:border-[rgba(160,106,29,0.32)] hover:bg-[rgba(255,252,247,0.98)] hover:shadow-[0_14px_24px_rgba(15,23,42,0.12)]",
      )}
    >
      <Image
        src="/sidebar-refresh-cat.webp"
        alt="返回主页面"
        width={36}
        height={36}
        className={cn(
          "h-full w-full object-cover transition-transform duration-200",
          spinning ? "animate-[spin_0.75s_linear_1]" : "",
        )}
      />
    </button>
  );
}

function ExpandedSidebar({
  groups,
  pathname,
  currentUser,
  onDesktopToggle,
  homeIconSpinning = false,
  onNavigateHome,
  showToggle = true,
}: Readonly<{
  groups: NavigationGroup[];
  pathname: string;
  currentUser: {
    name: string;
    username: string;
    avatarPath: string | null;
    role: RoleCode;
    roleName: string;
    homePath: string;
  };
  onDesktopToggle: () => void;
  homeIconSpinning?: boolean;
  onNavigateHome: () => void;
  showToggle?: boolean;
}>) {
  return (
    <div className="flex h-full flex-col bg-[var(--color-panel-soft)]">
      <div className="border-b border-[var(--color-border)] px-3 py-2.5">
        <div className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HomeLogoButton
                spinning={homeIconSpinning}
                onNavigate={onNavigateHome}
              />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-sidebar-muted)]">
                  {BRAND_NAME_EN}
                </p>
                <p className="mt-0.5 truncate text-[13px] font-semibold leading-4 text-[var(--foreground)]">
                  销售执行平台
                </p>
              </div>
            </div>
          </div>

          {showToggle ? <DesktopToggle collapsed={false} onToggle={onDesktopToggle} /> : null}
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <section key={group.key} className="space-y-1.5">
            <div className="px-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                {group.title}
              </p>
            </div>

            <div className="space-y-2.5">
              {group.sections.map((section, index) => (
                <div key={`${group.key}-${section.title ?? index}`} className="space-y-1">
                  {section.title ? (
                    <div className="px-1.5 pt-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                        {section.title}
                      </p>
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
                          className={cn(
                            "group relative flex items-center gap-2.5 rounded-[0.95rem] border px-2.5 py-2 transition-colors",
                            active
                              ? "border-[rgba(154,97,51,0.22)] bg-[var(--color-accent-soft)] text-[var(--foreground)] shadow-[0_8px_18px_rgba(18,24,31,0.06)]"
                              : "border-transparent text-[var(--color-sidebar-muted)] hover:border-[rgba(154,97,51,0.2)] hover:bg-[var(--color-panel)] hover:text-[var(--foreground)]",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-[0.9rem] border text-sm",
                              active
                                ? "border-[rgba(154,97,51,0.24)] bg-white/70 text-[var(--color-accent-strong)]"
                                : "border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-sidebar-muted)]",
                            )}
                          >
                            <Icon className="h-[15px] w-[15px]" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium leading-5">
                              {item.title}
                            </span>
                          </span>
                          {active ? (
                            <span className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-[var(--color-accent-strong)]" />
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

      <div className="mt-auto border-t border-[var(--color-border)] p-2">
        <AccountMenu currentUser={currentUser} />
      </div>
    </div>
  );
}

function CollapsedRail({
  items,
  pathname,
  currentUser,
  onDesktopToggle,
}: Readonly<{
  items: NavigationItem[];
  pathname: string;
  currentUser: {
    name: string;
    username: string;
    avatarPath: string | null;
    role: RoleCode;
    roleName: string;
    homePath: string;
  };
  onDesktopToggle: () => void;
}>) {
  return (
    <div className="flex h-full flex-col items-center bg-[var(--color-panel-soft)]">
      <div className="flex w-full justify-center border-b border-[var(--color-border)] px-2 py-4">
        <DesktopToggle collapsed onToggle={onDesktopToggle} inRail />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4">
        <div className="flex flex-col items-center gap-2">
          {items.map((item) => {
            const Icon = iconMap[item.iconName];
            const active = isItemActive(pathname, item);

            return (
              <Link
                key={item.href}
                href={item.href}
                scroll={false}
                title={item.title}
                aria-label={item.title}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-[0.95rem] border transition-colors",
                  active
                    ? "border-black/10 bg-white text-black shadow-[0_8px_18px_rgba(18,24,31,0.05)]"
                    : "border-transparent bg-transparent text-black/58 hover:border-black/8 hover:bg-white hover:text-black/84",
                )}
              >
                <Icon className="h-4.5 w-4.5" />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="w-full border-t border-[var(--color-border)] px-2 py-3">
        <div className="flex flex-col items-center gap-2">
          <AccountMenu currentUser={currentUser} compact />
        </div>
      </div>
    </div>
  );
}

export function SidebarNav({
  groups,
  currentUser,
  desktopCollapsed = false,
  onDesktopToggle,
}: Readonly<{
  groups: NavigationGroup[];
  currentUser: {
    name: string;
    username: string;
    avatarPath: string | null;
    role: RoleCode;
    roleName: string;
    homePath: string;
  };
  desktopCollapsed?: boolean;
  onDesktopToggle: () => void;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [homeIconSpinning, setHomeIconSpinning] = useState(false);
  const homeSpinTimeoutRef = useRef<number | null>(null);
  const railItems = useMemo(() => getRailItems(groups), [groups]);

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

  useEffect(() => {
    return () => {
      if (homeSpinTimeoutRef.current) {
        window.clearTimeout(homeSpinTimeoutRef.current);
      }
    };
  }, []);

  function handleNavigateHome() {
    if (homeSpinTimeoutRef.current) {
      window.clearTimeout(homeSpinTimeoutRef.current);
    }

    setHomeIconSpinning(true);
    router.push(currentUser.homePath);
    homeSpinTimeoutRef.current = window.setTimeout(() => {
      setHomeIconSpinning(false);
    }, 800);
  }

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-panel-soft)] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)]">
              {BRAND_NAME_EN}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">
              {activeItem?.title ?? activeGroup?.title ?? "工作台"}
            </p>
            <p className="mt-1 truncate text-xs leading-5 text-[var(--color-sidebar-muted)]">
              {activeGroup?.title
                ? `${activeGroup.title} / ${currentUser.roleName}`
                : currentUser.roleName}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-sheet"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--foreground)] shadow-[0_8px_18px_rgba(31,35,41,0.06)] transition-colors hover:border-[rgba(154,97,51,0.24)]"
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
          <div className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--foreground)] shadow-[0_22px_40px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-sidebar-muted)]">
                  导航
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                  {currentUser.roleName}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭导航"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--foreground)] transition-colors hover:border-[rgba(154,97,51,0.24)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ExpandedSidebar
              groups={groups}
              pathname={pathname}
              currentUser={currentUser}
              onDesktopToggle={() => undefined}
              homeIconSpinning={homeIconSpinning}
              onNavigateHome={handleNavigateHome}
              showToggle={false}
            />
          </div>
        </div>
      ) : null}

      <aside
        className={cn(
          "hidden border-r border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--foreground)] md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex",
          "md:w-[var(--dashboard-sidebar-width)] md:overflow-visible md:transition-[width] md:duration-200",
        )}
      >
        <div className="flex h-full w-full min-w-0">
          {desktopCollapsed ? (
            <CollapsedRail
              items={railItems}
              pathname={pathname}
              currentUser={currentUser}
              onDesktopToggle={onDesktopToggle}
            />
          ) : (
            <ExpandedSidebar
              groups={groups}
              pathname={pathname}
              currentUser={currentUser}
              onDesktopToggle={onDesktopToggle}
              homeIconSpinning={homeIconSpinning}
              onNavigateHome={handleNavigateHome}
            />
          )}
        </div>
      </aside>
    </>
  );
}
