import { browser } from "wxt/browser";

export interface Settings {
  serverUrl: string;
  appUrl: string;
  apiToken: string;
  lastProject: string;
  lastNoteOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: import.meta.env.WXT_SERVER_URL || "http://localhost:8000",
  appUrl: import.meta.env.WXT_APP_URL ?? "",
  apiToken: "",
  lastProject: "",
  lastNoteOnly: false,
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
