import { describe, expect, it } from "vitest";
import { createMarkdown } from "@/markdown/render";

const md = createMarkdown();
const render = (text: string) => md.renderAsync(text);

describe("markdown renderer", () => {
  it("renders inline and block math with KaTeX", async () => {
    const html = await render("Euler: $e^{i\\pi}+1=0$\n\n$$\n\\int_0^1 x^2\\,dx = \\tfrac13\n$$\n");
    expect(html).toContain("katex");
    expect(html).toContain("katex-display");
  });

  it("keeps a malformed formula visible instead of throwing", async () => {
    const html = await render("$\\frac{1}$ and $\\badmacro$");
    expect(html).toContain("katex");
  });

  it("renders task lists, footnotes, alerts and highlights", async () => {
    const html = await render(
      "- [x] done\n- [ ] todo\n\nText[^1] ==marked==\n\n[^1]: Note.\n\n> [!WARNING]\n> careful\n",
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("footnote");
    expect(html).toContain("markdown-alert");
    expect(html).toContain("<mark>");
  });

  it("marks mermaid fences for client rendering and still highlights code", async () => {
    const html = await render("```mermaid\ngraph TD; A-->B\n```\n\n```ts\nconst a = 1;\n```\n");
    expect(html).toContain('class="mermaid-block"');
    expect(html).toContain("graph TD; A--&gt;B");
    expect(html).toContain("shiki");
  });

  it("turns media links into players and embeds", async () => {
    const html = await render(
      "![clip](https://x.test/a.mp4)\n\n![song](https://x.test/a.mp3)\n\n![talk](https://youtu.be/dQw4w9WgXcQ)\n\n![pic](https://x.test/a.png)",
    );
    expect(html).toContain("<video");
    expect(html).toContain("<audio");
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).toContain('<img src="https://x.test/a.png"');
  });

  it("keeps attachment and note links resolvable", async () => {
    const uid = "a".repeat(32);
    const html = await render(`![p](attachment:${uid}) [n](note:${uid}) [e](https://e.test)`);
    expect(html).toContain(`data-attachment="${uid}"`);
    expect(html).toContain(`data-note-link="${uid}"`);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("passes raw HTML through so the sanitizer can decide", async () => {
    const html = await render("<details><summary>More</summary>\n\nHidden **text**\n\n</details>");
    expect(html).toContain("<details>");
    expect(html).toContain("<strong>text</strong>");
  });
});
