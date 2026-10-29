import { useAuth } from "@/auth/AuthProvider";
import { deleteFetcher, getFetcher, postFetcher, putFetcher } from "@/utils/fetchers";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { z } from "zod";

export const SYNC_STATUS_KEY = ["sync", "status"] as const;
export const SYNC_CONFLICTS_KEY = ["sync", "conflicts"] as const;

const STATUS_POLL_MS = 10_000;
const SYNCING_POLL_MS = 1_000;

export const SyncStatusSchema = z.object({
  connected: z.boolean(),
  url: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  syncing: z.boolean().optional().default(false),
  pending: z.boolean().optional().default(false),
  conflicts: z.number().optional().default(0),
  last_synced_at: z.string().nullable().optional(),
  last_changed_at: z.string().nullable().optional(),
  last_error: z.string().nullable().optional(),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;

export const SyncConflictSchema = z.object({
  note_id: z.number(),
  name: z.string(),
  content: z.string(),
  their_name: z.string(),
  their_content: z.string(),
  detected_at: z.string(),
});
export type SyncConflict = z.infer<typeof SyncConflictSchema>;

export function useIsDesktop() {
  return useAuth().status?.configured_mode === "desktop";
}

export function useSyncStatus() {
  const isDesktop = useIsDesktop();
  return useQuery({
    queryKey: SYNC_STATUS_KEY,
    queryFn: () => getFetcher("/sync/status")().then((data) => SyncStatusSchema.parse(data)),
    enabled: isDesktop,
    refetchInterval: (query) => (query.state.data?.syncing ? SYNCING_POLL_MS : STATUS_POLL_MS),
  });
}

export function useSyncConflicts() {
  const { data: status } = useSyncStatus();
  return useQuery({
    queryKey: SYNC_CONFLICTS_KEY,
    queryFn: () =>
      getFetcher("/sync/conflicts")().then((data) => z.array(SyncConflictSchema).parse(data)),
    enabled: Boolean(status?.connected),
  });
}

export function useNoteConflict(noteId: number) {
  const { data: conflicts } = useSyncConflicts();
  return conflicts?.find((conflict) => conflict.note_id === noteId) ?? null;
}

export function refreshSyncedData(client: QueryClient) {
  for (const queryKey of [
    ["notes"],
    ["due-notes"],
    ["trashed-notes"],
    ["projects"],
    ["tags"],
    ["settings"],
    ["sync"],
  ]) {
    void client.invalidateQueries({ queryKey });
  }
}

export function syncedAgo(iso: string) {
  const date = new Date(iso);
  if (Date.now() - date.getTime() < 60_000) return "just now";
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export interface ConnectInput {
  url: string;
  username?: string;
  password?: string;
  token?: string;
}

export function useConnectSync() {
  return useMutation({
    mutationKey: ["connect-sync"],
    mutationFn: (input: ConnectInput) =>
      putFetcher("/sync/remote")(JSON.stringify(input)).then((data) =>
        SyncStatusSchema.parse(data),
      ),
    onSuccess(data, _vars, _result, context) {
      context.client.setQueryData(SYNC_STATUS_KEY, data);
    },
    onSettled(_data, _error, _vars, _result, context) {
      void context.client.invalidateQueries({ queryKey: ["sync"] });
    },
  });
}

export function useDisconnectSync() {
  return useMutation({
    mutationKey: ["disconnect-sync"],
    mutationFn: () => deleteFetcher("/sync/remote")(),
    onSettled(_data, _error, _vars, _result, context) {
      void context.client.invalidateQueries({ queryKey: ["sync"] });
    },
  });
}

export function useRunSync() {
  return useMutation({
    mutationKey: ["run-sync"],
    mutationFn: () => postFetcher("/sync/run")().then((data) => SyncStatusSchema.parse(data)),
    onSuccess(data, _vars, _result, context) {
      context.client.setQueryData(SYNC_STATUS_KEY, data);
      refreshSyncedData(context.client);
    },
  });
}

export function useResolveConflict(noteId: number) {
  return useMutation({
    mutationKey: ["resolve-conflict", noteId],
    mutationFn: (text: { name: string; content: string }) =>
      postFetcher(`/sync/conflicts/${noteId}/resolve`)(JSON.stringify(text)),
    onSettled(_data, _error, _vars, _result, context) {
      void context.client.invalidateQueries({ queryKey: ["sync"] });
      void context.client.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
