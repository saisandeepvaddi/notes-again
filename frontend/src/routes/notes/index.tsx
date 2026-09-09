import { PageHeader } from "@/components/PageHeader";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const notesSearchSchema = z.object({
  tagId: z.coerce.number().optional(),
});

export const Route = createFileRoute("/notes/")({
  validateSearch: notesSearchSchema,
  component: AllNotes,
});

function AllNotes() {
  const { tagId } = Route.useSearch();
  return (
    <div>
      <PageHeader title="All Notes" actions={<NewNoteButton />} />
      <NotesListContainer tagId={tagId} />
    </div>
  );
}
