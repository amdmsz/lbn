"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, LogOut, Palette, Settings2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { AppearanceSwitcher } from "@/components/layout/appearance-switcher";
import { AvatarSettingsPanel } from "@/components/layout/avatar-settings-panel";
import { resolveAvatarSrc } from "@/lib/account/avatar";
import { cn } from "@/lib/utils";

function getInitials(name: string) {
  const tokens = name
    .trim()
    .split(/\s+/)
    .map((item) => item[0])
    .filter(Boolean);

  return (tokens.slice(0, 2).join("") || name.slice(0, 2) || "U").toUpperCase();
}

function getIdentityMeta(roleName: string, teamName: string | null) {
  return teamName ? `${roleName} / ${teamName}` : roleName;
}

function AvatarBadge({
  avatarPath,
  name,
  size = "default",
}: Readonly<{
  avatarPath: string | null;
  name: string;
  size?: "default" | "large";
}>) {
  const initials = getInitials(name);
  const avatarSrc = resolveAvatarSrc(avatarPath);

  if (avatarSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarSrc}
        alt={name}
        className={cn(
          "rounded-full object-cover shadow-[0_10px_18px_rgba(15,23,42,0.12)]",
          size === "large" ? "h-11 w-11" : "h-10 w-10",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-accent)_0%,#8aa8ff_100%)] font-semibold text-white shadow-[0_10px_18px_rgba(79,125,247,0.22)]",
        size === "large" ? "h-11 w-11 text-base" : "h-10 w-10 text-sm",
      )}
    >
      {initials}
    </div>
  );
}

function AccountRow({
  icon,
  title,
  description,
  trailing,
  onClick,
}: Readonly<{
  icon: ReactNode;
  title: string;
  description: string;
  trailing?: ReactNode;
  onClick?: () => void;
}>) {
  const content = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-[var(--foreground)]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--color-sidebar-muted)]">
          {description}
        </span>
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );

  if (!onClick) {
    return (
      <div className="flex items-center gap-3 rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="crm-motion-pill flex w-full items-center gap-3 rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3 text-left transition-[border-color,background-color,box-shadow] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]"
    >
      {content}
    </button>
  );
}

export function AccountMenu({
  currentUser,
  compact = false,
  dropdownPlacement,
}: Readonly<{
  currentUser: {
    name: string;
    username: string;
    avatarPath: string | null;
    roleName: string;
    teamName: string | null;
  };
  compact?: boolean;
  dropdownPlacement?: "up-start" | "right-start" | "down-end";
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(undefined);
  const avatarPath = avatarOverride === undefined ? currentUser.avatarPath : avatarOverride;
  const identityMeta = getIdentityMeta(currentUser.roleName, currentUser.teamName);
  const resolvedDropdownPlacement =
    dropdownPlacement ?? (compact ? "right-start" : "up-start");

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const trigger = useMemo(() => {
    if (compact) {
      return (
        <button
          type="button"
          aria-expanded={open}
          aria-label="打开账户面板"
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "crm-motion-pill inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface)] transition-[border-color,background-color,box-shadow]",
            open
              ? "border-[var(--color-accent-soft)] bg-[var(--color-shell-hover)] shadow-[var(--color-shell-shadow-md)]"
              : "hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-sm)]",
          )}
        >
          <AvatarBadge avatarPath={avatarPath} name={currentUser.name} />
        </button>
      );
    }

    return (
      <button
        type="button"
        aria-expanded={open}
        aria-label="打开账户面板"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "crm-motion-pill flex w-full items-center gap-3 rounded-[1.05rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-3 text-left shadow-[var(--color-shell-shadow-sm)] transition-[border-color,background-color,box-shadow]",
          open
            ? "border-[var(--color-accent-soft)] bg-[var(--color-shell-hover)] shadow-[var(--color-shell-shadow-md)]"
            : "hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)]",
        )}
      >
        <AvatarBadge avatarPath={avatarPath} name={currentUser.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">
            {currentUser.name}
          </p>
          <p className="mt-1 truncate text-[11px] text-[var(--color-sidebar-muted)]">
            {identityMeta}
          </p>
          <p className="mt-1 truncate text-[11px] text-[var(--color-sidebar-muted)]">
            @{currentUser.username}
          </p>
        </div>
        <ChevronUp
          className={cn(
            "h-4 w-4 shrink-0 text-[var(--color-sidebar-muted)] transition-transform duration-200",
            open ? "rotate-0" : "rotate-180",
          )}
        />
      </button>
    );
  }, [
    avatarPath,
    compact,
    currentUser.name,
    currentUser.username,
    identityMeta,
    open,
  ]);

  return (
    <div ref={containerRef} className={cn("relative", compact ? "" : "w-full")}>
      {trigger}

      {open ? (
        <div
          className={cn(
            "crm-animate-pop absolute z-50 w-[18.75rem] overflow-hidden rounded-[1.2rem] border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface-strong)] shadow-[var(--color-shell-shadow-lg)] backdrop-blur-[20px]",
            resolvedDropdownPlacement === "right-start"
              ? "bottom-0 left-[calc(100%+0.6rem)]"
              : resolvedDropdownPlacement === "down-end"
                ? "right-0 top-[calc(100%+0.6rem)]"
                : "bottom-[calc(100%+0.6rem)] left-0",
          )}
        >
          <div className="border-b border-[var(--color-shell-topbar-border)] px-4 py-4">
            <div className="flex items-center gap-3">
              <AvatarBadge avatarPath={avatarPath} name={currentUser.name} size="large" />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[var(--foreground)]">
                  {currentUser.name}
                </p>
                <p className="mt-1 truncate text-[11px] text-[var(--color-sidebar-muted)]">
                  {identityMeta}
                </p>
                <p className="mt-1 truncate text-[11px] text-[var(--color-sidebar-muted)]">
                  @{currentUser.username}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 py-4">
            <AccountRow
              icon={<Settings2 className="h-4 w-4" />}
              title="个人资料与头像"
              description="维护头像和基础账户资料"
              trailing={
                <ChevronUp
                  className={cn(
                    "h-4 w-4 text-[var(--color-sidebar-muted)] transition-transform duration-200",
                    avatarPanelOpen ? "rotate-0" : "rotate-180",
                  )}
                />
              }
              onClick={() => setAvatarPanelOpen((current) => !current)}
            />

            {avatarPanelOpen ? (
              <div className="rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-2">
                <AvatarSettingsPanel
                  user={currentUser}
                  avatarPath={avatarPath}
                  onAvatarChange={setAvatarOverride}
                />
              </div>
            ) : null}

            <div className="rounded-[1.15rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface)] p-3 shadow-[var(--color-shell-shadow-xs)]">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
                  <Palette className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">
                    {"\u5168\u7ad9\u914d\u8272"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-sidebar-muted)]">
                    {"\u57fa\u4e8e animated-login \u7684\u84dd\u767d\u4f53\u7cfb\u6269\u5c55"}
                  </p>
                </div>
              </div>
              <AppearanceSwitcher />
            </div>
          </div>

          <div className="border-t border-[var(--color-shell-topbar-border)] px-4 py-3">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="crm-motion-pill flex w-full items-center justify-between rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-md)]"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] bg-[rgba(209,91,118,0.12)] text-[var(--color-danger)]">
                  <LogOut className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-[13px] font-medium text-[var(--foreground)]">
                    退出登录
                  </span>
                  <span className="block text-[11px] text-[var(--color-sidebar-muted)]">
                    结束当前会话并返回登录页
                  </span>
                </span>
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
