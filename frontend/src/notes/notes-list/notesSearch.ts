import { z } from "zod";
import { NOTES_SORTS, NOTES_SORT_ORDERS, NOTES_STATUSES } from "./useInfiniteNotes";

export const notesSearchSchema = z.object({
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

export type NotesSearch = z.infer<typeof notesSearchSchema>;

let lastSearch: NotesSearch = {};

export function rememberNotesSearch(search: NotesSearch) {
  lastSearch = search;
}

export function lastNotesSearch(): NotesSearch {
  return lastSearch;
}
