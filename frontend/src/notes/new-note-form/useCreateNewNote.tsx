import { getURL } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { NoteSchema, type NewNoteBody } from "./types";

const CreateNotesResponseSchema = NoteSchema.extend({
  id: z.string(),
});

export function useCreateNewNote() {
  return useMutation({
    mutationKey: ["create-new-note"],
    mutationFn: async (newNote: NewNoteBody) => {
      const fetcher = () =>
        fetch(`${getURL()}/notes/create`, {
          method: "POST",
          body: JSON.stringify(newNote),
        });

      const res = await (await fetcher()).json();
      return CreateNotesResponseSchema.parse(res);
    },
  });
}
