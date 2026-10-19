import { NotFoundPage } from "@/components/NotFoundPage";
import { NoteDetailContainer } from "@/notes/note-detail/NoteDetailContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/$noteId")({
  head: () => ({ meta: [{ title: "Note · Notes Again" }] }),
  component: NoteDetailPage,
});

function NoteDetailPage() {
  const { noteId } = Route.useParams();
  const id = Number(noteId);
  if (!/^[1-9]\d*$/.test(noteId) || !Number.isSafeInteger(id)) {
    return <NotFoundPage title="Note not found" detail="That note link isn't valid." />;
  }
  return <NoteDetailContainer noteId={id} />;
}
