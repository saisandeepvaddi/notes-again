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
 * Hosts where plain http:// is acceptable: this machine and private networks
 * (local dev, a home server on the LAN). Anything else must use https, since
 * the API token rides along on every request.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1") {
    return true;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) {
    return false;
  }
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
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
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const parse = (value: string) => {
    try {
      return new URL(value);
    } catch {
      throw new Error(`"${input}" is not a valid URL.`);
    }
  };
  // A bare host gets https, except on this machine / a private network where dev servers are plain http.
  let url = parse(hasScheme ? trimmed : `https://${trimmed}`);
  if (!hasScheme && isPrivateHost(url.hostname)) {
    url = parse(`http://${trimmed}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  if (url.protocol === "http:" && !isPrivateHost(url.hostname)) {
    throw new Error(`Use https:// for ${url.hostname}. Your API token would otherwise be sent unencrypted.`);
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
