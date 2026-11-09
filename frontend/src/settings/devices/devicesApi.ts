import { getFetcher, postFetcher, putFetcher } from "@/utils/fetchers";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";

const ConnectionsSchema = z.object({
  local_url: z.string().nullable(),
  network: z.object({
    enabled: z.boolean(),
    port: z.number().nullable(),
    fingerprint: z.string().nullable().default(null),
    urls: z.array(z.string()),
    paired_devices: z.number(),
  }),
});
export type Connections = z.infer<typeof ConnectionsSchema>;

const PairingSchema = z.object({
  token: z.string(),
  server: z.string(),
  alt: z.string().nullable(),
  fingerprint: z.string(),
});
export type Pairing = z.infer<typeof PairingSchema>;

const CreatedTokenSchema = z.object({ token: z.string() });

const CONNECTIONS_KEY = ["system", "connections"] as const;

export function useConnections() {
  return useSuspenseQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: async () => ConnectionsSchema.parse(await getFetcher("/desktop/connections")()),
  });
}

export function useSetNetworkAccess() {
  return useMutation({
    mutationKey: ["network-access"],
    mutationFn: async (enabled: boolean) =>
      ConnectionsSchema.parse(await putFetcher("/desktop/network")(JSON.stringify({ enabled }))),
    onSuccess(data, _vars, _result, context) {
      context.client.setQueryData(CONNECTIONS_KEY, data);
      context.client.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
}

export function usePairPhone() {
  return useMutation({
    mutationKey: ["pair-phone"],
    mutationFn: async () => PairingSchema.parse(await postFetcher("/desktop/network/pair")()),
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      context.client.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
}

export function useCreateExtensionToken() {
  return useMutation({
    mutationKey: ["extension-token"],
    mutationFn: async () =>
      CreatedTokenSchema.parse(
        await postFetcher("/tokens/create")(
          JSON.stringify({ name: "Browser extension", scope: "capture" }),
        ),
      ),
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });
}
