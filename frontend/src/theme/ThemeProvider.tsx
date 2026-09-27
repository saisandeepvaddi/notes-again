import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { applyTheme, getStoredTheme, storeTheme, type Theme } from "@/lib/theme";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("system");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    applyTheme(theme);
    storeTheme(theme);
    if (theme !== "system") {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, hydrated]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
