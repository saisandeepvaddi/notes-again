import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

export function useEmptyTrash() {
  return useMutation({
    mutationKey: ["empty-trash"],
    mutationFn: async () => {
      const fetcher = deleteFetcher("/notes/trash");
      return await fetcher();
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["trashed-notes"] });
    },
  });
}
