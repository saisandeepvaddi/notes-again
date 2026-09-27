import { describe, expect, it } from "vitest";
import { cleanUrl, hostPermissionPattern, normalizeBaseUrl, noteUrl } from "../lib/url";

describe("cleanUrl", () => {
  it("strips tracking params but keeps meaningful ones and the hash", () => {
    expect(cleanUrl("https://example.com/post?id=7&utm_source=x&fbclid=abc&utm_medium=y#part")).toBe(
      "https://example.com/post?id=7#part",
    );
  });

  it("leaves a clean URL alone", () => {
    expect(cleanUrl("https://example.com/a/b")).toBe("https://example.com/a/b");
  });

  it("returns unparseable input trimmed rather than throwing", () => {
    expect(cleanUrl("  not a url ")).toBe("not a url");
  });
});

describe("normalizeBaseUrl", () => {
  it.each([
    ["http://localhost:8000/", "http://localhost:8000"],
    ["localhost:8000", "http://localhost:8000"],
    ["https://notes.example.com/some/path?q=1", "https://notes.example.com"],
    ["  https://notes.example.com  ", "https://notes.example.com"],
    ["notes.example.com", "https://notes.example.com"],
    ["127.0.0.1:8765", "http://127.0.0.1:8765"],
    ["http://192.168.1.11:8000", "http://192.168.1.11:8000"],
    ["http://10.0.0.5", "http://10.0.0.5"],
    ["http://172.20.0.1:8000", "http://172.20.0.1:8000"],
    ["http://nas.local:8000", "http://nas.local:8000"],
    ["http://[::1]:8000", "http://[::1]:8000"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });

  it("rejects empty, non-http and malformed input", () => {
    expect(() => normalizeBaseUrl("  ")).toThrow(/Enter a URL/);
    expect(() => normalizeBaseUrl("ftp://example.com")).toThrow(/http/);
    expect(() => normalizeBaseUrl("http://")).toThrow(/not a valid URL/);
  });

  it("refuses plain http to a public host, since the API token would travel unencrypted", () => {
    expect(() => normalizeBaseUrl("http://notes.example.com")).toThrow(/Use https/);
    expect(() => normalizeBaseUrl("http://8.8.8.8")).toThrow(/Use https/);
    expect(() => normalizeBaseUrl("http://172.32.0.1")).toThrow(/Use https/);
    expect(() => normalizeBaseUrl("http://192.169.1.1")).toThrow(/Use https/);
  });
});

describe("hostPermissionPattern / noteUrl", () => {
  it("drops the port from the permission pattern", () => {
    expect(hostPermissionPattern("http://localhost:8000")).toBe("http://localhost/*");
    expect(hostPermissionPattern("https://notes.example.com")).toBe("https://notes.example.com/*");
  });

  it("prefers the app URL and falls back to the server URL", () => {
    expect(noteUrl("http://localhost:5273/", "http://localhost:8000", 12)).toBe("http://localhost:5273/notes/12");
    expect(noteUrl("", "https://notes.example.com", 3)).toBe("https://notes.example.com/notes/3");
  });
});
