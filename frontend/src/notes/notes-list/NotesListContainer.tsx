import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import NotesList from "./NotesList";

interface NotesListContainerProps {
  tagId?: number;
  initialDate?: Date;
}

export function NotesListContainer({ tagId, initialDate }: NotesListContainerProps) {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <NotesList tagId={tagId} initialDate={initialDate} />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
