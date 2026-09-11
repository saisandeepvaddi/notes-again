import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { TagSchema } from "../new-note-form/types";

export function useCreateTag() {
  return useMutation({
    mutationKey: ["create-tag"],
    mutationFn: async (name: string) => {
      const fetcher = postFetcher("/tags/create");
      const tag = await fetcher(JSON.stringify({ name }));
      return TagSchema.parse(tag);
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
