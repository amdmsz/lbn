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
  Trash2,
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
  recycleBin: Trash2,
  orders: Package,
  fulfillmentCenter: ShipWheel,
  paymentRecords: WalletCards,
  collectionTasks: ClipboardList,
  gifts: Gift,
  shipping: ShipWheel,
  shippingExportBatches: ScrollText,
  reports: BarChart3,
  settings: Settings,
};

type CurrentUser = {
  name: string;
  username: string;
  avatarPath: string | null;
  role: RoleCode;
  roleName: string;
  teamName: string | null;
  homePath: string;
};

function getUserShellMeta(currentUser: CurrentUser) {
  return currentUser.teamName
    ? `${currentUser.roleName} / ${currentUser.teamName}`
    : currentUser.roleName;
}

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
        "inline-flex items-center justify-center border text-[var(--foreground)] transition-[border-color,background-color,box-shadow,transform] duration-200",
        inRail
          ? "h-10 w-10 rounded-[1rem] border-black/8 bg-white/76 shadow-[0_10px_24px_rgba(18,24,31,0.08)] hover:-translate-y-[1px] hover:border-[rgba(154,97,51,0.2)] hover:bg-white"
          : "h-9 w-9 rounded-[0.95rem] border-black/8 bg-white/72 shadow-[0_6px_14px_rgba(18,24,31,0.05)] hover:border-[rgba(154,97,51,0.2)] hover:bg-white",
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
      aria-label="返回首页"
      onClick={onNavigate}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-[1rem] border border-black/8 bg-white/88 shadow-[0_10px_18px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow,transform,background-color] duration-200",
        "hover:-translate-y-[1px] hover:scale-[1.03] hover:border-[rgba(160,106,29,0.24)] hover:bg-[rgba(255,252,247,0.98)] hover:shadow-[0_14px_24px_rgba(15,23,42,0.12)]",
      )}
    >
      <Image
        src="/sidebar-refresh-cat.webp"
        alt="返回首页"
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

