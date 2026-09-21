import { describe, expect, it, vi } from "vitest";
import { CaptureError } from "../lib/api/types";
import type { Session } from "../lib/auth/firebase";
import { createAuthHeaderProvider, type SessionStore } from "../lib/auth/headers";

const NOW = 1_000_000_000_000;

function memoryStore(initial: Session | null): SessionStore & { current: Session | null } {
  const store = {
    current: initial,
    async get() {
      return store.current;
    },
    async set(s: Session | null) {
      store.current = s;
    },
  };
  return store;
}

const session = (over: Partial<Session> = {}): Session => ({
  email: "me@x.dev",
  idToken: "old-id",
  refreshToken: "refresh-1",
  expiresAt: NOW + 3_600_000,
  ...over,
});

function refreshFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("createAuthHeaderProvider", () => {
  it("sends no header when no API key is configured (auth-disabled dev server)", async () => {
    const headers = createAuthHeaderProvider({ getApiKey: async () => "", store: memoryStore(null) });
    await expect(headers()).resolves.toEqual({});
  });

  it("errors clearly when a key is set but nobody has signed in", async () => {
    const headers = createAuthHeaderProvider({ getApiKey: async () => "k", store: memoryStore(null) });
    await expect(headers()).rejects.toMatchObject({ kind: "auth", message: expect.stringContaining("Not signed in") });
  });

  it("uses a still-valid token without calling Firebase", async () => {
    const fetchImpl = refreshFetch({});
    const headers = createAuthHeaderProvider({ getApiKey: async () => "k", store: memoryStore(session()), fetch: fetchImpl, now: () => NOW });
    await expect(headers()).resolves.toEqual({ Authorization: "Bearer old-id" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes a token that is about to expire and stores the new one", async () => {
    const store = memoryStore(session({ expiresAt: NOW + 30_000 })); // inside the 60s skew
    const fetchImpl = refreshFetch({ id_token: "new-id", refresh_token: "refresh-2", expires_in: "3600" });
    const headers = createAuthHeaderProvider({ getApiKey: async () => "k", store, fetch: fetchImpl, now: () => NOW });
    await expect(headers()).resolves.toEqual({ Authorization: "Bearer new-id" });
    expect(store.current).toMatchObject({ idToken: "new-id", refreshToken: "refresh-2", email: "me@x.dev", expiresAt: NOW + 3_600_000 });
  });

  it("refreshes on demand even if the token looks valid (forceRefresh after a 401)", async () => {
    const fetchImpl = refreshFetch({ id_token: "forced", refresh_token: "r", expires_in: "3600" });
    const headers = createAuthHeaderProvider({ getApiKey: async () => "k", store: memoryStore(session()), fetch: fetchImpl, now: () => NOW });
    await expect(headers({ forceRefresh: true })).resolves.toEqual({ Authorization: "Bearer forced" });
  });

  it("shares one refresh between concurrent callers", async () => {
    const fetchImpl = refreshFetch({ id_token: "shared", refresh_token: "r", expires_in: "3600" });
    const headers = createAuthHeaderProvider({ getApiKey: async () => "k", store: memoryStore(session({ expiresAt: NOW })), fetch: fetchImpl, now: () => NOW });
    const results = await Promise.all([headers(), headers(), headers()]);
    expect(results.every((r) => r.Authorization === "Bearer shared")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("clears the session when the refresh token is rejected, so the user is asked to sign in again", async () => {
    const store = memoryStore(session({ expiresAt: NOW }));
    const fetchImpl = refreshFetch({ error: { message: "TOKEN_EXPIRED" } }, 400);
    const headers = createAuthHeaderProvider({ getApiKey: async () => "k", store, fetch: fetchImpl, now: () => NOW });
    await expect(headers()).rejects.toBeInstanceOf(CaptureError);
    expect(store.current).toBeNull();
  });

  it("keeps the session on a network failure (the token may be fine; the network isn't)", async () => {
    const store = memoryStore(session({ expiresAt: NOW }));
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("offline")) as unknown as typeof fetch;
    const headers = createAuthHeaderProvider({ getApiKey: async () => "k", store, fetch: fetchImpl, now: () => NOW });
    await expect(headers()).rejects.toMatchObject({ kind: "network" });
    expect(store.current).not.toBeNull();
  });
});
