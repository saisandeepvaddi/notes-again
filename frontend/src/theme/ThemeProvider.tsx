import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { applyTheme, getStoredTheme, storeTheme, type Theme } from "@/lib/theme";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Fixed initial value, not getStoredTheme(): that reads localStorage, which
  // doesn't exist during SSR (server always falls back to "system") but does
  // exist on the client's very first render -- the same render hydration
  // diffs against the server's HTML. A visitor with a saved "light"/"dark"
  // preference made every render disagree with the server on this value
  // (visible as a hydration-mismatch error on ThemeToggle's aria-checked).
  const [theme, setTheme] = useState<Theme>("system");
  // Gates the effect below until the real preference has been read, so it
  // never fires with the placeholder "system" first -- that would briefly
  // call storeTheme("system"), overwriting a real saved "light"/"dark" value
  // an instant before correcting it (and could flash the wrong theme, which
  // THEME_INIT_SCRIPT already avoided pre-paint).
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
    // Keep in sync if the OS theme changes while "system" is selected.
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
