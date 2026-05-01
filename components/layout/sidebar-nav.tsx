"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RoleCode } from "@prisma/client";
import {
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Menu,
  Package,
  PhoneCall,
  ScrollText,
  Settings,
  ShipWheel,
  Trash2,
  Users,
  Video,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AccountMenu } from "@/components/layout/account-menu";
import { CommandPalette } from "@/components/layout/command-palette";
import { DesktopWindowControls } from "@/components/layout/desktop-window-frame";
import { ThemeSwitcher } from "@/components/layout/theme-switcher";
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
  callRecordings: PhoneCall,
  suppliers: Building2,
  products: Package,
  liveSessions: Video,
  recycleBin: Trash2,
  orders: Package,
  fulfillmentCenter: ShipWheel,
  paymentRecords: WalletCards,
  collectionTasks: ClipboardList,
  shipping: ShipWheel,
  shippingExportBatches: ScrollText,
  reports: BarChart3,
  settings: Settings,
};

const PRIMARY_NAV_ORDER = [
  "/dashboard",
  "/customers",
  "/leads",
  "/products",
  "/fulfillment",
  "/live-sessions",
] as const;

const MAX_PRIMARY_NAV_ITEMS = 5;

type CurrentUser = {
  name: string;
  username: string;
  avatarPath: string | null;
  role: RoleCode;
  roleName: string;
  teamName: string | null;
  homePath: string;
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

function flattenNavigationItems(groups: NavigationGroup[]) {
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

function splitNavigation(groups: NavigationGroup[]) {
  const allItems = flattenNavigationItems(groups);
  const itemMap = new Map(allItems.map((item) => [item.href, item]));
  const primaryItems: NavigationItem[] = [];
  const primaryHrefSet = new Set<string>();

  for (const href of PRIMARY_NAV_ORDER) {
    const item = itemMap.get(href);

    if (!item || primaryHrefSet.has(item.href)) {
      continue;
    }

    primaryItems.push(item);
    primaryHrefSet.add(item.href);

    if (primaryItems.length >= MAX_PRIMARY_NAV_ITEMS) {
      break;
    }
  }

  if (primaryItems.length < Math.min(MAX_PRIMARY_NAV_ITEMS, allItems.length)) {
    for (const item of allItems) {
      if (primaryHrefSet.has(item.href)) {
        continue;
      }

      primaryItems.push(item);
      primaryHrefSet.add(item.href);

      if (primaryItems.length >= MAX_PRIMARY_NAV_ITEMS) {
        break;
      }
    }
  }

  const overflowGroups = groups
    .map((group) => ({
      ...group,
      sections: group.sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !primaryHrefSet.has(item.href)),
        }))
        .filter((section) => section.items.length > 0),
    }))
    .filter((group) => group.sections.length > 0);

  return {
    primaryItems,
    overflowGroups,
  };
}

function TopNavHomeButton({
  spinning,
  onNavigate,
  iconOnly = false,
}: Readonly<{
  spinning: boolean;
  onNavigate: () => void;
  iconOnly?: boolean;
}>) {
  return (
    <button
      type="button"
      aria-label="返回首页"
      onClick={onNavigate}
      className={cn(
        "crm-motion-pill desktop-no-drag group inline-flex items-center gap-2 rounded-full border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface)] px-2.5 py-1.5 text-[var(--foreground)] transition-[border-color,background-color,box-shadow,transform] duration-200",
        "hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]",
        iconOnly ? "h-10 w-10 justify-center px-0 py-0" : "",
      )}
    >
      <span
        className={cn(
          "relative flex h-6.5 w-6.5 items-center justify-center rounded-full border border-[rgba(79,125,247,0.12)] bg-[var(--color-shell-surface-strong)] text-[var(--color-accent-strong)] transition-transform duration-200 group-hover:scale-[1.04]",
          spinning ? "animate-[spin_0.75s_linear_1]" : "",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-strong)]" />
        <span className="absolute right-[0.3rem] top-[0.3rem] h-1 w-1 rounded-full bg-[rgba(79,125,247,0.24)]" />
      </span>
      {iconOnly ? null : (
        <span className="hidden text-[11px] font-medium tracking-[0.12em] text-[var(--color-sidebar-muted)] lg:inline-flex">
          {BRAND_NAME_EN}
        </span>
      )}
    </button>
  );
}

function DesktopNavItem({
  item,
  active,
}: Readonly<{
  item: NavigationItem;
  active: boolean;
}>) {
  return (
    <Link
      href={item.href}
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cn(
        "crm-motion-pill desktop-no-drag relative rounded-full px-3 py-2 text-[12px] font-medium tracking-[-0.01em] transition-[background-color,color,box-shadow] duration-200",
        active
          ? "bg-[var(--color-shell-active)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)] after:absolute after:bottom-[-0.72rem] after:left-1/2 after:h-[2px] after:w-7 after:-translate-x-1/2 after:rounded-full after:bg-[var(--color-accent)]"
          : "text-[var(--color-sidebar-muted)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
      )}
    >
      {item.title}
    </Link>
  );
}

