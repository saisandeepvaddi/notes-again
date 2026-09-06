import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { NoteItemSchema, type NoteItem } from "../new-note-form/types";
const getUseNotesOptions = (): UseSuspenseQueryOptions<NoteItem[]> => {
  return {
    queryKey: ["notes"],
    queryFn: () =>
      getFetcher("/notes/list")()
        .then((notes) => {
          return z.array(NoteItemSchema).parse(notes);
        })
        .catch((error) => {
          console.error("Note List parse error: ", error);
          throw new Error("Invalid notes format received");
        }),
  };
};

export function useNotes() {
  return useSuspenseQuery<NoteItem[]>(getUseNotesOptions());
}
