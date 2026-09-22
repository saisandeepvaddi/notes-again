import type { CaptureContext } from "./types";

/** Tidies a raw `getSelection().toString()`: NBSPs, CRLFs, and runaway blank lines. */
export function normalizeSelection(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The initial name/content the dialog opens with. Content is always the URL
 * first, then a blank line (so Markdown renders it as its own paragraph),
 * then the excerpt or selection when there is one.
 */
export function buildDraft(ctx: CaptureContext): { name: string; content: string } {
  const url = ctx.url.trim();
  const name = ctx.title.trim() || url || "Untitled";
  const body = ctx.mode === "selection" ? ctx.selection?.trim() : ctx.excerpt?.trim();
  return { name, content: [url, body].filter(Boolean).join("\n\n") };
}
