"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, LogOut, Settings2 } from "lucide-react";
import { signOut } from "next-auth/react";
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
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors group-hover:text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-inherit">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-normal text-muted-foreground">
          {description}
        </span>
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );

  if (!onClick) {
    return (
      <div className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-primary">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-primary"
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
    <div ref={containerRef} className={cn("desktop-no-drag relative", compact ? "" : "w-full")}>
      {trigger}

      {open ? (
        <div
          className={cn(
            "crm-animate-pop absolute z-50 w-64 rounded-xl border border-border/60 bg-background p-2 shadow-xl",
            resolvedDropdownPlacement === "right-start"
              ? "bottom-0 left-[calc(100%+0.6rem)]"
              : resolvedDropdownPlacement === "down-end"
                ? "right-0 top-[calc(100%+0.6rem)]"
            : "bottom-[calc(100%+0.6rem)] left-0",
          )}
        >
          <div className="mb-2 flex items-center gap-3 border-b border-border/50 pb-3">
            <AvatarBadge avatarPath={avatarPath} name={currentUser.name} size="large" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {currentUser.name}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {identityMeta}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                @{currentUser.username}
              </p>
            </div>
          </div>

          <div className="space-y-1">
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
              <div className="mt-2">
                <AvatarSettingsPanel
                  user={currentUser}
                  avatarPath={avatarPath}
                  onAvatarChange={setAvatarOverride}
                />
              </div>
            ) : null}
          </div>

          <div className="my-1 h-px bg-border/40" />

          <div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center text-destructive/70 transition-colors group-hover:text-destructive">
                <LogOut className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  退出登录
                </span>
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
