import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { NoteItemSchema } from "../new-note-form/types";

export function useTrashedNotes() {
  return useSuspenseQuery({
    queryKey: ["trashed-notes"],
    queryFn: () =>
      getFetcher("/notes/list?deleted=true")()
        .then((notes) => z.array(NoteItemSchema).parse(notes))
        .catch((error) => {
          console.error("Trashed notes parse error: ", error);
          throw new Error("Invalid notes format received");
        }),
  });
}
