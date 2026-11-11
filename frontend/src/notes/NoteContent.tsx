import { cn } from "@/lib/utils";
import Shiki from "@shikijs/markdown-exit";
import { createMarkdownExit } from "markdown-exit";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { attachmentObjectUrl } from "@/attachments/api";
import { attachmentUid } from "@/attachments/uri";
import { fetchLinkTargets } from "@/links/api";
import { noteLinkUid } from "@/links/uri";
import { saveBlob } from "@/lib/saveFile";

const md = createMarkdownExit();

md.use(
  Shiki({
    themes: {
      light: "vitesse-light",
      dark: "vitesse-dark",
    },
  }),
);

md.renderer.rules.image = (tokens, index) => {
  const token = tokens[index];
  const uid = attachmentUid(token.attrGet("src") ?? "");
  const alt = md.utils.escapeHtml(token.content);
  return uid
    ? `<img data-attachment="${uid}" alt="${alt}" loading="lazy">`
    : `<img src="${md.utils.escapeHtml(token.attrGet("src") ?? "")}" alt="${alt}" loading="lazy">`;
};
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options));
md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const href = tokens[index].attrGet("href") ?? "";
  const uid = attachmentUid(href);
  if (uid) {
    tokens[index].attrSet("href", "#");
    tokens[index].attrSet("data-attachment-link", uid);
  }
  const noteUid = noteLinkUid(href);
  if (noteUid) {
    tokens[index].attrSet("href", "#");
    tokens[index].attrSet("data-note-link", noteUid);
  }
  return defaultLinkOpen(tokens, index, options, env, renderer);
};

const HTML_CACHE_LIMIT = 300;
const htmlCache = new Map<string, string>();

function cacheHtml(markdown: string, html: string) {
  htmlCache.delete(markdown);
  htmlCache.set(markdown, html);
  if (htmlCache.size > HTML_CACHE_LIMIT) {
    htmlCache.delete(htmlCache.keys().next().value as string);
  }
}

interface NoteContentProps {
  markdown: string;
  className?: string;
}

export function NoteContent({ markdown, className }: NoteContentProps) {
  const [content, setContent] = useState<string>(() => htmlCache.get(markdown) ?? "");
  useEffect(() => {
    if (markdown.length === 0) {
      setContent("");
      return;
    }
    const cached = htmlCache.get(markdown);
    if (cached !== undefined) {
      setContent(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const html = await md.renderAsync(markdown);
        cacheHtml(markdown, html);
        if (!cancelled) setContent(html);
      } catch (e) {
        console.error("Error parsing markdown. Check if valid content.", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markdown]);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let active = true;
    root.querySelectorAll<HTMLImageElement>("img[data-attachment]").forEach((image) => {
      attachmentObjectUrl(image.dataset.attachment ?? "").then(
        (url) => {
          if (active) image.src = url;
        },
        () => {
          if (active) image.alt = `${image.alt} (attachment unavailable)`;
        },
      );
    });
    const noteLinks = [...root.querySelectorAll<HTMLAnchorElement>("a[data-note-link]")];
    const uids = [...new Set(noteLinks.map((link) => link.dataset.noteLink ?? ""))].slice(0, 50);
    if (uids.length) {
      fetchLinkTargets(uids).then(
        (targets) => {
          if (!active) return;
          for (const link of noteLinks) {
            const target = targets.find((item) => item.uid === link.dataset.noteLink);
            if (!target || target.trashed) {
              link.classList.add("note-link-missing");
              link.title = target ? "This note is in the trash" : "This note is not on this device";
            } else {
              link.title = target.name;
              link.dataset.noteId = String(target.id);
            }
          }
        },
        () => undefined,
      );
    }
    return () => {
      active = false;
    };
  }, [content]);
  const navigate = useNavigate();
  const openLink = (event: React.MouseEvent<HTMLDivElement>) => {
    const noteLink = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-note-link]");
    if (noteLink) {
      event.preventDefault();
      event.stopPropagation();
      const known = noteLink.dataset.noteId;
      const go = (id: string) => void navigate({ to: "/notes/$noteId", params: { noteId: id } });
      if (known) go(known);
      else
        fetchLinkTargets([noteLink.dataset.noteLink ?? ""]).then(
          ([target]) => {
            if (target && !target.trashed) go(String(target.id));
          },
          () => undefined,
        );
      return;
    }
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "a[data-attachment-link]",
    );
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    attachmentObjectUrl(link.dataset.attachmentLink ?? "").then(
      (url) =>
        fetch(url)
          .then((response) => response.blob())
          .then((blob) => saveBlob(blob, link.textContent?.trim() || "attachment")),
      () => undefined,
    );
  };
  return (
    <div
      ref={container}
      className={cn("markdown-content w-full max-w-none", className)}
      onClick={openLink}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
