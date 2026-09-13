import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import NotesList from "./NotesList";

interface NotesListContainerProps {
  tagId?: number;
  projectId?: number;
  initialDate?: Date;
}

export function NotesListContainer({ tagId, projectId, initialDate }: NotesListContainerProps) {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <NotesList tagId={tagId} projectId={projectId} initialDate={initialDate} />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
