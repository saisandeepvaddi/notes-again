import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { CreatedApiTokenSchema, type TokenScope } from "./types";

interface CreateApiTokenInput {
  name: string;
  expiresInDays: number | null;
  scope: TokenScope;
}

export function useCreateApiToken() {
  return useMutation({
    mutationKey: ["create-api-token"],
    mutationFn: async ({ name, expiresInDays, scope }: CreateApiTokenInput) => {
      const data = await postFetcher("/tokens/create")(
        JSON.stringify({ name, expires_in_days: expiresInDays, scope }),
      );
      return CreatedApiTokenSchema.parse(data);
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
}
