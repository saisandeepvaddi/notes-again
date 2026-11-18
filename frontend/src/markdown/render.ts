import { alert } from "@mdit/plugin-alert";
import { footnote } from "@mdit/plugin-footnote";
import { katex } from "@mdit/plugin-katex";
import { mark } from "@mdit/plugin-mark";
import { tasklist } from "@mdit/plugin-tasklist";
import Shiki from "@shikijs/markdown-exit";
import { createMarkdownExit } from "markdown-exit";

const ATTACHMENT = /^attachment:([a-f0-9]{32})$/;
const NOTE = /^note:([a-f0-9]{32})$/;
const VIDEO = /\.(mp4|webm|mov|m4v|ogv)(?:[?#].*)?$/i;
const AUDIO = /\.(mp3|m4a|wav|ogg|oga|flac)(?:[?#].*)?$/i;

export type LinkMode = "data" | "raw";

export interface RenderOptions {
  links?: LinkMode;
  html?: boolean;
  highlight?: boolean;
}

export function embedUrl(src: string): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.pathname.startsWith("/embed/")
      ? url.pathname.slice(7)
      : url.pathname.startsWith("/shorts/")
        ? url.pathname.slice(8)
        : url.searchParams.get("v");
    return id && /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") {
    const id = /^\/(\d+)/.exec(url.pathname)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (host === "player.vimeo.com" && /^\/video\/\d+/.test(url.pathname)) return src;
  return null;
}

export function createMarkdown({
  links = "data",
  html = true,
  highlight = true,
}: RenderOptions = {}) {
  const md = createMarkdownExit({ html, linkify: true });

  if (highlight) md.use(Shiki({ themes: { light: "vitesse-light", dark: "vitesse-dark" } }));
  md.use(katex, { throwOnError: false, output: "htmlAndMathml", mathFence: true });
  md.use(tasklist, { disabled: true });
  md.use(footnote);
  md.use(alert);
  md.use(mark);

  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
    if (language === "mermaid") {
      const source = md.utils.escapeHtml(token.content);
      return `<div class="mermaid-block"><pre><code>${source}</code></pre></div>\n`;
    }
    return fence
      ? fence(tokens, index, options, env, renderer)
      : renderer.renderToken(tokens, index, options);
  };

  md.renderer.rules.image = (tokens, index) => {
    const token = tokens[index];
    const src = (token.attrGet("src") ?? "").trim();
    const alt = md.utils.escapeHtml(token.content);
    const uid = ATTACHMENT.exec(src)?.[1];
    if (uid) return `<img data-attachment="${uid}" alt="${alt}" loading="lazy">`;
    const escaped = md.utils.escapeHtml(src);
    const embed = embedUrl(src);
    if (embed) {
      return `<div class="embed"><iframe src="${md.utils.escapeHtml(embed)}" title="${alt}" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }
    if (VIDEO.test(src)) {
      return `<video src="${escaped}" controls preload="metadata" playsinline aria-label="${alt}"></video>`;
    }
    if (AUDIO.test(src)) {
      return `<audio src="${escaped}" controls preload="none" aria-label="${alt}"></audio>`;
    }
    return `<img src="${escaped}" alt="${alt}" loading="lazy">`;
  };

  const linkOpen =
    md.renderer.rules.link_open ??
    ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options));
  md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const href = (token.attrGet("href") ?? "").trim();
    if (links === "data") {
      const attachment = ATTACHMENT.exec(href)?.[1];
      if (attachment) {
        token.attrSet("href", "#");
        token.attrSet("data-attachment-link", attachment);
      }
      const note = NOTE.exec(href)?.[1];
      if (note) {
        token.attrSet("href", "#");
        token.attrSet("data-note-link", note);
      }
    }
    if (/^https?:/i.test(href)) {
      token.attrSet("target", "_blank");
      token.attrSet("rel", "noopener noreferrer");
    }
    return linkOpen(tokens, index, options, env, renderer);
  };

  return md;
}

export type NoteMarkdown = ReturnType<typeof createMarkdown>;
