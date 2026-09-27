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

// Every list filter lives here rather than in component state, so back/forward
// and reloads restore exactly what was on screen. Each field falls back to
// "unset" on a malformed value (a hand-edited or stale link) instead of
// throwing the whole page into its error state.
const notesSearchSchema = z.object({
  tagId: z.coerce.number().int().optional().catch(undefined),
  projectId: z.coerce.number().int().optional().catch(undefined),
  // A calendar day (yyyy-MM-dd), not a Date: a Date doesn't round-trip
  // through the URL, and the filter is a whole local day anyway.
  date: z.iso.date().optional().catch(undefined),
  q: z.coerce.string().optional().catch(undefined),
  status: z.enum(NOTES_STATUSES).optional().catch(undefined),
  // Unset = the server's default order (soonest review first).
  sort: z.enum(NOTES_SORTS).optional().catch(undefined),
  order: z.enum(NOTES_SORT_ORDERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  pageSize: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
});

type NotesSearch = z.infer<typeof notesSearchSchema>;

const FILTER_KEYS = ["tagId", "projectId", "date", "q", "status"] as const;

// A changed filter can leave `page` pointing past the new, smaller result set,
// so any navigation that changes a filter lands back on page 1. Done here
// rather than in an effect so back/forward (which doesn't build a new
// location) still restores the page that entry was on.
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