function OverflowMenu({
  groups,
  pathname,
  open,
  onToggle,
  onClose,
}: Readonly<{
  groups: NavigationGroup[];
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overflowActive = groups.some((group) =>
    group.sections.some((section) => section.items.some((item) => isItemActive(pathname, item))),
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="desktop-no-drag relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          "crm-motion-pill inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-medium tracking-[-0.01em] transition-[background-color,color,box-shadow] duration-200",
          open || overflowActive
            ? "bg-[var(--color-shell-active)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
            : "text-[var(--color-sidebar-muted)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
        )}
      >
        <span>更多</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform duration-200", open ? "rotate-180" : "")}
        />
      </button>

      {open ? (
        <div className="crm-animate-pop absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[19rem] overflow-hidden rounded-xl border border-border/60 bg-background p-2 shadow-xl backdrop-blur-xl">
          <div className="max-h-[min(70vh,32rem)] overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden">
            {groups.map((group, groupIndex) => (
              <section key={group.key}>
                {groupIndex > 0 ? <div className="mx-2 my-1 h-px bg-border/40" /> : null}
                <p className="mt-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {group.title}
                </p>
                <div>
                  {group.sections.map((section, sectionIndex) => (
                    <div
                      key={`${group.key}-${section.title ?? sectionIndex}`}
                      className="space-y-0.5"
                    >
                      {sectionIndex > 0 ? (
                        <div className="mx-2 my-1 h-px bg-border/40" />
                      ) : null}
                      {section.title ? (
                        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                          {section.title}
                        </p>
                      ) : null}
                      {section.items.map((item) => {
                        const Icon = iconMap[item.iconName];
                        const active = isItemActive(pathname, item);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            scroll={false}
                            aria-current={active ? "page" : undefined}
                            onClick={onClose}
                            className={cn(
                              "group flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-foreground hover:bg-primary/10 hover:text-primary",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                                active
                                  ? "text-primary"
                                  : "text-muted-foreground group-hover:text-primary",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{item.title}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileNavigationSheet({
  groups,
  pathname,
  primaryItems,
  currentUser,
  onNavigateHome,
  homeIconSpinning,
  onClose,
}: Readonly<{
  groups: NavigationGroup[];
  pathname: string;
  primaryItems: NavigationItem[];
  currentUser: CurrentUser;
  onNavigateHome: () => void;
  homeIconSpinning: boolean;
  onClose: () => void;
}>) {
  const primaryHrefSet = new Set(primaryItems.map((item) => item.href));

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="关闭导航"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,23,42,0.18)] backdrop-blur-[4px]"
      />
      <div className="crm-animate-pop absolute inset-x-0 top-0 border-b border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface-strong)] shadow-[var(--color-shell-shadow-lg)] backdrop-blur-[20px]">
        <div className="mx-auto max-w-[var(--crm-shell-max-width)] px-4 pb-5 pt-3">
          <div className="flex items-center justify-between gap-3">
            <TopNavHomeButton
              spinning={homeIconSpinning}
              onNavigate={() => {
                onNavigateHome();
                onClose();
              }}
            />
            <button
              type="button"
              aria-label="关闭导航"
              onClick={onClose}
              className="crm-motion-pill inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface)] text-[var(--foreground)] transition-[border-color,background-color,box-shadow] duration-200 hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 space-y-1">
            {primaryItems.map((item) => {
              const Icon = iconMap[item.iconName];
              const active = isItemActive(pathname, item);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  scroll={false}
                  aria-current={active ? "page" : undefined}
                  onClick={onClose}
                  className={cn(
                    "crm-motion-pill flex items-center gap-3 rounded-[1rem] px-3 py-3 text-[14px] font-medium transition-[background-color,color,box-shadow] duration-200",
                    active
                      ? "bg-[var(--color-shell-active)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
                      : "text-[var(--foreground)]/88 hover:bg-[var(--color-shell-hover)]",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full",
                      active
                        ? "bg-[rgba(79,125,247,0.1)] text-[var(--color-accent-strong)]"
                        : "bg-[var(--color-shell-icon-surface)] text-[var(--color-sidebar-muted)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1">{item.title}</span>
                </Link>
              );
            })}
          </div>

          <div className="mt-5 border-t border-[var(--color-border-soft)] pt-4">
            <div className="space-y-3">
              {groups.map((group) => {
                const sections = group.sections
                  .map((section) => ({
                    ...section,
                    items: section.items.filter((item) => !primaryHrefSet.has(item.href)),
                  }))
                  .filter((section) => section.items.length > 0);

                if (sections.length === 0) {
                  return null;
                }

                return (
                  <section key={group.key} className="space-y-1.5">
                    <p className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-sidebar-muted)]">
                      {group.title}
                    </p>
                    <div className="space-y-1">
                      {sections.map((section, sectionIndex) => (
                        <div
                          key={`${group.key}-${section.title ?? sectionIndex}`}
                          className={cn(
                            "space-y-1",
                            sectionIndex > 0 ? "border-t border-[var(--color-border-soft)] pt-1.5" : "",
                          )}
                        >
                          {section.items.map((item) => {
                            const Icon = iconMap[item.iconName];
                            const active = isItemActive(pathname, item);

                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                scroll={false}
                                aria-current={active ? "page" : undefined}
                                onClick={onClose}
                                className={cn(
                                  "crm-motion-pill flex items-center gap-3 rounded-[0.95rem] px-3 py-2.5 text-[13px] transition-[background-color,color,box-shadow] duration-200",
                                  active
                                    ? "bg-[rgba(79,125,247,0.1)] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                    : "text-[var(--color-sidebar-muted)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-full",
                                    active
                                      ? "bg-[rgba(79,125,247,0.1)] text-[var(--color-accent-strong)]"
                                      : "bg-[var(--color-shell-icon-surface)] text-[var(--color-sidebar-muted)]",
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-[var(--color-border-soft)] pt-4">
            <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3">
              <p className="text-[13px] font-medium text-[var(--foreground)]">
                {currentUser.name}
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-sidebar-muted)]">
                {currentUser.teamName
                  ? `${currentUser.roleName} / ${currentUser.teamName}`
                  : currentUser.roleName}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SidebarNav({
  groups,
  currentUser,
}: Readonly<{
  groups: NavigationGroup[];
  currentUser: CurrentUser;
}>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (searchParams.get("mode") === "popup") {
    return null;
  }

  return (
    <SidebarNavInner
      key={pathname}
      groups={groups}
      currentUser={currentUser}
      pathname={pathname}
    />
  );
}

function SidebarNavInner({
  groups,
  currentUser,
  pathname,
}: Readonly<{
  groups: NavigationGroup[];
  currentUser: CurrentUser;
  pathname: string;
}>) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [homeIconSpinning, setHomeIconSpinning] = useState(false);
  const homeSpinTimeoutRef = useRef<number | null>(null);

  const { primaryItems, overflowGroups } = useMemo(
    () => splitNavigation(groups),
    [groups],
  );

  const activeItem =
    flattenNavigationItems(groups).find((item) => isItemActive(pathname, item)) ??
    primaryItems[0];

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
      <header className="crm-animate-enter desktop-window-topbar desktop-drag-region sticky top-0 z-40 border-b border-[var(--color-shell-topbar-border)]">
        <div className="mx-auto flex h-14 w-full max-w-[calc(var(--crm-shell-max-width)+3rem)] items-center gap-3 px-4 md:px-5 xl:px-6">
          <div className="hidden shrink-0 md:block">
            <TopNavHomeButton spinning={homeIconSpinning} onNavigate={handleNavigateHome} />
          </div>

          <div className="shrink-0 md:hidden">
            <TopNavHomeButton
              spinning={homeIconSpinning}
              onNavigate={handleNavigateHome}
              iconOnly
            />
          </div>

          <div className="min-w-0 flex-1 text-center md:hidden">
            <p className="truncate text-[13px] font-medium tracking-[-0.01em] text-[var(--foreground)]">
              {activeItem?.title ?? "工作台"}
            </p>
          </div>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
            {primaryItems.map((item) => (
              <DesktopNavItem
                key={item.href}
                item={item}
                active={isItemActive(pathname, item)}
              />
            ))}
          </nav>

          <div className="hidden min-w-[16rem] max-w-[22rem] flex-1 lg:block xl:max-w-[24rem]">
            <CommandPalette groups={groups} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block">
              <OverflowMenu
                groups={overflowGroups}
                pathname={pathname}
                open={overflowOpen}
                onToggle={() => setOverflowOpen((current) => !current)}
                onClose={() => setOverflowOpen(false)}
              />
            </div>

            <ThemeSwitcher />

            <AccountMenu
              currentUser={currentUser}
              compact
              dropdownPlacement="down-end"
            />

            <DesktopWindowControls className="hidden self-stretch border-l border-[var(--color-shell-topbar-border)] md:flex" />

            <button
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="mobile-top-navigation"
              onClick={() => setMobileOpen(true)}
              className="crm-motion-pill desktop-no-drag inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface)] text-[var(--foreground)] transition-[border-color,background-color,box-shadow] duration-200 hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)] md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {mobileOpen ? (
        <div id="mobile-top-navigation">
          <MobileNavigationSheet
            groups={groups}
            pathname={pathname}
            primaryItems={primaryItems}
            currentUser={currentUser}
            onNavigateHome={handleNavigateHome}
            homeIconSpinning={homeIconSpinning}
            onClose={() => setMobileOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}
