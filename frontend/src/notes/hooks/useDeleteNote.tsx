import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useDeleteNoteProps {
  noteId: number;
}

export function useDeleteNote({ noteId }: useDeleteNoteProps) {
  return useMutation({
    mutationKey: ["note-delete", noteId],
    mutationFn: async () => {
      const fetcher = deleteFetcher(`/notes/${noteId}`);
      return await fetcher();
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
      context.client.invalidateQueries({ queryKey: ["trashed-notes"] });
    },
  });
}
