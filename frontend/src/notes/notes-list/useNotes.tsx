import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { NoteItemSchema, type NoteItem } from "../new-note-form/types";

export interface GetUseNotesOptionsArgs {
  date?: Date;
}

const getUseNotesOptions = (
  options?: GetUseNotesOptionsArgs,
): UseSuspenseQueryOptions<NoteItem[]> => {
  const { date } = options ?? { date: undefined };
  const dateValue = date
    ? [date.getFullYear(), date.getMonth() + 1, date.getDate()]
        .map((part) => part.toString().padStart(2, "0"))
        .join("-")
    : undefined;
  return {
    queryKey: ["notes", dateValue],
    queryFn: () =>
      getFetcher(dateValue ? `/notes/list?date=${encodeURIComponent(dateValue)}` : `/notes/list`)()
        .then((notes) => {
          return z.array(NoteItemSchema).parse(notes);
        })
        .catch((error) => {
          console.error("Note List parse error: ", error);
          throw new Error("Invalid notes format received");
        }),
  };
};

export function useNotes(options?: GetUseNotesOptionsArgs) {
  return useSuspenseQuery<NoteItem[]>(getUseNotesOptions(options));
}
