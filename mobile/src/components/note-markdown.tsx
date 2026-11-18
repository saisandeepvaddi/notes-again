"use dom";

import "katex/dist/katex.min.css";
import { hydrate } from "@web/markdown/hydrate";
import { createMarkdown } from "@web/markdown/render";
import { sanitizeHtml } from "@web/markdown/sanitize";
import { useEffect, useState, type MouseEvent } from "react";
import { markdownCss, type MarkdownFont, type MarkdownPalette } from "@/components/markdown-css";

const md = createMarkdown({ links: "raw" });

interface NoteMarkdownProps {
  markdown: string;
  scheme: "light" | "dark";
  font: MarkdownFont;
  palette: MarkdownPalette;
  onOpenLink: (href: string) => Promise<void>;
  loadAttachment: (uid: string) => Promise<string>;
  onHeight: (height: number) => Promise<void>;
  dom?: import("expo/dom").DOMProps;
}

const cache = new Map<string, string>();

export default function NoteMarkdown({
  markdown,
  scheme,
  font,
  palette,
  onOpenLink,
  loadAttachment,
  onHeight,
}: NoteMarkdownProps) {
  const [rendered, setRendered] = useState<{ markdown: string; html: string } | null>(null);
  const html = cache.get(markdown) ?? (rendered?.markdown === markdown ? rendered.html : "");

  useEffect(() => {
    if (cache.has(markdown)) return;
    let cancelled = false;
    md.renderAsync(markdown)
      .catch(() => md.render(markdown))
      .then((output) => sanitizeHtml(output))
      .then((output) => {
        cache.set(markdown, output);
        if (!cancelled) setRendered({ markdown, html: output });
      });
    return () => {
      cancelled = true;
    };
  }, [markdown]);

  const resolve = (node: HTMLDivElement | null) => {
    if (!node) return;
    hydrate(node, { dark: scheme === "dark" }, () => true);
    node.querySelectorAll<HTMLImageElement>("img[data-attachment]").forEach((image) => {
      if (image.getAttribute("src")) return;
      loadAttachment(image.dataset.attachment ?? "").then(
        (url) => image.setAttribute("src", url),
        () => {
          image.alt = `${image.alt} (attachment unavailable)`;
        },
      );
    });
  };

  const observe = (node: HTMLDivElement | null) => {
    if (!node) return;
    let last = -1;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (height !== last) {
        last = height;
        void onHeight(height);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  };

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!href) return;
    event.preventDefault();
    if (href.startsWith("#")) {
      document.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ block: "center" });
      return;
    }
    void onOpenLink(href);
  };

  return (
    <>
      <style>{markdownCss(palette, scheme, font)}</style>
      <div
        ref={(node) => {
          resolve(node);
          return observe(node);
        }}
        className="markdown-content"
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
