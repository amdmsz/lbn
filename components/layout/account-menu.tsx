"use client";

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
  const sizeClassName = size === "large" ? "h-12 w-12 text-base" : "h-9 w-9 text-sm";
  const avatarSrc = resolveAvatarSrc(avatarPath);

  if (avatarSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarSrc}
        alt={name}
        className={cn(
          "rounded-full object-cover shadow-[0_10px_18px_rgba(15,23,42,0.12)]",
          size === "large" ? "h-12 w-12" : "h-9 w-9",
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[linear-gradient(180deg,#d5a474,#a96636)] font-semibold text-white shadow-[0_10px_18px_rgba(154,97,51,0.18)]",
        sizeClassName,
      )}
    >
      {initials}
    </div>
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
  };
  compact?: boolean;
  }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(undefined);
  const avatarPath = avatarOverride === undefined ? currentUser.avatarPath : avatarOverride;

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
          aria-label="打开账户菜单"
          onClick={() => setOpen((current) => !current)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel-soft)] shadow-[0_10px_18px_rgba(15,23,42,0.08)] transition hover:border-[rgba(154,97,51,0.24)]"
        >
          <AvatarBadge avatarPath={avatarPath} name={currentUser.name} />
        </button>
      );
    }

    return (
      <button
        type="button"
        aria-expanded={open}
        aria-label="打开账户菜单"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 rounded-[0.95rem] border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-3 py-2.5 text-left shadow-[0_8px_18px_rgba(18,24,31,0.05)] transition hover:border-[rgba(154,97,51,0.24)]"
      >
        <AvatarBadge avatarPath={avatarPath} name={currentUser.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--foreground)]">
            {currentUser.name}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--color-sidebar-muted)]">
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
  }, [avatarPath, compact, currentUser.name, currentUser.username, open]);

  return (
    <div ref={containerRef} className={cn("relative", compact ? "" : "w-full")}>
      {trigger}

      {open ? (
        <div
          className={cn(
            "absolute z-50 w-[19.5rem] overflow-hidden rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-panel-soft)] shadow-[0_24px_44px_rgba(15,23,42,0.16)] backdrop-blur",
            compact ? "bottom-0 left-[calc(100%+0.6rem)]" : "bottom-[calc(100%+0.6rem)] left-0",
          )}
        >
          <div className="border-b border-[var(--color-border)] px-4 py-4">
            <div className="flex items-center gap-3">
              <AvatarBadge avatarPath={avatarPath} name={currentUser.name} size="large" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {currentUser.name}
                </p>
                <p className="mt-1 truncate text-[12px] text-[var(--color-sidebar-muted)]">
                  @{currentUser.username}
                </p>
                <p className="mt-1 text-[12px] text-[var(--color-sidebar-muted)]">
                  {currentUser.roleName}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAvatarPanelOpen((current) => !current)}
                className="flex w-full items-center justify-between rounded-[0.95rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-3 text-left transition hover:border-[rgba(154,97,51,0.24)]"
              >
                <div className="flex items-center gap-2.5">
                  <Settings2 className="h-4 w-4 text-[var(--color-sidebar-muted)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      个人资料与头像
                    </p>
                    <p className="text-[12px] text-[var(--color-sidebar-muted)]">
                      设置头像
                    </p>
                  </div>
                </div>
                <ChevronUp
                  className={cn(
                    "h-4 w-4 text-[var(--color-sidebar-muted)] transition-transform duration-200",
                    avatarPanelOpen ? "rotate-0" : "rotate-180",
                  )}
                />
              </button>

              {avatarPanelOpen ? (
                <AvatarSettingsPanel
                  user={currentUser}
                  avatarPath={avatarPath}
                  onAvatarChange={setAvatarOverride}
                />
              ) : null}
            </div>

            <div className="space-y-2 rounded-[0.95rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Palette className="h-4 w-4 text-[var(--color-sidebar-muted)]" />
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">网页外观</p>
                  <p className="text-[12px] text-[var(--color-sidebar-muted)]">
                    浅色、深色或跟随系统
                  </p>
                </div>
              </div>
              <AppearanceSwitcher />
            </div>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="crm-button crm-button-primary min-h-0 w-full px-3.5 py-2 text-sm"
            >
              <LogOut className="h-4 w-4" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
