"use client";

import { useEffect, useState } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_MODE,
  DEFAULT_LIGHT_THEME,
  appearanceOptions,
  isResolvedTheme,
  normalizeAppearanceMode,
  resolveTheme,
  type AppearanceMode,
  type ResolvedTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const text = {
  title: "\u5168\u7ad9\u914d\u8272",
  current: "\u5f53\u524d\uff1a",
};

const themeLabels: Record<ResolvedTheme, string> = {
  white: "\u7eaf\u767d",
  paper: "\u7f8a\u6bdb\u7eb8",
  dark: "\u6697\u8272",
  pink: "\u7c89\u8272",
};

function getSystemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyAppearance(nextAppearance: AppearanceMode) {
  const resolved = resolveTheme(nextAppearance, getSystemPrefersDark());
  document.documentElement.dataset.appearance = nextAppearance;
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem(APPEARANCE_STORAGE_KEY, nextAppearance);
  return resolved;
}

function readResolvedTheme(): ResolvedTheme {
  if (typeof document === "undefined") {
    return DEFAULT_LIGHT_THEME;
  }

  const currentTheme = document.documentElement.dataset.theme;
  return isResolvedTheme(currentTheme) ? currentTheme : DEFAULT_LIGHT_THEME;
}

export function AppearanceSwitcher() {
  const [appearance, setAppearance] = useState<AppearanceMode>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_APPEARANCE_MODE;
    }

    return normalizeAppearanceMode(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(readResolvedTheme);

  useEffect(() => {
    setResolvedTheme(applyAppearance(appearance));
  }, [appearance]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentAppearance = normalizeAppearanceMode(localStorage.getItem(APPEARANCE_STORAGE_KEY));

      if (currentAppearance === "system") {
        setResolvedTheme(applyAppearance("system"));
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  function handleSelect(nextAppearance: AppearanceMode) {
    setAppearance(nextAppearance);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{text.title}</p>
          <p className="text-[12px] text-[var(--color-sidebar-muted)]">
            {text.current}{themeLabels[resolvedTheme]}
          </p>
        </div>
        <span
          className="h-8 w-8 rounded-full border border-[var(--color-border-soft)] shadow-[var(--color-shell-shadow-xs)]"
          style={{ background: appearanceOptions.find((option) => option.value === appearance)?.swatch }}
          aria-hidden="true"
        />
      </div>

      <div className="grid grid-cols-5 gap-1.5 rounded-[1rem] border border-[var(--color-border-soft)] bg-[var(--color-shell-surface-soft)] p-1.5">
        {appearanceOptions.map((option) => {
          const active = appearance === option.value;

          return (
            <button
              key={option.value}
              type="button"
              title={option.description}
              aria-pressed={active}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "group flex min-w-0 flex-col items-center gap-1.5 rounded-[0.8rem] px-1.5 py-2 text-[11px] font-semibold transition-[background-color,box-shadow,color,transform]",
                active
                  ? "bg-[var(--color-shell-surface-strong)] text-[var(--foreground)] shadow-[var(--color-shell-shadow-sm)]"
                  : "text-[var(--color-sidebar-muted)] hover:bg-[var(--color-shell-hover)] hover:text-[var(--foreground)]",
              )}
            >
              <span
                className={cn(
                  "h-5 w-5 rounded-full border transition-transform group-hover:scale-105",
                  active ? "border-[var(--color-accent)]" : "border-[var(--color-border)]",
                )}
                style={{ background: option.swatch }}
                aria-hidden="true"
              />
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
