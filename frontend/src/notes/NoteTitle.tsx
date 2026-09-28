import { ArrowUpRightIcon } from "lucide-react";
import { createMarkdownExit, type Token } from "markdown-exit";
import type { ReactNode } from "react";

const md = createMarkdownExit({ linkify: true });

const EXTERNAL_HREF = /^[a-z][a-z\d+.-]*:/i;

const BLOCK_PREFIX = /^\s*(?:#{1,6}(?:\s+|$)|>\s?)+/;

function inlineTokens(title: string): Token[] {
  return md.parseInline(title.replace(BLOCK_PREFIX, ""))[0]?.children ?? [];
}

export function noteTitleText(title: string): string {
  return inlineTokens(title)
    .map((token) => {
      if (token.type === "softbreak" || token.type === "hardbreak") return " ";
      if (token.type.endsWith("_open") || token.type.endsWith("_close")) return "";
      return token.content;
    })
    .join("");
}

function TitleLink({ href, children }: { href: string; children: ReactNode }) {
  const external = EXTERNAL_HREF.test(href);
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="relative z-10 text-primary underline decoration-primary/40 underline-offset-[0.2em] transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
      {external && (
        <ArrowUpRightIcon
          aria-hidden="true"
          className="ml-px inline-block size-[0.8em] -translate-y-[0.05em] align-baseline"
        />
      )}
    </a>
  );
}

function build(tokens: Token[], start: number, until?: string): [ReactNode[], number] {
  const nodes: ReactNode[] = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === until) {
      return [nodes, i];
    }
    const key = i;
    switch (token.type) {
      case "link_open":
      case "strong_open":
      case "em_open":
      case "s_open": {
        const closeType = token.type.replace("_open", "_close");
        const [children, end] = build(tokens, i + 1, closeType);
        i = end;
        if (token.type === "link_open") {
          nodes.push(
            <TitleLink key={key} href={token.attrGet("href") ?? ""}>
              {children}
            </TitleLink>,
          );
        } else if (token.type === "strong_open") {
          nodes.push(
            <strong key={key} className="font-bold">
              {children}
            </strong>,
          );
        } else if (token.type === "em_open") {
          nodes.push(<em key={key}>{children}</em>);
        } else {
          nodes.push(
            <s key={key} className="decoration-muted-foreground">
              {children}
            </s>,
          );
        }
        break;
      }
      case "code_inline":
        nodes.push(
          <code
            key={key}
            className="rounded-sm bg-muted px-1 py-px font-mono text-[0.85em] font-normal"
          >
            {token.content}
          </code>,
        );
        break;
      case "softbreak":
      case "hardbreak":
        nodes.push(" ");
        break;
      default:
        if (token.content) nodes.push(token.content);
    }
    i++;
  }
  return [nodes, i];
}

interface NoteTitleProps {
  title: string;
  className?: string;
}

export function NoteTitle({ title, className }: NoteTitleProps) {
  const [nodes] = build(inlineTokens(title), 0);
  return <span className={className}>{nodes}</span>;
}
