import NewNoteForm from "@/notes/new-note-form/NewNoteForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/new")({
  head: () => ({ meta: [{ title: "New note · Notes Again" }] }),
  component: NewNoteComponent,
});

function NewNoteComponent() {
  return <NewNoteForm />;
}
