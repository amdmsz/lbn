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
        "inline-flex items-center justify-center rounded-full bg-[linear-gradient(180deg,#d5a474,#a96636)] font-semibold text-white shadow-[0_10px_18px_rgba(154,97,51,0.18)]",
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
      <div className="flex items-center gap-3 rounded-[1rem] border border-black/6 bg-white/72 px-3 py-3">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[1rem] border border-black/6 bg-white/72 px-3 py-3 text-left transition-[border-color,background-color] hover:border-[rgba(154,97,51,0.22)] hover:bg-white"
    >
      {content}
    </button>
  );
}

export function AccountMenu({
  currentUser,
  compact = false,
}: Readonly<{
  currentUser: {
    name: string;
    username: string;
    avatarPath: string | null;
    roleName: string;
    teamName: string | null;
  };
  compact?: boolean;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(undefined);
  const avatarPath = avatarOverride === undefined ? currentUser.avatarPath : avatarOverride;
  const identityMeta = getIdentityMeta(currentUser.roleName, currentUser.teamName);

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
            "inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border bg-white/76 shadow-[0_10px_18px_rgba(15,23,42,0.08)] transition-[border-color,background-color,box-shadow]",
            open
              ? "border-[rgba(154,97,51,0.22)] bg-white"
              : "border-black/8 hover:border-[rgba(154,97,51,0.24)] hover:bg-white",
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
          "flex w-full items-center gap-3 rounded-[1.05rem] border px-3 py-3 text-left shadow-[0_10px_20px_rgba(18,24,31,0.05)] transition-[border-color,background-color,box-shadow]",
          open
            ? "border-[rgba(154,97,51,0.18)] bg-white shadow-[0_12px_24px_rgba(18,24,31,0.07)]"
            : "border-black/6 bg-white/72 hover:border-[rgba(154,97,51,0.2)] hover:bg-white",
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
            "absolute z-50 w-[18.75rem] overflow-hidden rounded-[1.2rem] border border-black/8 bg-[rgba(249,246,241,0.96)] shadow-[0_24px_44px_rgba(15,23,42,0.16)] backdrop-blur-[18px]",
            compact ? "bottom-0 left-[calc(100%+0.6rem)]" : "bottom-[calc(100%+0.6rem)] left-0",
          )}
        >
          <div className="border-b border-black/6 px-4 py-4">
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
              <div className="rounded-[1rem] border border-black/6 bg-white/64 p-2">
                <AvatarSettingsPanel
                  user={currentUser}
                  avatarPath={avatarPath}
                  onAvatarChange={setAvatarOverride}
                />
              </div>
            ) : null}

            <div className="rounded-[1rem] border border-black/6 bg-white/72 px-3 py-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]">
                  <Palette className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-[var(--foreground)]">
                    网页外观
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-sidebar-muted)]">
                    浅色、深色或跟随系统
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <AppearanceSwitcher />
              </div>
            </div>
          </div>

          <div className="border-t border-black/6 px-4 py-3">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center justify-between rounded-[1rem] border border-black/6 bg-white/72 px-3 py-2.5 text-left transition-[border-color,background-color] hover:border-[rgba(154,97,51,0.22)] hover:bg-white"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[0.9rem] bg-[rgba(168,60,40,0.12)] text-[rgb(144,44,29)]">
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
