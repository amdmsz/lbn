"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MonitorCog, Palette } from "lucide-react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_LIGHT_THEME,
  appearanceOptions,
  normalizeAppearanceMode,
  resolveTheme,
  type AppearanceMode,
  type ResolvedTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const themeClassNames = ["theme-light", "theme-parchment", "dark"] as const;

const resolvedThemeLabels: Record<ResolvedTheme, string> = {
  white: "纯白",
  parchment: "羊毛纸",
  dark: "暗色",
};

function getSystemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getThemeClassName(theme: ResolvedTheme) {
  if (theme === "white") return "theme-light";
  if (theme === "parchment") return "theme-parchment";
  return "dark";
}

export function applyThemeAppearance(nextAppearance: AppearanceMode) {
  const resolved = resolveTheme(nextAppearance, getSystemPrefersDark());
  const root = document.documentElement;

  root.dataset.appearance = nextAppearance;
  root.dataset.theme = resolved;
  root.classList.remove(...themeClassNames);
  root.classList.add(getThemeClassName(resolved));
  root.style.colorScheme = resolved === "dark" ? "dark" : "light";
  localStorage.setItem(APPEARANCE_STORAGE_KEY, nextAppearance);

  return resolved;
}

function ThemePreviewIcon({
  value,
  active,
}: Readonly<{
  value: AppearanceMode;
  active: boolean;
}>) {
  if (value === "system") {
    return (
      <svg viewBox="0 0 44 28" aria-hidden="true" className="h-7 w-11">
        <rect x="1" y="1" width="42" height="26" rx="8" className="fill-white stroke-slate-200" />
        <path d="M22 1h13a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H22z" className="fill-slate-950" />
        <path d="M8 10h8M8 15h10M8 20h6" className="stroke-slate-400" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="32" cy="14" r="4.2" className="fill-primary" />
      </svg>
    );
  }

  if (value === "parchment") {
    return (
      <svg viewBox="0 0 44 28" aria-hidden="true" className="h-7 w-11">
        <rect x="1" y="1" width="42" height="26" rx="8" className="fill-[#fcfbf6] stroke-[#e1ddd4]" />
        <path d="M10 9h18M10 14h24M10 19h14" className="stroke-[#9b8472]" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="34" cy="9" r="3" className="fill-[#df6e21]" />
      </svg>
    );
  }

  if (value === "dark") {
    return (
      <svg viewBox="0 0 44 28" aria-hidden="true" className="h-7 w-11">
        <rect x="1" y="1" width="42" height="26" rx="8" className="fill-[#121215] stroke-[#33333a]" />
        <path d="M10 9h14M10 14h22M10 19h10" className="stroke-[#9f9fa9]" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="34" cy="9" r="3" className="fill-primary" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 44 28" aria-hidden="true" className="h-7 w-11">
      <rect x="1" y="1" width="42" height="26" rx="8" className="fill-white stroke-slate-200" />
      <path d="M10 9h18M10 14h24M10 19h14" className="stroke-slate-400" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="34" cy="9" r="3" className={active ? "fill-primary" : "fill-slate-300"} />
    </svg>
  );
}

export function ThemeSwitcher({ className }: Readonly<{ className?: string }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [appearance, setAppearance] = useState<AppearanceMode>(DEFAULT_APPEARANCE_MODE);
  const [resolvedTheme, setResolvedTheme] =
    useState<ResolvedTheme>(DEFAULT_LIGHT_THEME);

  const currentOption = useMemo(
    () => appearanceOptions.find((option) => option.value === appearance) ?? appearanceOptions[0],
    [appearance],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedAppearance = normalizeAppearanceMode(
        window.localStorage.getItem(APPEARANCE_STORAGE_KEY),
      );

      hydratedRef.current = true;
      setAppearance(storedAppearance);
      setResolvedTheme(applyThemeAppearance(storedAppearance));
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setResolvedTheme(applyThemeAppearance(appearance));
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [appearance]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemThemeChange() {
      const currentAppearance = normalizeAppearanceMode(
        localStorage.getItem(APPEARANCE_STORAGE_KEY),
      );

      if (currentAppearance === "system") {
        setResolvedTheme(applyThemeAppearance("system"));
      }
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  function handleSelect(nextAppearance: AppearanceMode) {
    hydratedRef.current = true;
    setAppearance(nextAppearance);
    setResolvedTheme(applyThemeAppearance(nextAppearance));
  }

  return (
    <div ref={containerRef} className={cn("desktop-no-drag relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label="切换主题"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "crm-motion-pill inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-shell-topbar-border)] bg-[var(--color-shell-surface)] text-[var(--foreground)] transition-[border-color,background-color,box-shadow] duration-200",
          open
            ? "border-[var(--color-accent-soft)] bg-[var(--color-shell-hover)] shadow-[var(--color-shell-shadow-md)]"
            : "hover:border-[var(--color-accent-soft)] hover:bg-[var(--color-shell-hover)] hover:shadow-[var(--color-shell-shadow-sm)]",
        )}
        title={`主题：${currentOption?.label ?? resolvedThemeLabels[resolvedTheme]}`}
      >
        <Palette className="h-4 w-4" />
      </button>

      {open ? (
        <div className="crm-animate-pop absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(28rem,calc(100vw-1.5rem))] rounded-xl border border-border/60 bg-background p-4 shadow-xl">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-border/50 pb-4">
            <div className="flex min-w-0 flex-col space-y-1">
              <h4 className="font-semibold leading-none text-foreground">
                界面主题
              </h4>
              <p className="text-xs text-muted-foreground">
                定制您的系统外观与色彩
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                当前外观：{resolvedThemeLabels[resolvedTheme]}
              </p>
            </div>
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-primary/10 text-primary">
              <MonitorCog className="h-4 w-4" />
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {appearanceOptions.map((option) => {
              const active = appearance === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  title={option.description}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    "group relative flex min-w-0 flex-col items-center gap-2 rounded-xl border px-1.5 py-2.5 text-center text-[11px] font-semibold transition-[background-color,border-color,box-shadow,color,transform]",
                    active
                      ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/20"
                      : "border-border/50 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground",
                  )}
                >
                  <ThemePreviewIcon value={option.value} active={active} />
                  <span className="max-w-full truncate">{option.label}</span>
                  {active ? (
                    <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--primary-foreground)]">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
