import { describe, expect, it } from "vitest";
import {
  fetchAllMedia,
  mediaLink,
  usedMedia,
  withoutMedia,
  type MediaItem,
} from "../lib/capture/media";

const item = (uid: string, alt: string, src: string): MediaItem => ({ uid, alt, src });
const a = item("a".repeat(32), "One", "https://cdn.test/one.png");
const b = item("b".repeat(32), "Two", "data:image/png;base64,AAAA");

describe("clip media", () => {
  it("finds the media a note still uses", () => {
    expect(usedMedia(`text ${mediaLink(a)}`, [a, b])).toEqual([a]);
  });

  it("falls back to remote links or alt text for media that was not saved", () => {
    const content = `${mediaLink(a)}\n${mediaLink(b)}`;
    expect(withoutMedia(content, [a, b], new Set())).toBe(
      "![One](https://cdn.test/one.png)\nTwo",
    );
    expect(withoutMedia(content, [a, b], new Set([a.uid]))).toBe(`${mediaLink(a)}\nTwo`);
  });

  it("downloads only real, small images and reports the rest as missing", async () => {
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const fake = (async (url: string) => {
      if (url.endsWith("one.png")) return new Response(png);
      if (url.endsWith("big.png"))
        return new Response(new Blob([new Uint8Array(11 * 1024 * 1024)], { type: "image/png" }));
      if (url.endsWith("page.html"))
        return new Response("<html>", { headers: { "content-type": "text/html" } });
      return new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;
    const items = [
      a,
      item("c".repeat(32), "Big", "https://cdn.test/big.png"),
      item("d".repeat(32), "Html", "https://cdn.test/page.html"),
      item("e".repeat(32), "Gone", "https://cdn.test/missing.png"),
    ];
    const got = await fetchAllMedia(items, fake);
    expect([...got.keys()]).toEqual([a.uid]);
    expect(got.get(a.uid)?.name).toBe("one.png");
  });
});
