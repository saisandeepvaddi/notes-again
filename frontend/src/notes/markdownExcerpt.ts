export function markdownExcerpt(markdown: string, maxLength = 140): string {
  const firstLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return "";
  }

  const plain = firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^>\s?/, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .trim();

  return plain.length > maxLength ? `${plain.slice(0, maxLength - 1)}…` : plain;
}
