import katex from "katex";
import "katex/dist/katex.min.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RawKind } from "./rawNode";

interface RawViewProps {
  value: string;
  kind: RawKind;
  inline: boolean;
  onChange: (value: string) => void;
}

export function mathSource(value: string) {
  const display = value.startsWith("$$");
  const body = value.replace(/^\$\$?\s*/, "").replace(/\s*\$\$?$/, "");
  return { display, body };
}

function Formula({ value }: { value: string }) {
  const { display, body } = mathSource(value);
  const html = useMemo(
    () => katex.renderToString(body, { displayMode: display, throwOnError: false }),
    [body, display],
  );
  return <span className="raw-md-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function RawView({ value, kind, inline, onChange }: RawViewProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <textarea
        ref={field}
        className={`raw-md-editor${inline ? " raw-md-editor-inline" : ""}`}
        value={draft}
        rows={rowsFor(draft)}
        aria-label="Edit source"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) commit();
        }}
      />
    );
  }

  const open = () => {
    setDraft(value);
    setEditing(true);
  };

  return (
    <button
      type="button"
      className={`raw-md-view raw-md-${kind}${inline ? " raw-md-view-inline" : ""}`}
      onClick={open}
      title="Click to edit the source"
    >
      {kind === "math" ? <Formula value={value} /> : <code>{value}</code>}
    </button>
  );
}

function rowsFor(text: string) {
  return Math.min(12, Math.max(1, text.split("\n").length));
}
