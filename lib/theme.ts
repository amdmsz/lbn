export type AppearanceMode = "system" | "white" | "parchment" | "dark";
export type ResolvedTheme = "white" | "parchment" | "dark";

export const APPEARANCE_STORAGE_KEY = "jiuzhuang-appearance";
export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "system";
export const DEFAULT_LIGHT_THEME: ResolvedTheme = "white";

export const appearanceOptions: Array<{
  value: AppearanceMode;
  label: string;
  description: string;
  swatch: string;
}> = [
  {
    value: "system",
    label: "跟随系统",
    description: "根据系统外观自动切换",
    swatch: "linear-gradient(135deg,#ffffff 0%,#f6f3eb 48%,#121215 100%)",
  },
  {
    value: "white",
    label: "纯白",
    description: "高对比开发工具亮色模式",
    swatch: "linear-gradient(135deg,#ffffff 0%,#f8fafc 56%,#2563eb 100%)",
  },
  {
    value: "parchment",
    label: "羊毛纸",
    description: "暖色阅读模式，适合长时间处理客户记录",
    swatch: "linear-gradient(135deg,#fcfbf6 0%,#f6f3eb 58%,#df6e21 100%)",
  },
  {
    value: "dark",
    label: "暗色",
    description: "极暗 slate 底色的高对比模式",
    swatch: "linear-gradient(135deg,#121215 0%,#1c1c1f 58%,#60a5fa 100%)",
  },
];

export function normalizeAppearanceMode(value: string | null | undefined): AppearanceMode {
  if (value === "light") {
    return "white";
  }

  if (value === "paper") {
    return "parchment";
  }

  if (value === "pink") {
    return "white";
  }

  return isAppearanceMode(value) ? value : DEFAULT_APPEARANCE_MODE;
}

export function isAppearanceMode(value: string | null | undefined): value is AppearanceMode {
  return (
    value === "system" ||
    value === "white" ||
    value === "parchment" ||
    value === "dark"
  );
}

export function isResolvedTheme(value: string | null | undefined): value is ResolvedTheme {
  return value === "white" || value === "parchment" || value === "dark";
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
    const normalizedStored = stored === "light"
      ? "white"
      : (stored === "paper"
        ? "parchment"
        : (stored === "pink" ? "white" : stored));
    const appearance = stored === "light"
      ? "white"
      : (normalizedStored === "system" || normalizedStored === "white" || normalizedStored === "parchment" || normalizedStored === "dark"
        ? normalizedStored
        : "${DEFAULT_APPEARANCE_MODE}");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = appearance === "system"
      ? (prefersDark ? "dark" : "${DEFAULT_LIGHT_THEME}")
      : appearance;
    const className = resolved === "white"
      ? "theme-light"
      : (resolved === "parchment" ? "theme-parchment" : "dark");
    document.documentElement.dataset.appearance = appearance;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.classList.remove("theme-light", "theme-parchment", "dark");
    document.documentElement.classList.add(className);
    document.documentElement.style.colorScheme = resolved === "dark" ? "dark" : "light";
    if (stored !== appearance) {
      localStorage.setItem(key, appearance);
    }
  } catch (error) {
    document.documentElement.dataset.appearance = "${DEFAULT_APPEARANCE_MODE}";
    document.documentElement.dataset.theme = "${DEFAULT_LIGHT_THEME}";
    document.documentElement.classList.remove("theme-parchment", "dark");
    document.documentElement.classList.add("theme-light");
    document.documentElement.style.colorScheme = "light";
  }
})();
`;
