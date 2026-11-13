import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { bestImageUrl, isTinyImage, MAX_MEDIA, newMediaUid, type MediaItem } from "./media";
import type { ArticleResult } from "./types";

const MAX_ELEMENTS = 30_000;
const MAX_MARKUP = 2_000_000;
const OMIT =
  "script, style, noscript, object, embed, form, input, button, textarea, select, svg, canvas, [hidden], [aria-hidden='true'], notes-again-capture";
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

function mediaNoun(node: Element) {
  return node.tagName === "IFRAME" ? "Embedded content" : node.tagName === "AUDIO" ? "Audio" : "Video";
}

function prepareMedia(live: Document, copy: Document, sourceUrl: string, svgImages: Map<number, string>) {
  const liveSvgs = Array.from(live.querySelectorAll("svg"));
  Array.from(copy.querySelectorAll("svg")).forEach((svg, index) => {
    const url = svgImages.get(index);
    if (!url) return;
    const image = copy.createElement("img");
    image.setAttribute("src", url);
    const label =
      liveSvgs[index]?.getAttribute("aria-label") ||
      liveSvgs[index]?.querySelector("title")?.textContent ||
      "Diagram";
    image.setAttribute("alt", label.replace(/\s+/g, " ").trim().slice(0, 120));
    svg.replaceWith(image);
  });
  copy.querySelectorAll("iframe, video, audio").forEach((node) => {
    const raw =
      node.getAttribute("src") ??
      node.querySelector("source[src]")?.getAttribute("src") ??
      null;
    try {
      const url = raw ? new URL(raw, sourceUrl) : null;
      if (url && /^https?:$/.test(url.protocol)) {
        const paragraph = copy.createElement("p");
        const link = copy.createElement("a");
        link.setAttribute("href", url.href);
        link.textContent = `${mediaNoun(node)}: ${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
        paragraph.append(link);
        node.replaceWith(paragraph);
        return;
      }
    } catch {}
    node.remove();
  });
  copy.querySelectorAll("img").forEach((image) => {
    const current = image.getAttribute("src") ?? "";
    if (current.startsWith("data:image/png;base64,") && image.hasAttribute("alt")) return;
    const url = isTinyImage(image) ? null : bestImageUrl(image, sourceUrl);
    if (!url) {
      image.removeAttribute("src");
      return;
    }
    image.setAttribute("src", url);
    image.removeAttribute("srcset");
  });
}

export function extractArticle(
  doc: Document,
  sourceUrl: string,
  svgImages: Map<number, string> = new Map(),
): ArticleResult {
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
    prepareMedia(doc, copy, sourceUrl, svgImages);
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
      ALLOWED_ATTR: ["href", "src", "title", "alt", "class", "start", "colspan", "rowspan"],
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|data:image\/png;base64,)/i,
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
    const media: MediaItem[] = [];
    converter.addRule("image", {
      filter: "img",
      replacement: (_content, node) => {
        const element = node as HTMLElement;
        const alt = (element.getAttribute("alt") ?? "").replace(/\s+/g, " ").trim();
        const src = element.getAttribute("src") ?? "";
        if (!src || media.length >= MAX_MEDIA) return converter.escape(alt);
        const item = { uid: newMediaUid(), alt: alt.replace(/[[\]\\]/g, " "), src };
        media.push(item);
        return `![${item.alt}](attachment:${item.uid})`;
      },
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
        media,
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
