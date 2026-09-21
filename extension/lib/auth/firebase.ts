import { CaptureError } from "../api/types";

/**
 * Firebase email/password auth over its public REST API, so the extension
 * needs no Firebase SDK (and no DOM/IndexedDB, which a service worker lacks).
 * Only the refresh token is long-lived; the password is never stored.
 */
export interface Session {
  email: string;
  idToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface FirebaseDeps {
  apiKey: string;
  fetch?: typeof fetch;
  now?: () => number;
}

const SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
const REFRESH_URL = "https://securetoken.googleapis.com/v1/token";
const EXPIRY_SKEW_MS = 60_000;

const FRIENDLY: Record<string, string> = {
  EMAIL_NOT_FOUND: "Wrong email or password.",
  INVALID_PASSWORD: "Wrong email or password.",
  INVALID_LOGIN_CREDENTIALS: "Wrong email or password.",
  USER_DISABLED: "This account has been disabled.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Wait a bit and try again.",
  API_KEY_INVALID: "The Firebase API key is invalid.",
  TOKEN_EXPIRED: "Your session expired. Sign in again.",
  INVALID_REFRESH_TOKEN: "Your session expired. Sign in again.",
  USER_NOT_FOUND: "Your session expired. Sign in again.",
};

async function firebaseError(response: Response): Promise<CaptureError> {
  const body: unknown = await response.json().catch(() => null);
  const raw =
    typeof body === "object" && body !== null && "error" in body
      ? String((body as { error: { message?: unknown } }).error?.message ?? "")
      : "";
  // Messages can carry a suffix: "TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been..."
  const code = raw.split(/[\s:]/)[0] ?? "";
  return new CaptureError("auth", FRIENDLY[code] ?? (raw || `Sign-in failed (${response.status}).`), response.status);
}

export const isFresh = (session: Session, now: number) => session.expiresAt - EXPIRY_SKEW_MS > now;

export async function signInWithPassword(deps: FirebaseDeps, email: string, password: string): Promise<Session> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const response = await doFetch(`${SIGN_IN_URL}?key=${encodeURIComponent(deps.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).catch(() => {
    throw new CaptureError("network", "Couldn't reach Firebase. Check your connection.");
  });
  if (!response.ok) {
    throw await firebaseError(response);
  }
  const data = (await response.json()) as { idToken: string; refreshToken: string; expiresIn: string; email: string };
  return {
    email: data.email,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: now() + Number(data.expiresIn) * 1000,
  };
}

export async function refreshSession(deps: FirebaseDeps, session: Session): Promise<Session> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;
  const response = await doFetch(`${REFRESH_URL}?key=${encodeURIComponent(deps.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }),
  }).catch(() => {
    throw new CaptureError("network", "Couldn't reach Firebase. Check your connection.");
  });
  if (!response.ok) {
    throw await firebaseError(response);
  }
  const data = (await response.json()) as { id_token: string; refresh_token: string; expires_in: string };
  return {
    email: session.email,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresAt: now() + Number(data.expires_in) * 1000,
  };
}
