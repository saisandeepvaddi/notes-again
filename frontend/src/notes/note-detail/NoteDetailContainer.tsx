import { NotFoundPage } from "@/components/NotFoundPage";
import { NoteDetailSkeleton } from "@/components/PageSkeletons";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/utils/fetchers";
import { ClientOnly } from "@tanstack/react-router";
import { useNote } from "../hooks/useNote";
import { NoteDetail } from "./NoteDetail";

interface NoteDetailContainerProps {
  noteId: number;
}

function NoteDetailContent({ noteId }: NoteDetailContainerProps) {
  const { data: note, isPending, error, refetch } = useNote(noteId);

  if (isPending) return <NoteDetailSkeleton />;
  if (error instanceof ApiError && error.status === 404) {
    return (
      <NotFoundPage
        title="Note not found"
        detail="This note doesn't exist or has been moved to Trash."
      />
    );
  }
  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="font-reading text-xl font-semibold">Could not load note</h1>
        <p className="max-w-[50ch] text-sm text-muted-foreground">
          Check your connection and try again. Your note hasn't been changed.
        </p>
        <Button onClick={() => void refetch()}>Try again</Button>
      </div>
    );
  }
  return <NoteDetail note={note} />;
}

export function NoteDetailContainer({ noteId }: NoteDetailContainerProps) {
  return (
    <ClientOnly fallback={<NoteDetailSkeleton />}>
      <NoteDetailContent noteId={noteId} />
    </ClientOnly>
  );
}