function SidebarHeader({
  currentUser,
  homeIconSpinning,
  onNavigateHome,
  onDesktopToggle,
  showToggle,
}: Readonly<{
  currentUser: CurrentUser;
  homeIconSpinning: boolean;
  onNavigateHome: () => void;
  onDesktopToggle: () => void;
  showToggle: boolean;
}>) {
  const shellMeta = getUserShellMeta(currentUser);

  return (
    <div className="border-b border-black/6 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <HomeLogoButton spinning={homeIconSpinning} onNavigate={onNavigateHome} />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-sidebar-muted)]">
                {BRAND_NAME_EN}
              </p>
              <p className="mt-1 truncate text-[14px] font-semibold leading-4 text-[var(--foreground)]">
                销售执行平台
              </p>
            </div>
          </div>

          <div className="mt-3 min-w-0 space-y-1 px-1">
            <p className="truncate text-[11px] font-medium text-[var(--foreground)]">
              业务域导航
            </p>
            <p className="truncate text-[11px] text-[var(--color-sidebar-muted)]">
              {shellMeta}
            </p>
          </div>
        </div>

        {showToggle ? <DesktopToggle collapsed={false} onToggle={onDesktopToggle} /> : null}
      </div>
    </div>
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
  showShellHeader = true,
}: Readonly<{
  groups: NavigationGroup[];
  pathname: string;
  currentUser: CurrentUser;
  onDesktopToggle: () => void;
  homeIconSpinning?: boolean;
  onNavigateHome: () => void;
  showToggle?: boolean;
  showShellHeader?: boolean;
}>) {
  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(249,246,241,0.96)_0%,rgba(246,242,236,0.93)_100%)] backdrop-blur-[18px]">
      {showShellHeader ? (
        <SidebarHeader
          currentUser={currentUser}
          homeIconSpinning={homeIconSpinning}
          onNavigateHome={onNavigateHome}
          onDesktopToggle={onDesktopToggle}
          showToggle={showToggle}
        />
      ) : null}

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {groups.map((group) => {
          const groupActive = group.sections.some((section) =>
            section.items.some((item) => isItemActive(pathname, item)),
          );

          return (
            <section
              key={group.key}
              className={cn(
                "space-y-2 rounded-[1.05rem] px-2 py-2",
                groupActive
                  ? "bg-white/58 shadow-[0_10px_20px_rgba(18,24,31,0.04)] ring-1 ring-black/5"
                  : "",
              )}
            >
              <div className="px-2">
                <div className="flex items-center gap-2">
                  {groupActive ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-strong)]" />
                  ) : null}
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
                    {group.title}
                  </p>
                </div>
                {groupActive ? (
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-sidebar-muted)]">
                    {group.description}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2.5">
                {group.sections.map((section, index) => (
                  <div key={`${group.key}-${section.title ?? index}`} className="space-y-1.5">
                    {section.title ? (
                      <div className="px-2 pt-0.5">
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
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "group relative flex items-center gap-3 rounded-[0.95rem] px-2.5 py-2.5 transition-[background-color,color,box-shadow]",
                              active
                                ? "bg-[rgba(255,255,255,0.88)] text-[var(--foreground)] shadow-[0_8px_18px_rgba(18,24,31,0.06)]"
                                : "text-[var(--color-sidebar-muted)] hover:bg-white/62 hover:text-[var(--foreground)]",
                            )}
                          >
                            {active ? (
                              <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--color-accent-strong)]" />
                            ) : null}
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.8rem] text-sm transition-colors",
                                active
                                  ? "text-[var(--color-accent-strong)]"
                                  : "text-[var(--color-sidebar-muted)] group-hover:text-[var(--foreground)]",
                              )}
                            >
                              <Icon className="h-[15px] w-[15px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium leading-5">
                                {item.title}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-black/6 p-3">
        <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-sidebar-muted)]">
          当前账户
        </p>
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
  homeIconSpinning,
  onNavigateHome,
}: Readonly<{
  items: NavigationItem[];
  pathname: string;
  currentUser: CurrentUser;
  onDesktopToggle: () => void;
  homeIconSpinning: boolean;
  onNavigateHome: () => void;
}>) {
  return (
    <div className="flex h-full flex-col items-center bg-[linear-gradient(180deg,rgba(249,246,241,0.96)_0%,rgba(246,242,236,0.93)_100%)] backdrop-blur-[18px]">
      <div className="flex w-full flex-col items-center gap-2 border-b border-black/6 px-2 py-4">
        <HomeLogoButton spinning={homeIconSpinning} onNavigate={onNavigateHome} />
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
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border transition-[background-color,color,border-color,box-shadow]",
                  active
                    ? "border-black/8 bg-white text-[var(--foreground)] shadow-[0_10px_20px_rgba(18,24,31,0.08)]"
                    : "border-transparent bg-transparent text-[var(--color-sidebar-muted)] hover:border-black/6 hover:bg-white/72 hover:text-[var(--foreground)]",
                )}
              >
                <Icon className="h-4.5 w-4.5" />
                {active ? (
                  <span className="absolute bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[var(--color-accent-strong)]" />
                ) : null}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="w-full border-t border-black/6 px-2 py-3">
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
  currentUser: CurrentUser;
  desktopCollapsed?: boolean;
  onDesktopToggle: () => void;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [homeIconSpinning, setHomeIconSpinning] = useState(false);
  const homeSpinTimeoutRef = useRef<number | null>(null);
  const railItems = useMemo(() => getRailItems(groups), [groups]);
  const shellMeta = getUserShellMeta(currentUser);

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
      <div className="sticky top-0 z-40 border-b border-black/6 bg-[rgba(249,246,241,0.88)] backdrop-blur-[16px] md:hidden">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-sidebar-muted)]">
              {BRAND_NAME_EN}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">
              {activeItem?.title ?? activeGroup?.title ?? "工作台"}
            </p>
            <p className="mt-1 truncate text-xs leading-5 text-[var(--color-sidebar-muted)]">
              {activeGroup?.title ? `${activeGroup.title} / ${shellMeta}` : shellMeta}
            </p>
          </div>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar-sheet"
            onClick={() => setMobileOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-black/8 bg-white/78 text-[var(--foreground)] shadow-[0_8px_18px_rgba(31,35,41,0.08)] transition-colors hover:border-[rgba(154,97,51,0.24)]"
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
          <div className="absolute inset-y-0 left-0 flex w-[min(88vw,320px)] flex-col border-r border-black/6 bg-[linear-gradient(180deg,rgba(249,246,241,0.98)_0%,rgba(246,242,236,0.95)_100%)] text-[var(--foreground)] shadow-[0_22px_40px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between border-b border-black/6 px-4 py-3.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-sidebar-muted)]">
                  导航
                </p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                  {shellMeta}
                </p>
              </div>
              <button
                type="button"
                aria-label="关闭导航"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[1rem] border border-black/8 bg-white/78 text-[var(--foreground)] transition-colors hover:border-[rgba(154,97,51,0.24)]"
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
              showShellHeader={false}
            />
          </div>
        </div>
      ) : null}

      <aside
        className={cn(
          "hidden border-r border-black/6 bg-[linear-gradient(180deg,rgba(249,246,241,0.96)_0%,rgba(246,242,236,0.93)_100%)] text-[var(--foreground)] shadow-[inset_-1px_0_0_rgba(15,23,42,0.03)] md:fixed md:inset-y-0 md:left-0 md:z-30 md:flex",
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
              homeIconSpinning={homeIconSpinning}
              onNavigateHome={handleNavigateHome}
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
