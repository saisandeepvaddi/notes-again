import { getFetcher } from "@/utils/fetchers";
import { NoteIdsSchema } from "../new-note-form/types";
import { notesFilterParams, type UseInfiniteNotesArgs } from "../notes-list/useInfiniteNotes";

export async function fetchNoteIds(filters: UseInfiniteNotesArgs) {
  const page = await getFetcher(`/notes/ids?${notesFilterParams(filters)}`)();
  return NoteIdsSchema.parse(page);
}
