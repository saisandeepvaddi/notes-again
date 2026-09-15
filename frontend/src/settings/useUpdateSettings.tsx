import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import type { Algorithm } from "./types";

export function useUpdateSettings() {
  return useMutation({
    mutationKey: ["update-settings"],
    mutationFn: async (default_algorithm: Algorithm) => {
      const fetcher = patchFetcher("/settings");
      return await fetcher(JSON.stringify({ default_algorithm }));
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
