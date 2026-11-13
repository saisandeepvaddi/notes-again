import { describe, expect, it } from "vitest";
import { buildDraft, normalizeSelection } from "../lib/capture/draft";

describe("buildDraft", () => {
  it("link only ignores the page excerpt; name is the title", () => {
    expect(
      buildDraft({ mode: "page", url: "https://a.dev/x", title: "  A post ", excerpt: "Summary." }),
    ).toEqual({
      name: "A post",
      content: "https://a.dev/x",
    });
  });

  it("page with no excerpt: the URL alone", () => {
    expect(
      buildDraft({ mode: "page", url: "https://a.dev/x", title: "A post", excerpt: "" }).content,
    ).toBe("https://a.dev/x");
  });

  it("falls back to the URL as the name when there is no title", () => {
    expect(buildDraft({ mode: "page", url: "https://a.dev/x", title: "" }).name).toBe(
      "https://a.dev/x",
    );
  });

  it("selection: URL first, then the selection", () => {
    expect(
      buildDraft({
        mode: "selection",
        url: "https://a.dev/x",
        title: "A post",
        selection: "quoted text",
      }).content,
    ).toBe("https://a.dev/x\n\nquoted text");
  });

  it("selection mode ignores any page excerpt", () => {
    expect(
      buildDraft({
        mode: "selection",
        url: "https://a.dev/x",
        title: "T",
        selection: "s",
        excerpt: "not this",
      }).content,
    ).toBe("https://a.dev/x\n\ns");
  });

  it("never returns an empty name", () => {
    expect(buildDraft({ mode: "page", url: "", title: "" }).name).toBe("Untitled");
  });

  it("captures article Markdown and portable source metadata", () => {
    const result = buildDraft(
      {
        mode: "page",
        url: "https://a.dev/x",
        title: "Page",
        capturedAt: "2026-11-09T12:00:00.000Z",
        article: {
          ok: true,
          article: {
            title: "Article",
            media: [], markdown: "## Heading\n\nBody",
            author: 'A: "writer"\n---',
            siteName: "Site",
            publishedAt: "2026-10-01T00:00:00.000Z",
          },
        },
      },
      "article",
    );
    expect(result.name).toBe("Article");
    expect(result.content).toContain('source_url: "https://a.dev/x"');
    expect(result.content).toContain('captured_at: "2026-11-09T12:00:00.000Z"');
    expect(result.content).toContain('source_author: "A: \\"writer\\"\\n---"');
    expect(result.content).toContain('source_site: "Site"');
    expect(result.content).toContain('source_published_at: "2026-10-01T00:00:00.000Z"');
    expect(result.content).toMatch(/## Heading\n\nBody$/);
  });
});

describe("normalizeSelection", () => {
  it("normalises NBSP, CRLF, trailing spaces and runaway blank lines", () => {
    expect(normalizeSelection("  a b  \r\nline two \n\n\n\n\nline three\n")).toBe(
      "a b\nline two\n\nline three",
    );
  });
});
