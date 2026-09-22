import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

export function useRevokeApiToken() {
  return useMutation({
    mutationKey: ["revoke-api-token"],
    mutationFn: (id: number) => deleteFetcher(`/tokens/${id}`)(),
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
}
