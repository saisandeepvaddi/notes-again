import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery } from "@tanstack/react-query";
import { NotePageSchema } from "../new-note-form/types";

export const DUE_BATCH_SIZE = 25;

export const fetchDueNotes = () =>
  getFetcher(`/notes/due?limit=${DUE_BATCH_SIZE}`)()
    .then((page) => NotePageSchema.parse(page))
    .catch((error) => {
      console.error("Due notes parse error: ", error);
      throw new Error("Invalid notes format received");
    });

export function useDueNotes() {
  return useSuspenseQuery({ queryKey: ["due-notes"], queryFn: fetchDueNotes });
}
