"use client";

import { useEffect, useState } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE_MODE,
  appearanceOptions,
  isAppearanceMode,
  resolveTheme,
  type AppearanceMode,
  type ResolvedTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

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

export function AppearanceSwitcher() {
  const [appearance, setAppearance] = useState<AppearanceMode>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_APPEARANCE_MODE;
    }

    const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return stored && isAppearanceMode(stored) ? stored : DEFAULT_APPEARANCE_MODE;
  });
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (typeof document === "undefined") {
      return "light";
    }

    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentAppearance = (localStorage.getItem(APPEARANCE_STORAGE_KEY) ??
        DEFAULT_APPEARANCE_MODE) as AppearanceMode;

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
    setResolvedTheme(applyAppearance(nextAppearance));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--foreground)]">外观</p>
          <p className="text-[12px] text-[var(--color-sidebar-muted)]">
            当前：{resolvedTheme === "dark" ? "深色" : "浅色"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {appearanceOptions.map((option) => {
          const active = appearance === option.value;

          return (
            <button
              key={option.value}
              type="button"
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
