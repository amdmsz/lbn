export type AppearanceMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "jiuzhuang-appearance";
export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";

export const appearanceOptions: Array<{
  value: AppearanceMode;
  label: string;
}> = [
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
  { value: "system", label: "跟随系统" },
];

export function isAppearanceMode(value: string): value is AppearanceMode {
  return value === "light" || value === "dark" || value === "system";
}

export function resolveTheme(
  appearance: AppearanceMode,
  prefersDark: boolean,
): ResolvedTheme {
  if (appearance === "system") {
    return prefersDark ? "dark" : "light";
  }

  return appearance;
}

export const themeInitScript = `
(() => {
  try {
    const key = "${APPEARANCE_STORAGE_KEY}";
    const stored = localStorage.getItem(key);
    const appearance = stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "${DEFAULT_APPEARANCE_MODE}";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = appearance === "system"
      ? (prefersDark ? "dark" : "light")
      : appearance;
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.dataset.theme = resolved;
  } catch (error) {
    document.documentElement.dataset.appearance = "${DEFAULT_APPEARANCE_MODE}";
    document.documentElement.dataset.theme = "light";
  }
})();
`;
