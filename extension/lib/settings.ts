import { browser } from "wxt/browser";

export interface Settings {
  /** API origin, e.g. http://localhost:8000 or https://notes.example.com */
  serverUrl: string;
  /** Where "Open in Note and Learn" links go, when it differs from the API (local dev: the Vite server). Empty = serverUrl. */
  appUrl: string;
  /** Personal API token from the web app (Settings > API tokens). Empty = the server has auth disabled (local dev). */
  apiToken: string;
  /** Pre-filled in the dialog, since captures tend to come in runs for one project. */
  lastProject: string;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: import.meta.env.WXT_SERVER_URL || "http://localhost:8000",
  appUrl: import.meta.env.WXT_APP_URL ?? "",
  apiToken: "",
  lastProject: "",
};

const SETTINGS_KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}
