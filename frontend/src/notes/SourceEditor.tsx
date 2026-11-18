import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef } from "react";

interface SourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SourceEditor({ value, onChange, className }: SourceEditorProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={field}
      aria-label="Note source"
      spellCheck={false}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "block min-h-64 w-full resize-none overflow-hidden bg-transparent font-mono text-sm leading-relaxed outline-none",
        className,
      )}
    />
  );
}
