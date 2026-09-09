import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { NoteDetail } from "./NoteDetail";

interface NoteDetailContainerProps {
  noteId: number;
}

export function NoteDetailContainer({ noteId }: NoteDetailContainerProps) {
  return (
    <Suspense fallback={<>Loading...</>}>
      <ClientOnly>
        <NoteDetail noteId={noteId} />
      </ClientOnly>
    </Suspense>
  );
}
