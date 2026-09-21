import { browser } from "wxt/browser";
import type { Session } from "./auth/firebase";
import type { SessionStore } from "./auth/headers";

export interface Settings {
  /** API origin, e.g. http://localhost:8000 or https://notes.example.com */
  serverUrl: string;
  /** Where "Open in Note and Learn" links go, when it differs from the API (local dev: the Vite server). Empty = serverUrl. */
  appUrl: string;
  /** Firebase web API key. Empty = the server has auth disabled (local dev). */
  firebaseApiKey: string;
  /** Pre-filled in the dialog, since captures tend to come in runs for one project. */
  lastProject: string;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: "http://localhost:8000",
  appUrl: "",
  firebaseApiKey: import.meta.env.WXT_FIREBASE_API_KEY ?? "",
  lastProject: "",
};

const SETTINGS_KEY = "settings";
const SESSION_KEY = "session";

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export const sessionStore: SessionStore = {
  async get() {
    const stored = await browser.storage.local.get(SESSION_KEY);
    return (stored[SESSION_KEY] as Session | undefined) ?? null;
  },
  async set(session) {
    if (session) {
      await browser.storage.local.set({ [SESSION_KEY]: session });
    } else {
      await browser.storage.local.remove(SESSION_KEY);
    }
  },
};
