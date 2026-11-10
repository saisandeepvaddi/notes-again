import { beforeEach, describe, expect, it, vi } from "vitest";

const good = { provider: "openai", model: "gpt-x", apiKey: "sk-123" } as const;

async function fresh() {
  vi.resetModules();
  return import("../src/discussion/credentials");
}

describe("credentials store", () => {
  beforeEach(() => vi.resetModules());

  it("starts without a key and never touches the vault before initialization", async () => {
    const load = vi.fn();
    const store = await fresh();
    expect(store.credentialSnapshot().ready).toBe(false);
    expect(store.credentialSnapshot().config.apiKey).toBe("");
    expect(load).not.toHaveBeenCalled();
  });

  it("loads a remembered key from the vault", async () => {
    const store = await fresh();
    await store.initializeCredentials({
      load: async () => JSON.stringify(good),
      save: vi.fn(),
      clear: vi.fn(),
    });
    expect(store.credentialSnapshot()).toMatchObject({
      ready: true,
      remembered: true,
      config: good,
    });
  });

  it("reports unreadable or invalid vault data without exposing it", async () => {
    for (const raw of ["{not json", JSON.stringify({ ...good, apiKey: "bad key" })]) {
      const store = await fresh();
      await store.initializeCredentials({ load: async () => raw, save: vi.fn(), clear: vi.fn() });
      const snapshot = store.credentialSnapshot();
      expect(snapshot.ready).toBe(true);
      expect(snapshot.config.apiKey).toBe("");
      expect(snapshot.error).not.toContain("sk-");
    }
  });

  it("reports a throwing vault as an error state", async () => {
    const store = await fresh();
    await store.initializeCredentials({
      load: async () => {
        throw new Error("locked");
      },
      save: vi.fn(),
      clear: vi.fn(),
    });
    expect(store.credentialSnapshot().error).toMatch(/Could not read/);
  });

  it("keeps session-only keys in memory and clears the vault", async () => {
    const clear = vi.fn(async () => undefined);
    const save = vi.fn(async () => undefined);
    const store = await fresh();
    await store.initializeCredentials({ load: async () => null, save, clear });
    await store.saveCredentials(good, false);
    expect(save).not.toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(store.credentialSnapshot()).toMatchObject({ remembered: false, config: good });
  });

  it("refuses to remember without a vault and keeps the old state on vault failure", async () => {
    const store = await fresh();
    await store.initializeCredentials(null);
    await expect(store.saveCredentials(good, true)).rejects.toThrow(/unavailable/);
    expect(store.credentialSnapshot().config.apiKey).toBe("");

    const failing = await fresh();
    await failing.initializeCredentials({
      load: async () => null,
      save: async () => {
        throw new Error("denied");
      },
      clear: vi.fn(),
    });
    await expect(failing.saveCredentials(good, true)).rejects.toThrow();
    expect(failing.credentialSnapshot().config.apiKey).toBe("");
  });

  it("validates before saving and forgets everywhere", async () => {
    const clear = vi.fn(async () => undefined);
    const store = await fresh();
    await store.initializeCredentials({
      load: async () => JSON.stringify(good),
      save: vi.fn(),
      clear,
    });
    await expect(store.saveCredentials({ ...good, apiKey: "has space" }, true)).rejects.toThrow();
    await store.forgetCredentials();
    expect(clear).toHaveBeenCalled();
    expect(store.credentialSnapshot()).toMatchObject({ remembered: false, config: { apiKey: "" } });
  });
});
