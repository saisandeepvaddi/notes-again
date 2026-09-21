import { getFetcher } from "@/utils/fetchers";
import { NoteIdsSchema } from "../new-note-form/types";
import { notesFilterParams, type UseInfiniteNotesArgs } from "../notes-list/useInfiniteNotes";

// Ids of every note matching the list's filters, including pages the list
// hasn't loaded yet. `total` can exceed `ids.length` (the server caps it).
export async function fetchNoteIds(filters: UseInfiniteNotesArgs) {
  const page = await getFetcher(`/notes/ids?${notesFilterParams(filters)}`)();
  return NoteIdsSchema.parse(page);
}
