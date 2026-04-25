export type AppearanceMode = "system" | "white" | "paper" | "dark" | "pink";
export type ResolvedTheme = "white" | "paper" | "dark" | "pink";

export const APPEARANCE_STORAGE_KEY = "jiuzhuang-appearance";
export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";
export const DEFAULT_LIGHT_THEME: ResolvedTheme = "paper";

export const appearanceOptions: Array<{
  value: AppearanceMode;
  label: string;
  description: string;
}> = [
  { value: "system", label: "\u8ddf\u968f\u7cfb\u7edf", description: "\u7cfb\u7edf\u4eae\u8272\u7528\u7f8a\u6bdb\u7eb8\uff0c\u6df1\u8272\u7528\u6697\u8272" },
  { value: "white", label: "\u7eaf\u767d", description: "\u6e05\u723d\u9ad8\u5bf9\u6bd4\uff0c\u9002\u5408\u767d\u5929\u529e\u516c" },
  { value: "paper", label: "\u7f8a\u6bdb\u7eb8", description: "\u6e29\u548c\u7eb8\u611f\uff0c\u9ed8\u8ba4\u8212\u9002\u4e3b\u9898" },
  { value: "dark", label: "\u6697\u8272", description: "\u4f4e\u4eae\u5ea6\uff0c\u9002\u5408\u591c\u95f4\u548c\u5927\u5c4f" },
  { value: "pink", label: "\u7c89\u8272", description: "\u67d4\u548c\u7c89\u8c03\uff0c\u8f7b\u677e\u4f46\u4e0d\u751c\u817b" },
];

export function normalizeAppearanceMode(value: string | null | undefined): AppearanceMode {
  if (value === "light") {
    return "paper";
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
      ? "paper"
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
      localStorage.setItem(key, "paper");
    }
  } catch (error) {
    document.documentElement.dataset.appearance = "${DEFAULT_APPEARANCE_MODE}";
    document.documentElement.dataset.theme = "${DEFAULT_LIGHT_THEME}";
  }
})();
`;
