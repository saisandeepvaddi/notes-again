import * as SecureStore from "expo-secure-store";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { readingFonts, type ReadingFont } from "@/theme";

const KEY = "notes-again.reading-font";

const storage = {
  get: (): Promise<string | null> =>
    process.env.EXPO_OS === "web"
      ? Promise.resolve(globalThis.localStorage?.getItem(KEY) ?? null)
      : SecureStore.getItemAsync(KEY),
  set: (value: string): Promise<void> =>
    process.env.EXPO_OS === "web"
      ? Promise.resolve(globalThis.localStorage?.setItem(KEY, value))
      : SecureStore.setItemAsync(KEY, value),
};

interface ReadingFontState {
  ready: boolean;
  font: ReadingFont;
  setFont: (font: ReadingFont) => void;
}

const ReadingFontContext = createContext<ReadingFontState | null>(null);

export function ReadingFontProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [font, setFontState] = useState<ReadingFont>("sans");

  useEffect(() => {
    storage
      .get()
      .catch(() => null)
      .then((stored) => {
        if (stored === "serif") setFontState("serif");
        setReady(true);
      });
  }, []);

  const setFont = (next: ReadingFont) => {
    setFontState(next);
    void storage.set(next).catch(() => undefined);
  };

  return <ReadingFontContext value={{ ready, font, setFont }}>{children}</ReadingFontContext>;
}

export function useReadingFont() {
  const state = use(ReadingFontContext);
  if (!state) throw new Error("useReadingFont must be used within a ReadingFontProvider");
  return { ...state, family: readingFonts[state.font] };
}
