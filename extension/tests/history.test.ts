import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("wxt/browser", () => ({ browser: { storage: { local: storage } } }));

import { captureKey, previousCapture, rememberCapture } from "../lib/capture/history";

describe("browser-local capture history", () => {
  let data: Record<string, unknown>;
  beforeEach(() => {
    data = {};
    storage.get.mockImplementation(async () => data);
    storage.set.mockImplementation(async (next) => {
      Object.assign(data, next);
    });
  });

  it("ignores fragments and tracking parameters, but keeps meaningful query parameters", async () => {
    const key = await captureKey(
      "https://notes.test",
      "token",
      "https://example.com/post?utm_source=news#part",
    );
    expect(key).toBe(await captureKey("https://notes.test", "token", "https://example.com/post"));
    expect(key).not.toBe(
      await captureKey("https://notes.test", "token", "https://example.com/post?page=2"),
    );
    expect(await captureKey("https://notes.test", "token", "chrome://extensions")).toBeNull();
  });

  it("isolates deployments and credentials without storing tokens or URLs", async () => {
    const key = await captureKey(
      "https://notes.test",
      "secret-token",
      "https://example.com/private",
    );
    expect(key).not.toBe(
      await captureKey("https://other.test", "secret-token", "https://example.com/private"),
    );
    expect(key).not.toBe(
      await captureKey("https://notes.test", "other-token", "https://example.com/private"),
    );
    expect(await previousCapture(key)).toBeNull();
    await rememberCapture(key);
    expect(await previousCapture(key)).toEqual(expect.any(String));
    const stored = JSON.stringify(data);
    expect(stored).not.toContain("secret-token");
    expect(stored).not.toContain("example.com");
  });

  it("bounds history and serializes concurrent writes", async () => {
    data["capture-history-v1"] = Array.from({ length: 500 }, (_, i) => ({
      key: `old-${i}`,
      savedAt: "2026-01-01",
    }));
    await Promise.all([rememberCapture("one"), rememberCapture("two")]);
    expect(data["capture-history-v1"]).toHaveLength(500);
    expect(await previousCapture("one")).not.toBeNull();
    expect(await previousCapture("two")).not.toBeNull();
    await rememberCapture("one");
    expect(
      (data["capture-history-v1"] as { key: string }[]).filter((entry) => entry.key === "one"),
    ).toHaveLength(1);
  });

  it("recovers after a storage failure", async () => {
    storage.set.mockRejectedValueOnce(new Error("Full"));
    await expect(rememberCapture("one")).rejects.toThrow("Full");
    await rememberCapture("two");
    expect(await previousCapture("two")).not.toBeNull();
  });
});
