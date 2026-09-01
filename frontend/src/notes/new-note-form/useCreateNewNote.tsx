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
      const url = `${getURL()}/notes/create`;
      const fetcher = () =>
        fetch(url, {
          method: "POST",
          body: JSON.stringify(newNote),
          headers: {
            "Content-Type": "application/json",
          },
        });

      const res = await (await fetcher()).json();
      return CreateNotesResponseSchema.parse(res);
    },
  });
}
