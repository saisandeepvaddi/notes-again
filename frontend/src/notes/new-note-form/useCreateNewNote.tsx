import { getURL } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { NoteItemSchema, type NewNoteBody } from "./types";

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
      console.log("res:", res);
      return NoteItemSchema.parse(res);
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: ["notes"],
      }),
  });
}
