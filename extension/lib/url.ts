const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_eid|igshid|_hsenc|_hsmi)$/i;

/** Strips well-known tracking params so the saved link is the clean one. */
export function cleanUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim();
  }
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

/**
 * Validates and normalises a user-entered server URL to `scheme://host[:port]`
 * (no path, no trailing slash). A bare `localhost:8000` gets `http://`.
 */
export function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a URL.");
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`"${input}" is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  return url.origin;
}

/**
 * Match pattern for `permissions.request`. Ports are left out on purpose:
 * `http://localhost/*` covers any port in both Chrome and Firefox.
 */
export function hostPermissionPattern(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.hostname}/*`;
}

/** Where "Open in Note and Learn" points. `appUrl` differs from the API in local dev (Vite vs. FastAPI). */
export function noteUrl(appUrl: string, serverUrl: string, noteId: number): string {
  const base = appUrl.trim() || serverUrl;
  return `${base.replace(/\/+$/, "")}/notes/${noteId}`;
}

/**
 * Origins the extension talks to for sign-in. Chrome grants these at install;
 * Firefox MV3 treats every host permission as opt-in, so they're requested
 * alongside the server's when the user saves settings.
 */
export const FIREBASE_ORIGINS = ["https://identitytoolkit.googleapis.com/*", "https://securetoken.googleapis.com/*"];
