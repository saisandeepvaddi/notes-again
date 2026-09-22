import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

const UnusedTagsResultSchema = z.object({ tags_deleted: z.number() });

export function useDeleteUnusedTags() {
  return useMutation({
    mutationKey: ["delete-unused-tags"],
    mutationFn: async () => {
      const fetcher = deleteFetcher("/tags/unused");
      return UnusedTagsResultSchema.parse(await fetcher());
    },
    onSettled(_data, _error, _vars, _result, context) {
      // Trashed notes may lose a tag too, and the filter bar lists tags.
      for (const key of ["tags", "notes", "trashed-notes"]) {
        context.client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
