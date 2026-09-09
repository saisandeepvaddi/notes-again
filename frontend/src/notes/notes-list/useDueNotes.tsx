import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { NoteItemSchema } from "../new-note-form/types";

export function useDueNotes() {
  return useSuspenseQuery({
    queryKey: ["due-notes"],
    queryFn: () =>
      getFetcher("/notes/due")()
        .then((notes) => z.array(NoteItemSchema).parse(notes))
        .catch((error) => {
          console.error("Due notes parse error: ", error);
          throw new Error("Invalid notes format received");
        }),
  });
}
