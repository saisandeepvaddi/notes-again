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
  const dateRange = date
    ? {
        start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
      }
    : undefined;
  const queryKey = dateRange
    ? [dateRange.start.toISOString(), dateRange.end.toISOString()]
    : undefined;
  return {
    queryKey: ["notes", queryKey],
    queryFn: () =>
      getFetcher(
        dateRange
          ? `/notes/list?start=${encodeURIComponent(dateRange.start.toISOString())}&end=${encodeURIComponent(dateRange.end.toISOString())}`
          : `/notes/list`,
      )()
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
