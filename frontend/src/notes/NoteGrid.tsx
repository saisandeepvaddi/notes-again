import type { ReactNode } from "react";

interface NoteGridProps {
  children: ReactNode;
}

export function NoteGrid({ children }: NoteGridProps) {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,320px))]">
      {children}
    </div>
  );
}
