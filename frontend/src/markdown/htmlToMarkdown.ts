import DOMPurify from "dompurify";
import TurndownService from "turndown";

const MARKDOWN_LINE = /^(#{1,6} |[-*+] |\d+\. |> |```|\|.*\||\$\$)/m;

export function looksLikeMarkdown(text: string): boolean {
  return text.includes("\n") && MARKDOWN_LINE.test(text);
}

export function htmlToMarkdown(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "form", "input", "button", "iframe", "svg"],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
    RETURN_DOM_FRAGMENT: true,
  });
  const converter = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  converter.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: (content) => `~~${content}~~`,
  });
  converter.addRule("taskItem", {
    filter: (node) =>
      node.nodeName === "LI" && node.firstElementChild?.getAttribute("type") === "checkbox",
    replacement: (content, node) => {
      const checked = (node as HTMLElement).firstElementChild?.hasAttribute("checked");
      return `- [${checked ? "x" : " "}] ${content.trim()}\n`;
    },
  });
  converter.addRule("table", {
    filter: "table",
    replacement: (_content, node) => {
      const rows = Array.from((node as HTMLTableElement).rows, (row) =>
        Array.from(row.cells, (cell) =>
          converter.turndown(cell.innerHTML).replace(/\|/g, "\\|").replace(/\n+/g, " "),
        ),
      );
      if (!rows.length) return "";
      const width = Math.max(...rows.map((row) => row.length));
      const line = (cells: string[]) =>
        `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
      const hasHeader = !!(node as HTMLTableElement).rows[0]?.querySelector("th");
      const heading = hasHeader ? rows.shift()! : Array<string>(width).fill("");
      return `\n\n${[line(heading), line(Array<string>(width).fill("---")), ...rows.map(line)].join("\n")}\n\n`;
    },
  });
  converter.addRule("codeFence", {
    filter: "pre",
    replacement: (_content, node) => {
      const code = (node as HTMLElement).querySelector("code") ?? (node as HTMLElement);
      const value = code.textContent ?? "";
      const language = /(?:language|lang)-([\w+-]+)/.exec(code.className)?.[1] ?? "";
      let longest = 2;
      for (const match of value.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
      const fence = "`".repeat(longest + 1);
      return `\n\n${fence}${language}\n${value.replace(/\n$/, "")}\n${fence}\n\n`;
    },
  });
  return converter.turndown(clean).trim();
}
