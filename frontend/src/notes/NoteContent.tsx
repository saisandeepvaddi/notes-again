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
}

export function NoteContent({ markdown }: NoteContentProps) {
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
      className="prose min-w-50 [&_h2]:font-semibold"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
