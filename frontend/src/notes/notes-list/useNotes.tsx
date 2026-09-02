import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import type { NoteItemSchema } from "../new-note-form/types";

const getUseNotesOptions = (): UseSuspenseQueryOptions<NoteItemSchema[]> => {
  return {
    queryKey: ["notes"],
    queryFn: getFetcher("/notes/list"),
  };
};

export function useNotes() {
  return useSuspenseQuery<NoteItemSchema[]>(getUseNotesOptions());
}
