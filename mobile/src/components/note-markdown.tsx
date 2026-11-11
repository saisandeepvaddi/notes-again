"use dom";

import Shiki from "@shikijs/markdown-exit";
import { createMarkdownExit } from "markdown-exit";
import { useEffect, useState, type MouseEvent } from "react";
import { markdownCss, type MarkdownFont, type MarkdownPalette } from "@/components/markdown-css";

const ATTACHMENT = /^attachment:([a-f0-9]{32})$/;

const md = createMarkdownExit({ linkify: true });
md.use(Shiki({ themes: { light: "vitesse-light", dark: "vitesse-dark" } }));
md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const src = token.attrGet("src") ?? "";
  const uid = ATTACHMENT.exec(src.trim())?.[1];
  const alt = md.utils.escapeHtml(token.content);
  return uid
    ? `<img data-attachment="${uid}" alt="${alt}">`
    : `<img src="${md.utils.escapeHtml(src)}" alt="${alt}">`;
};

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
