import { PageHeader } from "@/components/PageHeader";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const notesSearchSchema = z.object({
  tagId: z.coerce.number().optional(),
  date: z.coerce.date().optional(),
});

export const Route = createFileRoute("/notes/")({
  validateSearch: notesSearchSchema,
  component: AllNotes,
});

function AllNotes() {
  const { tagId, date } = Route.useSearch();
  return (
    <div>
      <PageHeader title="All Notes" actions={<NewNoteButton />} />
      <NotesListContainer tagId={tagId} initialDate={date} />
    </div>
  );
}
