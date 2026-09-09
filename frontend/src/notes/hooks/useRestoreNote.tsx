import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useRestoreNoteProps {
  noteId: number;
}

export function useRestoreNote({ noteId }: useRestoreNoteProps) {
  return useMutation({
    mutationKey: ["note-restore", noteId],
    mutationFn: async () => {
      const fetcher = patchFetcher(`/notes/${noteId}/restore`);
      return await fetcher();
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["trashed-notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
