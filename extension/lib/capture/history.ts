import { browser } from "wxt/browser";
import { cleanUrl } from "../url";

const KEY = "capture-history-v1";
const LIMIT = 500;
interface Entry {
  key: string;
  savedAt: string;
}

export async function captureKey(
  server: string,
  token: string,
  source: string,
): Promise<string | null> {
  try {
    const url = new URL(cleanUrl(source));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    const bytes = new TextEncoder().encode(JSON.stringify([server, token, url.href]));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
      "",
    );
  } catch {
    return null;
  }
}

async function entries(): Promise<Entry[]> {
  const stored = (await browser.storage.local.get(KEY))[KEY];
  if (!Array.isArray(stored)) return [];
  return stored
    .filter(
      (entry): entry is Entry =>
        typeof entry?.key === "string" && typeof entry?.savedAt === "string",
    )
    .slice(0, LIMIT);
}

export async function previousCapture(key: string | null): Promise<string | null> {
  return key ? ((await entries()).find((entry) => entry.key === key)?.savedAt ?? null) : null;
}

let pending = Promise.resolve();

export function rememberCapture(key: string | null): Promise<void> {
  if (!key) return Promise.resolve();
  const write = pending.then(async () => {
    const history = await entries();
    await browser.storage.local.set({
      [KEY]: [
        { key, savedAt: new Date().toISOString() },
        ...history.filter((entry) => entry.key !== key),
      ].slice(0, LIMIT),
    });
  });
  pending = write.catch(() => undefined);
  return write;
}
