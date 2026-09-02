import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import type { NoteItem } from "../new-note-form/types";

const getUseNotesOptions = (): UseSuspenseQueryOptions<NoteItem[]> => {
  return {
    queryKey: ["notes"],
    queryFn: getFetcher("/notes/list"),
  };
};

export function useNotes() {
  return useSuspenseQuery<NoteItem[]>(getUseNotesOptions());
}
