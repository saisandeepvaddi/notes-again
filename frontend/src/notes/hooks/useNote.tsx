import { ApiError, getFetcher } from "@/utils/fetchers";
import { useQuery } from "@tanstack/react-query";
import { NoteItemSchema } from "../new-note-form/types";

export function useNote(noteId: number) {
  return useQuery({
    queryKey: ["notes", "detail", noteId],
    queryFn: () => getFetcher(`/notes/${noteId}`)().then((note) => NoteItemSchema.parse(note)),
    retry: (failures, error) =>
      !(error instanceof ApiError && error.status === 404) && failures < 1,
  });
}
