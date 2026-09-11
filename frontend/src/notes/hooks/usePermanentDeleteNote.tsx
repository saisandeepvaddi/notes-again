import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface usePermanentDeleteNoteProps {
  noteId: number;
}

export function usePermanentDeleteNote({ noteId }: usePermanentDeleteNoteProps) {
  return useMutation({
    mutationKey: ["note-permanent-delete", noteId],
    mutationFn: async () => {
      const fetcher = deleteFetcher(`/notes/${noteId}/permanent`);
      return await fetcher();
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["trashed-notes"] });
    },
  });
}
