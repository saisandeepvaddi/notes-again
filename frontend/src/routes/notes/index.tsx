import { NewNoteButton } from "@/notes/NewNoteButton";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/")({ component: AllNotes });

function AllNotes() {
  return (
    <div>
      <NewNoteButton />
      <NotesListContainer />
    </div>
  );
}
