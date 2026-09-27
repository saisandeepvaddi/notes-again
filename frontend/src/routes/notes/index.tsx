import { PageHeader } from "@/components/PageHeader";
import { ImportButton } from "@/notes/ImportButton";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import {
  notesSearchSchema,
  rememberNotesSearch,
  type NotesSearch,
} from "@/notes/notes-list/notesSearch";
import { createFileRoute, type SearchMiddleware } from "@tanstack/react-router";

const FILTER_KEYS = ["tagId", "projectId", "date", "q", "status"] as const;

const resetPageOnFilterChange: SearchMiddleware<NotesSearch> = ({ search, next }) => {
  const result = next(search);
  const filterChanged = FILTER_KEYS.some((key) => result[key] !== search[key]);
  return filterChanged ? { ...result, page: undefined } : result;
};

export const Route = createFileRoute("/notes/")({
  validateSearch: notesSearchSchema,
  search: { middlewares: [resetPageOnFilterChange] },
  onEnter: ({ search }) => rememberNotesSearch(search),
  onStay: ({ search }) => rememberNotesSearch(search),
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
