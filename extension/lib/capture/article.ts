import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import type { ArticleResult } from "./types";

const MAX_ELEMENTS = 30_000;
const MAX_MARKUP = 2_000_000;
const OMIT =
  "script, style, noscript, iframe, object, embed, form, input, button, textarea, select, svg, canvas, video, audio, [hidden], [aria-hidden='true'], notes-again-capture";
const TAGS = [
  "article",
  "main",
  "section",
  "div",
  "span",
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "strong",
  "b",
  "em",
  "i",
  "del",
  "s",
  "a",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "img",
  "figure",
  "figcaption",
  "sup",
  "sub",
];

const text = (value: string | null | undefined) =>
  value?.replace(/\s+/g, " ").trim().slice(0, 500) || undefined;

export function extractArticle(doc: Document, sourceUrl: string): ArticleResult {
  const unavailable = (reason: string): ArticleResult => ({ ok: false, reason });
  try {
    if (!/^https?:$/.test(new URL(sourceUrl).protocol)) {
      return unavailable(
        "Readable articles are available on web pages only. Use Link only or Selection.",
      );
    }
    if (
      doc.getElementsByTagName("*").length > MAX_ELEMENTS ||
      (doc.documentElement?.outerHTML.length ?? 0) > MAX_MARKUP
    ) {
      return unavailable(
        "This page is too large to extract safely. Use Link only or capture a selection.",
      );
    }
    const copy = doc.cloneNode(true) as Document;
    const base = copy.createElement("base");
    base.href = new URL(
      copy.querySelector("base[href]")?.getAttribute("href") ?? sourceUrl,
      sourceUrl,
    ).href;
    copy.querySelectorAll("base").forEach((node) => node.remove());
    copy.head.prepend(base);
    copy.querySelectorAll(OMIT).forEach((node) => node.remove());
    const parsed = new Readability(copy, {
      maxElemsToParse: MAX_ELEMENTS,
      charThreshold: 200,
      keepClasses: true,
    }).parse();
    if (!parsed?.content || (parsed.textContent?.trim().length ?? 0) < 200) {
      return unavailable(
        "No readable article was found. Use Link only or select the text you want to keep.",
      );
    }
    const clean = DOMPurify.sanitize(parsed.content, {
      ALLOWED_TAGS: TAGS,
      ALLOWED_ATTR: ["href", "title", "alt", "class", "start", "colspan", "rowspan"],
      ALLOW_DATA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    });
    for (const link of clean.querySelectorAll("a[href]")) {
      try {
        const url = new URL(link.getAttribute("href")!, sourceUrl);
        if (["https:", "http:", "mailto:"].includes(url.protocol)) {
          link.setAttribute("href", url.href);
        } else {
          link.removeAttribute("href");
        }
      } catch {
        link.removeAttribute("href");
      }
    }
    const converter = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    const escape = converter.escape.bind(converter);
    converter.escape = (value) => escape(value).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    converter.addRule("strikethrough", {
      filter: ["del", "s"],
      replacement: (content) => `~~${content}~~`,
    });
    converter.addRule("table", {
      filter: "table",
      replacement: (_content, node) => {
        const rows = Array.from((node as HTMLTableElement).rows, (row) =>
          Array.from(row.cells, (cell) =>
            converter.turndown(cell.innerHTML).replace(/\|/g, "\\|").replace(/\n+/g, " "),
          ),
        );
        if (!rows.length) return "";
        const width = Math.max(...rows.map((row) => row.length));
        const line = (cells: string[]) =>
          `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
        const hasHeader = !!(node as HTMLTableElement).rows[0]?.querySelector("th");
        const heading = hasHeader ? rows.shift()! : Array<string>(width).fill("");
        return `\n\n${[line(heading), line(Array<string>(width).fill("---")), ...rows.map(line)].join("\n")}\n\n`;
      },
    });
    converter.addRule("imageText", {
      filter: "img",
      replacement: (_content, node) =>
        converter.escape((node as HTMLElement).getAttribute("alt") ?? ""),
    });
    converter.addRule("codeFence", {
      filter: "pre",
      replacement: (_content, node) => {
        const code = (node as HTMLElement).querySelector("code") ?? (node as HTMLElement);
        const value = code.textContent ?? "";
        const language = /(?:language|lang)-([\w+-]+)/.exec(code.className)?.[1] ?? "";
        let longest = 2;
        for (const match of value.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
        const fence = "`".repeat(longest + 1);
        return `\n\n${fence}${language}\n${value.replace(/\n$/, "")}\n${fence}\n\n`;
      },
    });
    const markdown = converter.turndown(clean).trim();
    if (!markdown)
      return unavailable("The article was empty after cleanup. Use Link only or Selection.");
    const published = parsed.publishedTime;
    return {
      ok: true,
      article: {
        title: text(parsed.title) ?? "",
        markdown,
        author: text(parsed.byline),
        siteName: text(parsed.siteName),
        publishedAt:
          published && Number.isFinite(Date.parse(published))
            ? new Date(published).toISOString()
            : undefined,
      },
    };
  } catch {
    return unavailable(
      "This page could not be extracted. Use Link only or Selection; no article has been saved.",
    );
  }
}
