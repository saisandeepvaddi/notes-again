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

interface NoteContentProps {
  markdown: string;
  className?: string;
}

export function NoteContent({ markdown, className }: NoteContentProps) {
  const [content, setContent] = useState<string>("");
  useEffect(() => {
    if (markdown.length === 0) {
      console.warn("No content provided");
      return;
    }
    (async () => {
      try {
        const html = await md.renderAsync(markdown);
        setContent(html);
      } catch (e) {
        console.error("Error parsing markdown. Check if valid content.", e);
      }
    })();
  }, [markdown]);
  return (
    <div
      className={cn(
        "prose w-full max-w-none [&_h2]:font-semibold [&_a]:text-blue-600 [&_a]:underline",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
