import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { TagSchema } from "../new-note-form/types";

export function useCreateProject() {
  return useMutation({
    mutationKey: ["create-project"],
    mutationFn: async (name: string) => {
      const fetcher = postFetcher("/tags/create");
      const tag = await fetcher(JSON.stringify({ name, is_project: true }));
      return TagSchema.parse(tag);
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
