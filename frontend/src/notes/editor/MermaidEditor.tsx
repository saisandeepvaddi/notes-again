import { useCodeBlockEditorContext, type CodeBlockEditorDescriptor } from "@mdxeditor/editor";
import { useEffect, useRef, useState } from "react";
import { renderDiagrams } from "@/markdown/hydrate";

function MermaidEditor({ code }: { code: string; language: string; meta: string }) {
  const { setCode } = useCodeBlockEditorContext();
  const preview = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const target = preview.current;
    if (!target) return;
    let active = true;
    const timer = setTimeout(() => {
      target.dataset.mermaid = code;
      target.removeAttribute("data-rendered");
      target.classList.remove("mermaid-error");
      target.textContent = code;
      void renderDiagrams(
        target.parentElement as HTMLElement,
        document.documentElement.classList.contains("dark"),
        () => active,
      ).then(() => {
        if (active) setError(target.classList.contains("mermaid-error"));
      });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [code]);

  return (
    <div className="mermaid-editor" onKeyDown={(event) => event.stopPropagation()}>
      <div ref={preview} className="mermaid-block" aria-label="Diagram preview" />
      {error ? <p className="mermaid-error-note">This diagram has a syntax error.</p> : null}
      <textarea
        className="mermaid-source"
        aria-label="Diagram source"
        spellCheck={false}
        value={code}
        rows={Math.min(14, Math.max(3, code.split("\n").length))}
        onChange={(event) => setCode(event.target.value)}
      />
    </div>
  );
}

export const mermaidDescriptor: CodeBlockEditorDescriptor = {
  priority: 1000,
  match: (language) => language === "mermaid",
  Editor: MermaidEditor,
};
