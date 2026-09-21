// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractPageInfo, truncate } from "../lib/capture/extract";

function page(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const LONG = "This paragraph is comfortably longer than the minimum so it counts as real article content.";

describe("extractPageInfo", () => {
  it("prefers the og:description over paragraphs", () => {
    const doc = page(`<title>Post</title><meta property="og:description" content="The og summary">
      <body><article><p>${LONG}</p></article></body>`);
    expect(extractPageInfo(doc)).toEqual({ title: "Post", excerpt: "The og summary" });
  });

  it("falls back to the meta description", () => {
    const doc = page(`<title>Post</title><meta name="description" content="Meta summary"><body></body>`);
    expect(extractPageInfo(doc).excerpt).toBe("Meta summary");
  });

  it("falls back to the first substantial paragraph, skipping short ones and boilerplate", () => {
    const doc = page(`<title>Post</title><body>
      <header><p>${LONG} (in the header)</p></header>
      <main><p>Short.</p><p>${LONG}</p></main></body>`);
    expect(extractPageInfo(doc).excerpt).toBe(LONG);
  });

  it("adds the h1 when it says something the title doesn't", () => {
    const doc = page(`<title>Acme Blog</title><meta name="description" content="Desc"><body><h1>How we cut build times</h1></body>`);
    expect(extractPageInfo(doc).excerpt).toBe("How we cut build times\n\nDesc");
  });

  it("omits the h1 when it just repeats the title", () => {
    const doc = page(`<title>How we cut build times | Acme</title><meta name="description" content="Desc"><body><h1>How we cut build times</h1></body>`);
    expect(extractPageInfo(doc).excerpt).toBe("Desc");
  });

  it("returns an empty excerpt for a bare page so the note is just the URL", () => {
    expect(extractPageInfo(page(`<title>Bare</title><body><p>hi</p></body>`))).toEqual({ title: "Bare", excerpt: "" });
  });

  it("uses og:title when <title> is missing", () => {
    expect(extractPageInfo(page(`<meta property="og:title" content="OG name"><body></body>`)).title).toBe("OG name");
  });
});

describe("truncate", () => {
  it("leaves short text alone and cuts long text at a word boundary with an ellipsis", () => {
    expect(truncate("short", 20)).toBe("short");
    const out = truncate("the quick brown fox jumps over the lazy dog", 20);
    expect(out).toBe("the quick brown fox…");
    expect(out.length).toBeLessThanOrEqual(21);
  });
});
