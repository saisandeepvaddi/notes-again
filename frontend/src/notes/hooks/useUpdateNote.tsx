import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useUpdateNoteProps {
  noteId: number;
}

interface UpdateNoteData {
  name: string;
  content: string;
}

export function useUpdateNote({ noteId }: useUpdateNoteProps) {
  return useMutation({
    mutationKey: ["update-note", noteId],
    mutationFn: async (data: UpdateNoteData) => {
      const fetcher = patchFetcher(`/notes/${noteId}`);
      return await fetcher(JSON.stringify(data));
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
