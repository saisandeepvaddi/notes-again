import { cn } from "@/lib/utils";
import Shiki from "@shikijs/markdown-exit";
import { createMarkdownExit } from "markdown-exit";
import { useEffect, useState } from "react";

const md = createMarkdownExit();

md.use(
  Shiki({
    themes: {
      light: "vitesse-light",
      dark: "vitesse-dark",
    },
  }),
);

const HTML_CACHE_LIMIT = 300;
const htmlCache = new Map<string, string>();

function cacheHtml(markdown: string, html: string) {
  htmlCache.delete(markdown);
  htmlCache.set(markdown, html);
  if (htmlCache.size > HTML_CACHE_LIMIT) {
    htmlCache.delete(htmlCache.keys().next().value as string);
  }
}

interface NoteContentProps {
  markdown: string;
  className?: string;
}

export function NoteContent({ markdown, className }: NoteContentProps) {
  const [content, setContent] = useState<string>(() => htmlCache.get(markdown) ?? "");
  useEffect(() => {
    if (markdown.length === 0) {
      setContent("");
      return;
    }
    const cached = htmlCache.get(markdown);
    if (cached !== undefined) {
      setContent(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const html = await md.renderAsync(markdown);
        cacheHtml(markdown, html);
        if (!cancelled) setContent(html);
      } catch (e) {
        console.error("Error parsing markdown. Check if valid content.", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markdown]);
  return (
    <div
      className={cn("markdown-content w-full max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
