import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery } from "@tanstack/react-query";
import { NoteItemSchema } from "../new-note-form/types";

export function useNote(noteId: number) {
  return useSuspenseQuery({
    queryKey: ["notes", "detail", noteId],
    queryFn: () =>
      getFetcher(`/notes/${noteId}`)()
        .then((note) => NoteItemSchema.parse(note))
        .catch((error) => {
          console.error("Note parse error: ", error);
          throw new Error("Invalid note format received");
        }),
  });
}
