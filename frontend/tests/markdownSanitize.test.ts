// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sanitizeHtml } from "@/markdown/sanitize";

describe("sanitizeHtml", () => {
  it("removes scripts, handlers and javascript links", () => {
    const html = sanitizeHtml(
      '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">b</a><img src=x onerror="y()">',
    );
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
  });

  it("keeps formulas, details, checkboxes and note links", () => {
    const uid = "b".repeat(32);
    const html = sanitizeHtml(
      `<span class="katex"><math><mi>x</mi></math></span><details><summary>s</summary>t</details><input type="checkbox" disabled checked><a href="note:${uid}">n</a><img data-attachment="${uid}">`,
    );
    expect(html).toContain("<math");
    expect(html).toContain("<details>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain(`note:${uid}`);
    expect(html).toContain("data-attachment");
  });

  it("allows video players and known embed hosts only", () => {
    const html = sanitizeHtml(
      '<video src="https://x.test/a.mp4" controls></video><iframe src="https://www.youtube-nocookie.com/embed/abcdefghijk"></iframe><iframe src="https://evil.test/x"></iframe>',
    );
    expect(html).toContain("<video");
    expect(html).toContain("youtube-nocookie");
    expect(html).not.toContain("evil.test");
  });

  it("drops other inputs, forms and styles", () => {
    const html = sanitizeHtml(
      '<form action="https://evil.test"><input type="text"><button>go</button></form><style>*{display:none}</style>',
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<style");
    expect(html).not.toContain('type="text"');
  });
});
