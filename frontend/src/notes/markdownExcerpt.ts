// A cheap, synchronous "what does this note say" preview for dense UI (table
// rows) where rendering full markdown (async, Shiki-highlighted, one syntax
// tree per row) would be overkill — strip the common markdown syntax down to
// plain text and take the first line.
export function markdownExcerpt(markdown: string, maxLength = 140): string {
  const firstLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return "";
  }

  const plain = firstLine
    .replace(/^#{1,6}\s+/, "") // headings
    .replace(/^[-*+]\s+/, "") // bullet markers
    .replace(/^\d+\.\s+/, "") // ordered list markers
    .replace(/^>\s?/, "") // blockquote marker
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // inline/fenced code
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images -> alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> label
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1") // bold/italic/strikethrough
    .trim();

  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1)}…` : plain;
}
