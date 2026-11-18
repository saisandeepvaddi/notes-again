export interface OutlineItem {
  level: number;
  title: string;
  index: number;
}

export function extractOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(line);
    if (!heading) continue;
    const title = heading[2]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (title) items.push({ level: heading[1].length, title, index: items.length });
  }
  return items;
}
