import type { CaptureContext } from "./types";

export function normalizeSelection(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildDraft(ctx: CaptureContext): { name: string; content: string } {
  const url = ctx.url.trim();
  const name = ctx.title.trim() || url || "Untitled";
  const body = ctx.mode === "selection" ? ctx.selection?.trim() : ctx.excerpt?.trim();
  return { name, content: [url, body].filter(Boolean).join("\n\n") };
}
