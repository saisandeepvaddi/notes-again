import { PageHeader } from "@/components/PageHeader";
import NewNoteForm from "@/notes/new-note-form/NewNoteForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/new")({
  component: NewNoteComponent,
});

function NewNoteComponent() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="New Note" />
      <NewNoteForm />
    </div>
  );
}
