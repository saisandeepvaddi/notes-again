import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useDetachTagProps {
  noteId: number;
}

export function useDetachTag({ noteId }: useDetachTagProps) {
  return useMutation({
    mutationKey: ["detach-tag", noteId],
    mutationFn: async (tagId: number) => {
      const fetcher = deleteFetcher(`/notes/${noteId}/tags/${tagId}`);
      return await fetcher();
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
