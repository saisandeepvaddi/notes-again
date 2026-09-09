import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useAttachTagProps {
  noteId: number;
}

export function useAttachTag({ noteId }: useAttachTagProps) {
  return useMutation({
    mutationKey: ["attach-tag", noteId],
    mutationFn: async (tagId: number) => {
      const fetcher = postFetcher(`/notes/${noteId}/tags/${tagId}`);
      return await fetcher();
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
