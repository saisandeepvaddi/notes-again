const MAX_EXCERPT = 500;
const MIN_PARAGRAPH = 60;
// Boilerplate regions that a "first paragraph" must not come from.
const BOILERPLATE = 'nav, header, footer, aside, form, [role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"], [hidden]';

export interface PageInfo {
  title: string;
  /** Empty when the page offers nothing beyond its title. */
  excerpt: string;
}

const squash = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

function metaContent(doc: Document, ...keys: string[]): string {
  for (const key of keys) {
    const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    const content = squash(el?.getAttribute("content"));
    if (content) {
      return content;
    }
  }
  return "";
}

function firstParagraph(doc: Document): string {
  const root = doc.querySelector('article, main, [role="main"]') ?? doc.body;
  if (!root) {
    return "";
  }
  for (const p of Array.from(root.querySelectorAll("p"))) {
    if (p.closest(BOILERPLATE)) {
      continue;
    }
    const text = squash(p.textContent);
    if (text.length >= MIN_PARAGRAPH) {
      return text;
    }
  }
  return "";
}

/** Whether one string is (roughly) the other, e.g. "Post" vs "Post | Site". */
function overlaps(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.includes(y) || y.includes(x);
}

export function truncate(text: string, max = MAX_EXCERPT): string {
  if (text.length <= max) {
    return text;
  }
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Title plus a short excerpt for the "save this page" note:
 * the h1 (only when it adds something beyond the title) followed by the
 * page's own description, or failing that its first real paragraph.
 */
export function extractPageInfo(doc: Document): PageInfo {
  const title = squash(doc.title) || metaContent(doc, "og:title", "twitter:title");
  const h1 = squash(doc.querySelector("h1")?.textContent);
  const description =
    metaContent(doc, "og:description", "description", "twitter:description") || firstParagraph(doc);

  const parts: string[] = [];
  if (h1 && (!title || !overlaps(h1, title))) {
    parts.push(h1);
  }
  if (description) {
    parts.push(truncate(description));
  }
  return { title, excerpt: parts.join("\n\n") };
}
