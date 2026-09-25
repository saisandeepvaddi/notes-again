import { NoteDetailSkeleton } from "@/components/PageSkeletons";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { NoteDetail } from "./NoteDetail";

interface NoteDetailContainerProps {
  noteId: number;
}

export function NoteDetailContainer({ noteId }: NoteDetailContainerProps) {
  return (
    <Suspense fallback={<NoteDetailSkeleton />}>
      <ClientOnly>
        <NoteDetail noteId={noteId} />
      </ClientOnly>
    </Suspense>
  );
}
