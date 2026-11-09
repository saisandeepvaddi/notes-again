import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";

const SyncStatusSchema = z.object({
  connected: z.boolean(),
  url: z.string().nullable().default(null),
  username: z.string().nullable().default(null),
  syncing: z.boolean().default(false),
  pending: z.boolean().default(false),
  conflicts: z.number().default(0),
  last_synced_at: z.coerce.date().nullable().default(null),
  last_error: z.string().nullable().default(null),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

const ConflictSchema = z.object({
  note_id: z.number(),
  name: z.string(),
  content: z.string(),
  their_name: z.string(),
  their_content: z.string(),
});
export type SyncConflict = z.infer<typeof ConflictSchema>;

export const SYNC_KEY = ["sync"] as const;

export function useSyncStatus(enabled = true) {
  return useQuery({
    queryKey: [...SYNC_KEY, "status"],
    queryFn: ({ signal }) => api(SyncStatusSchema, "/sync/status", { signal }),
    enabled,
    refetchInterval: (query) => (query.state.data?.syncing ? 2_000 : 15_000),
  });
}

export function useSyncConflicts(enabled: boolean) {
  return useQuery({
    queryKey: [...SYNC_KEY, "conflicts"],
    queryFn: ({ signal }) => api(z.array(ConflictSchema), "/sync/conflicts", { signal }),
    enabled,
  });
}

function useRefreshAfterSync() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries();
}

export type SyncTarget =
  | { url: string; token: string; fingerprint?: string }
  | { url: string; username: string; password: string };

export function useConnectSync() {
  const refresh = useRefreshAfterSync();
  return useMutation({
    mutationFn: (target: SyncTarget) =>
      api(SyncStatusSchema, "/sync/remote", { method: "PUT", body: target }),
    onSuccess: refresh,
  });
}

export function useDisconnectSync() {
  const refresh = useRefreshAfterSync();
  return useMutation({
    mutationFn: () => api(z.null(), "/sync/remote", { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useSyncNow() {
  const refresh = useRefreshAfterSync();
  return useMutation({
    mutationFn: () => api(SyncStatusSchema, "/sync/run", { method: "POST" }),
    onSuccess: refresh,
  });
}

export function useResolveConflict() {
  const refresh = useRefreshAfterSync();
  return useMutation({
    mutationFn: ({ noteId, name, content }: { noteId: number; name: string; content: string }) =>
      api(z.null(), `/sync/conflicts/${noteId}/resolve`, {
        method: "POST",
        body: { name, content },
      }),
    onSuccess: refresh,
  });
}
