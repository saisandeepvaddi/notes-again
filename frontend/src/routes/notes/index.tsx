import { PageHeader } from "@/components/PageHeader";
import { ImportButton } from "@/notes/ImportButton";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import {
  NOTES_SORTS,
  NOTES_SORT_ORDERS,
  NOTES_STATUSES,
} from "@/notes/notes-list/useInfiniteNotes";
import { createFileRoute, type SearchMiddleware } from "@tanstack/react-router";
import { z } from "zod";

const notesSearchSchema = z.object({
  tagId: z.coerce.number().int().optional().catch(undefined),
  projectId: z.coerce.number().int().optional().catch(undefined),
  date: z.iso.date().optional().catch(undefined),
  q: z.coerce.string().optional().catch(undefined),
  status: z.enum(NOTES_STATUSES).optional().catch(undefined),
  sort: z.enum(NOTES_SORTS).optional().catch(undefined),
  order: z.enum(NOTES_SORT_ORDERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  pageSize: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
});

type NotesSearch = z.infer<typeof notesSearchSchema>;

const FILTER_KEYS = ["tagId", "projectId", "date", "q", "status"] as const;

const resetPageOnFilterChange: SearchMiddleware<NotesSearch> = ({ search, next }) => {
  const result = next(search);
  const filterChanged = FILTER_KEYS.some((key) => result[key] !== search[key]);
  return filterChanged ? { ...result, page: undefined } : result;
};

export const Route = createFileRoute("/notes/")({
  validateSearch: notesSearchSchema,
  search: { middlewares: [resetPageOnFilterChange] },
  component: AllNotes,
});

function AllNotes() {
  const { tagId, projectId, date, q, status, sort, order, page, pageSize } = Route.useSearch();
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
        date={date}
        search={q}
        status={status}
        sort={sort}
        order={order}
        page={page}
        pageSize={pageSize}
      />
    </div>
  );
}
