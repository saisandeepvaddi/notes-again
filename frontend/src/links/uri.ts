const PATTERN = /^note:([a-f0-9]{32})$/;

export function noteLinkUid(href: string): string | null {
  return PATTERN.exec(href.trim())?.[1] ?? null;
}

export function noteLinkMarkdown(title: string, uid: string): string {
  const label = title.replace(/[[\]\\\n\r]/g, " ").replace(/\s+/g, " ").trim() || "Untitled";
  return `[${label}](note:${uid})`;
}
