import { PageHeader } from "@/components/PageHeader";
import { ImportButton } from "@/notes/ImportButton";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const notesSearchSchema = z.object({
  tagId: z.coerce.number().optional(),
  projectId: z.coerce.number().optional(),
  date: z.coerce.date().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/notes/")({
  validateSearch: notesSearchSchema,
  component: AllNotes,
});

function AllNotes() {
  const { tagId, projectId, date, q, page, pageSize } = Route.useSearch();
  return (
    <div>
      <PageHeader title="All Notes" actions={
          <>
            <ImportButton />
            <NewNoteButton />
          </>
        } />
      <NotesListContainer
        tagId={tagId}
        projectId={projectId}
        initialDate={date}
        search={q}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
