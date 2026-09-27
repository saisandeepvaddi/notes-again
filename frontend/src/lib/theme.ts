export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

export function getStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
  }
  return "system";
}

export function storeTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
  }
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") {
    return theme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolveTheme(theme) === "dark");
}

export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");var d=t==="light"||t==="dark"?t:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.classList.toggle("dark",d==="dark");}catch(e){}})();`;
