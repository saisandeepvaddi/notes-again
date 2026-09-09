import { PageHeader } from "@/components/PageHeader";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/")({ component: AllNotes });

function AllNotes() {
  return (
    <div>
      <PageHeader title="All Notes" actions={<NewNoteButton />} />
      <NotesListContainer />
    </div>
  );
}
