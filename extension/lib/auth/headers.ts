import { CaptureError } from "../api/types";
import type { AuthHeaders } from "../api/existingRoutes";
import { isFresh, refreshSession, type Session } from "./firebase";

export interface SessionStore {
  get(): Promise<Session | null>;
  set(session: Session | null): Promise<void>;
}

export interface HeaderProviderDeps {
  /** Read on every call so changing the key in Options takes effect immediately. */
  getApiKey: () => Promise<string>;
  store: SessionStore;
  fetch?: typeof fetch;
  now?: () => number;
}

/**
 * Produces `Authorization` headers, refreshing the Firebase ID token when it's
 * about to expire. With no API key configured it sends nothing, which is what
 * a local backend running with AUTH_DISABLED=1 expects.
 *
 * Concurrent callers share one in-flight refresh: Firebase rotates refresh
 * tokens' validity windows, and two parallel refreshes are wasteful at best.
 */
export function createAuthHeaderProvider(deps: HeaderProviderDeps): AuthHeaders {
  const now = deps.now ?? Date.now;
  let inflight: Promise<Session> | null = null;

  async function refresh(apiKey: string, session: Session): Promise<Session> {
    try {
      const next = await refreshSession({ apiKey, fetch: deps.fetch, now }, session);
      await deps.store.set(next);
      return next;
    } catch (err) {
      // A dead refresh token can't recover by retrying; make the user sign in again.
      if (err instanceof CaptureError && err.kind === "auth") {
        await deps.store.set(null);
      }
      throw err;
    }
  }

  return async ({ forceRefresh = false } = {}): Promise<Record<string, string>> => {
    const apiKey = (await deps.getApiKey()).trim();
    if (!apiKey) {
      return {};
    }
    let session = await deps.store.get();
    if (!session) {
      throw new CaptureError("auth", "Not signed in. Open the extension options and sign in.");
    }
    if (forceRefresh || !isFresh(session, now())) {
      const current = session;
      inflight ??= refresh(apiKey, current).finally(() => {
        inflight = null;
      });
      session = await inflight;
    }
    return { Authorization: `Bearer ${session.idToken}` };
  };
}
