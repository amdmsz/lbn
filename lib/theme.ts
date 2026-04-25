export type AppearanceMode = "system" | "white" | "paper" | "dark" | "pink";
export type ResolvedTheme = "white" | "paper" | "dark" | "pink";

export const APPEARANCE_STORAGE_KEY = "jiuzhuang-appearance";
export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";
export const DEFAULT_LIGHT_THEME: ResolvedTheme = "white";

export const appearanceOptions: Array<{
  value: AppearanceMode;
  label: string;
  description: string;
  swatch: string;
}> = [
  { value: "system", label: "\u8ddf\u968f", description: "\u4eae\u8272\u7528\u53c2\u8003\u9879\u76ee\u7eaf\u767d\uff0c\u6df1\u8272\u7528\u6d77\u519b\u84dd\u6697\u8272", swatch: "linear-gradient(135deg,#ffffff 0%,#eff6ff 50%,#0f172a 100%)" },
  { value: "white", label: "\u7eaf\u767d", description: "\u53c2\u8003 animated-login \u7684\u539f\u751f\u84dd\u767d\u914d\u8272", swatch: "linear-gradient(135deg,#ffffff 0%,#eff6ff 50%,#1e40af 100%)" },
  { value: "paper", label: "\u7f8a\u6bdb\u7eb8", description: "\u4fdd\u7559\u84dd\u8272\u4e3b\u8f74\uff0c\u589e\u52a0\u7eb8\u611f\u67d4\u548c\u5ea6", swatch: "linear-gradient(135deg,#fffaf2 0%,#f6efe3 58%,#1e40af 100%)" },
  { value: "dark", label: "\u6697\u8272", description: "\u4ee5\u53c2\u8003\u9879\u76ee\u5de6\u4fa7\u6d77\u519b\u84dd\u4e3a\u57fa\u5e95", swatch: "linear-gradient(135deg,#020617 0%,#0f172a 48%,#3b82f6 100%)" },
  { value: "pink", label: "\u7c89\u8272", description: "\u7528\u70ed\u95e8\u7c89\u8272\u7cfb\u66ff\u6362\u84dd\u8272 accent\uff0c\u4fdd\u6301\u9875\u9762\u514b\u5236", swatch: "linear-gradient(135deg,#fff8fb 0%,#fdf2f8 52%,#db2777 100%)" },
];

export function normalizeAppearanceMode(value: string | null | undefined): AppearanceMode {
  if (value === "light") {
    return "white";
  }

  return isAppearanceMode(value) ? value : DEFAULT_APPEARANCE_MODE;
}

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return value === "system" || value === "white" || value === "paper" || value === "dark" || value === "pink";
}

export function isResolvedTheme(value: string | null | undefined): value is ResolvedTheme {
  return value === "white" || value === "paper" || value === "dark" || value === "pink";
}

export function resolveTheme(
  appearance: AppearanceMode,
  prefersDark: boolean,
): ResolvedTheme {
  if (appearance === "system") {
    return prefersDark ? "dark" : DEFAULT_LIGHT_THEME;
  }

  return appearance;
}

export const themeInitScript = `
(() => {
  try {
    const key = "${APPEARANCE_STORAGE_KEY}";
    const stored = localStorage.getItem(key);
    const appearance = stored === "light"
      ? "white"
      : (stored === "system" || stored === "white" || stored === "paper" || stored === "dark" || stored === "pink"
        ? stored
        : "${DEFAULT_APPEARANCE_MODE}");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = appearance === "system"
      ? (prefersDark ? "dark" : "${DEFAULT_LIGHT_THEME}")
      : appearance;
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.dataset.theme = resolved;
    if (stored === "light") {
      localStorage.setItem(key, "white");
    }
  } catch (error) {
    document.documentElement.dataset.appearance = "${DEFAULT_APPEARANCE_MODE}";
    document.documentElement.dataset.theme = "${DEFAULT_LIGHT_THEME}";
  }
})();
`;
