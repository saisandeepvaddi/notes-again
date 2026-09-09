import { NoteDetailContainer } from "@/notes/note-detail/NoteDetailContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/$noteId")({ component: NoteDetailPage });

function NoteDetailPage() {
  const { noteId } = Route.useParams();
  return <NoteDetailContainer noteId={Number(noteId)} />;
}
