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
  title: "\u5916\u89c2",
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
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">{text.title}</p>
          <p className="text-[12px] text-[var(--color-sidebar-muted)]">
            {text.current}{themeLabels[resolvedTheme]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {appearanceOptions.map((option) => {
          const active = appearance === option.value;

          return (
            <button
              key={option.value}
              type="button"
              title={option.description}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "rounded-full border px-3 py-2 text-[12px] font-medium transition-colors",
                active
                  ? "border-[var(--color-border)] bg-[var(--color-accent-soft)] text-[var(--foreground)]"
                  : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-sidebar-muted)] hover:border-[rgba(47,107,255,0.24)] hover:text-[var(--foreground)]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
