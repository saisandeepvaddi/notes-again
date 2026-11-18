// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { htmlToMarkdown, looksLikeMarkdown } from "@/markdown/htmlToMarkdown";

describe("htmlToMarkdown", () => {
  it("keeps headings, lists, links, tables and code", () => {
    const md = htmlToMarkdown(
      '<h2>Title</h2><ul><li>one</li><li>two</li></ul><p><a href="https://e.test">link</a> and <strong>bold</strong></p><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table><pre><code class="language-ts">const a = 1;</code></pre>',
    );
    expect(md).toContain("## Title");
    expect(md).toContain("-   one");
    expect(md).toContain("[link](https://e.test)");
    expect(md).toContain("**bold**");
    expect(md).toContain("| a | b |");
    expect(md).toContain("```ts\nconst a = 1;\n```");
  });

  it("drops scripts, styles and javascript links", () => {
    const md = htmlToMarkdown(
      '<style>p{}</style><script>alert(1)</script><p>hi <a href="javascript:alert(1)">x</a></p>',
    );
    expect(md).not.toContain("alert");
    expect(md).not.toContain("javascript");
    expect(md).toContain("hi");
  });
});

describe("looksLikeMarkdown", () => {
  it("accepts multi-line Markdown and rejects plain prose and single lines", () => {
    expect(looksLikeMarkdown("# Title\n\ntext")).toBe(true);
    expect(looksLikeMarkdown("- a\n- b")).toBe(true);
    expect(looksLikeMarkdown("just a sentence\nand another")).toBe(false);
    expect(looksLikeMarkdown("# one line")).toBe(false);
  });
});
