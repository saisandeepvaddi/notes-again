import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { NoteItemSchema, type NewNoteBody } from "./types";

export function useCreateNewNote() {
  return useMutation({
    mutationKey: ["create-new-note"],
    mutationFn: async (newNote: NewNoteBody) => {
      const fetcher = postFetcher("/notes/create");
      const res = await fetcher(JSON.stringify(newNote));
      return NoteItemSchema.parse(res);
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) => {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
