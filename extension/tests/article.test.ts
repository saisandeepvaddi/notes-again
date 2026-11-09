// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { extractArticle } from "../lib/capture/article";

const prose =
  "A readable article needs substantial prose, with useful ideas and details. This paragraph describes how a personal knowledge system can preserve writing for later use, while keeping capture simple and understandable. ".repeat(
    4,
  );
const page = (body: string) =>
  new DOMParser().parseFromString(
    `<html><head><title>Useful article</title><meta name="author" content="Jane Writer"><meta property="article:published_time" content="2026-10-01T09:00:00Z"><meta property="og:site_name" content="Example Journal"></head><body><nav>Navigation menu</nav><article><h1>Useful article</h1><p>${prose}</p>${body}</article><footer>Footer links</footer></body></html>`,
    "text/html",
  );

function markdown(doc: Document): string {
  const result = extractArticle(doc, "https://example.com/posts/article");
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.reason);
  return result.article.markdown;
}

describe("readable article extraction", () => {
  it("preserves prose, headings, lists, emphasis, quotes and absolute links without changing the live page", () => {
    const doc = page(
      '<h2>Details</h2><p><strong>Important</strong> and <em>useful</em> <a href="../next?q=1">next steps</a>.</p><ul><li>First point</li><li>Second point</li></ul><blockquote>A memorable quotation</blockquote>',
    );
    const before = doc.documentElement.outerHTML;
    const result = markdown(doc);
    expect(result).toContain("## Details");
    expect(result).toContain("**Important**");
    expect(result).toContain("[next steps](https://example.com/next?q=1)");
    expect(result).toMatch(/-\s+First point/);
    expect(result).toContain("> A memorable quotation");
    expect(result).not.toContain("Navigation menu");
    expect(result).not.toContain("Footer links");
    expect(doc.documentElement.outerHTML).toBe(before);
  });

  it("preserves code whitespace and uses a fence longer than embedded backticks", () => {
    const result = markdown(
      page(
        '<pre><code class="language-js">function example() {\n  return `text with ``` fences`;\n}\n</code></pre>',
      ),
    );
    expect(result).toContain(
      "````js\nfunction example() {\n  return `text with ``` fences`;\n}\n````",
    );
  });

  it("preserves preformatted code without a code element", () => {
    expect(
      markdown(page('<pre class="language-python">def example():\n    return True</pre>')),
    ).toContain("```python\ndef example():\n    return True\n```");
  });

  it("converts tables with or without headers to Markdown and escapes cell pipes", () => {
    const result = markdown(
      page(
        "<table><tr><th>Name</th><th>Value</th></tr><tr><td>A | B</td><td><strong>Two</strong></td></tr></table><table><tr><td>First</td><td>Second</td></tr></table>",
      ),
    );
    expect(result).toContain("| Name | Value |\n| --- | --- |");
    expect(result).toContain("A \\| B");
    expect(result).toContain("**Two**");
    expect(result).toContain("| First | Second |");
    expect(result).not.toContain("<table");
  });

  it("strips active content, unsafe URLs and tracking images", () => {
    const doc = page(
      '<script>evil()</script><iframe src="https://tracker.test"></iframe><form>Secret form data</form><p hidden>Hidden secret</p><p><a href="javascript:alert(1)">Bad link</a><a href="data:text/html,evil">Data link</a><a href="file:///etc/passwd">File link</a><a href="/safe" onclick="evil()">Safe</a><img src="https://tracker.test/pixel" onerror="evil()" alt="An illustration"></p>',
    );
    const result = markdown(doc);
    for (const forbidden of [
      "evil()",
      "javascript:",
      "data:",
      "file:",
      "tracker.test",
      "Secret form data",
      "Hidden secret",
      "<script",
      "onclick",
    ]) {
      expect(result).not.toContain(forbidden);
    }
    expect(result).toContain("An illustration");
    expect(result).toContain("[Safe](https://example.com/safe)");
  });

  it("collects author, publication time and site name", () => {
    const result = extractArticle(page(""), "https://example.com/posts/article");
    expect(result).toMatchObject({
      ok: true,
      article: {
        author: "Jane Writer",
        publishedAt: "2026-10-01T09:00:00.000Z",
        siteName: "Example Journal",
      },
    });
  });

  it("escapes encoded HTML prose instead of recreating active Markdown HTML", () => {
    const result = markdown(page("<p>&lt;img src=x onerror=alert(1)&gt;</p>"));
    expect(result).not.toContain("<img");
    expect(result).toContain("&lt;img");
  });

  it("explains fallback on empty, restricted, oversized and failed pages", () => {
    const doc = new DOMParser().parseFromString("<p>Sign in to read</p>", "text/html");
    expect(extractArticle(doc, "https://example.com")).toMatchObject({ ok: false });
    expect(extractArticle(doc, "chrome://extensions")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("web pages"),
    });
    doc.body.textContent = "x".repeat(2_000_001);
    expect(extractArticle(doc, "https://example.com")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("too large"),
    });
    expect(extractArticle(doc, "not a URL")).toMatchObject({ ok: false });
  });
});
