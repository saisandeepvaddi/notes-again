import type { CaptureContext, CaptureMode } from "./types";

export function normalizeSelection(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildDraft(
  ctx: CaptureContext,
  mode: CaptureMode = ctx.mode === "selection" ? "selection" : "link",
): { name: string; content: string } {
  const url = ctx.url.trim();
  const article = ctx.article?.ok ? ctx.article.article : undefined;
  const name =
    (mode === "article" ? article?.title : ctx.title)?.trim() ||
    ctx.title.trim() ||
    url ||
    "Untitled";
  const body =
    mode === "selection"
      ? ctx.selection?.trim()
      : mode === "article"
        ? article?.markdown
        : undefined;
  const metadata: Record<string, string> = { source_url: url };
  if (ctx.capturedAt) metadata.captured_at = ctx.capturedAt;
  if (article?.author) metadata.source_author = article.author;
  if (article?.publishedAt) metadata.source_published_at = article.publishedAt;
  if (article?.siteName) metadata.source_site = article.siteName;
  const frontmatter = ctx.capturedAt
    ? `---\n${Object.entries(metadata)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join("\n")}\n---`
    : undefined;
  return { name, content: [frontmatter, url, body].filter(Boolean).join("\n\n") };
}
