"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { Maximize2, Minus, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function subscribeDesktopShell() {
  return () => undefined;
}

function getDesktopShellSnapshot() {
  return typeof window !== "undefined" && Boolean(window.lbnDesktop);
}

function getDesktopShellServerSnapshot() {
  return false;
}

function getWindowTitle(pathname: string | null) {
  if (!pathname || pathname === "/") return "工作台";
  if (pathname.startsWith("/login")) return "登录";
  if (pathname.startsWith("/dashboard")) return "经营驾驶舱";
  if (pathname.startsWith("/customers/public-pool")) return "客户公池";
  if (pathname.startsWith("/customers")) return "客户作业台";
  if (pathname.startsWith("/fulfillment")) return "履约中心";
  if (pathname.startsWith("/products")) return "商品中心";
  if (pathname.startsWith("/call-recordings")) return "录音质检";
  if (pathname.startsWith("/settings")) return "系统设置";
  if (pathname.startsWith("/mobile")) return "移动工作台";

  return "业务工作台";
}

export function useIsDesktopShell() {
  return useSyncExternalStore(
    subscribeDesktopShell,
    getDesktopShellSnapshot,
    getDesktopShellServerSnapshot,
  );
}

export function DesktopWindowControls({
  className,
}: Readonly<{
  className?: string;
}>) {
  const isDesktopShell = useIsDesktopShell();

  if (!isDesktopShell) {
    return null;
  }

  return (
    <div
      className={cn(
        "desktop-no-drag flex h-full shrink-0 items-center gap-1 px-1.5",
        className,
      )}
    >
      <button
        type="button"
        aria-label="最小化到托盘"
        title="最小化到托盘"
        onClick={() => void window.lbnDesktop?.window.minimize()}
        className="inline-flex h-7 w-8 items-center justify-center rounded-full text-[var(--color-sidebar-muted)] transition hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="最大化或还原"
        title="最大化或还原"
        onClick={() => void window.lbnDesktop?.window.maximize()}
        className="inline-flex h-7 w-8 items-center justify-center rounded-full text-[var(--color-sidebar-muted)] transition hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="关闭到托盘"
        title="关闭到托盘"
        onClick={() => void window.lbnDesktop?.window.close()}
        className="inline-flex h-7 w-8 items-center justify-center rounded-full text-[var(--color-sidebar-muted)] transition hover:bg-[var(--color-danger)] hover:text-white"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function DesktopWindowFrame() {
  const pathname = usePathname();
  const isDesktopShell = useIsDesktopShell();
  const title = useMemo(() => getWindowTitle(pathname), [pathname]);
  const shouldRenderStandaloneFrame =
    pathname?.startsWith("/login") || pathname?.startsWith("/change-password");

  useEffect(() => {
    if (isDesktopShell) {
      document.documentElement.dataset.lbnDesktop = "true";
    }
  }, [isDesktopShell]);

  if (!isDesktopShell || !shouldRenderStandaloneFrame) {
    return null;
  }

  return (
    <div className="desktop-window-topbar desktop-drag-region flex h-9 select-none items-center justify-between border-b border-[var(--color-shell-topbar-border)] pl-4 text-[12px] text-[var(--color-sidebar-muted)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-[10px] font-semibold text-white">
          L
        </span>
        <span className="shrink-0 font-semibold text-[var(--foreground)]">
          Lbn CRM
        </span>
        <span className="h-3 w-px bg-[var(--color-border-soft)]" />
        <span className="truncate text-[11px] font-medium">{title}</span>
      </div>

      <DesktopWindowControls />
    </div>
  );
}
