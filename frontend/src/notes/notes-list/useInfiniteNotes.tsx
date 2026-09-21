import { getFetcher } from "@/utils/fetchers";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { NotePageSchema, type NoteItem } from "../new-note-form/types";

export const NOTES_PAGE_SIZE = 60;

export type NotesSort = "due" | "name" | "project" | "created";
export type NotesSortOrder = "asc" | "desc";

export interface UseInfiniteNotesArgs {
  date?: Date;
  tagId?: number;
  projectId?: number;
  deleted?: boolean;
  sort?: NotesSort;
  order?: NotesSortOrder;
}

// The filter half of the list's query string, shared by /notes/list and
// /notes/ids so "select all" selects exactly what the list is showing.
export function notesFilterParams({
  date,
  tagId,
  projectId,
  deleted = false,
}: Pick<UseInfiniteNotesArgs, "date" | "tagId" | "projectId" | "deleted">) {
  const params = new URLSearchParams();
  if (date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    params.set("start", start.toISOString());
    params.set("end", end.toISOString());
  }
  if (tagId != null) params.set("tag_id", String(tagId));
  if (projectId != null) params.set("project_id", String(projectId));
  if (deleted) params.set("deleted", "true");
  return params;
}

// Server-paged list of notes, loaded a page at a time as the user scrolls.
// `keyPrefix` decides which cache family the query lives in, so existing
// invalidations (["notes"], ["trashed-notes"]) keep hitting the right lists.
export function useInfiniteNotes(
  keyPrefix: "notes" | "trashed-notes",
  { date, tagId, projectId, deleted = false, sort = "due", order = "asc" }: UseInfiniteNotesArgs,
) {
  const dateRange = date
    ? {
        start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
      }
    : undefined;

  const query = useInfiniteQuery({
    queryKey: [
      keyPrefix,
      "list",
      {
        start: dateRange?.start.toISOString(),
        end: dateRange?.end.toISOString(),
        tagId,
        projectId,
        deleted,
        sort,
        order,
      },
    ],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const params = notesFilterParams({ date, tagId, projectId, deleted });
      params.set("limit", String(NOTES_PAGE_SIZE));
      params.set("offset", String(pageParam));
      params.set("sort", sort);
      params.set("order", order);
      return getFetcher(`/notes/list?${params}`)()
        .then((page) => NotePageSchema.parse(page))
        .catch((error) => {
          console.error("Note list parse error: ", error);
          throw new Error("Invalid notes format received");
        });
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((count, page) => count + page.items.length, 0);
      return lastPage.items.length > 0 && loaded < lastPage.total ? loaded : undefined;
    },
    // Keep showing the current rows while a new filter/sort loads, instead of
    // blanking the whole list.
    placeholderData: keepPreviousData,
  });

  const notes: NoteItem[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  return { ...query, notes, total };
}
