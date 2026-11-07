import { filenameFromDisposition, saveBlob } from "@/lib/saveFile";
import { getFetcher, getHeaders, getURL, postFetcher, putFetcher } from "@/utils/fetchers";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AuthModeSchema } from "@/auth/authStatus";
import { z } from "zod";

export const SnapshotSchema = z.object({
  name: z.string(),
  created_at: z.string(),
  size_bytes: z.number(),
});

export const SystemInfoSchema = z.object({
  database_path: z.string(),
  database_size_bytes: z.number(),
  sqlite_version: z.string(),
  note_count: z.number(),
  in_container: z.boolean(),
  auth_mode: AuthModeSchema,
  backups: z.object({
    directory: z.string(),
    default_directory: z.string(),
    custom_directory: z.boolean(),
    can_change_directory: z.boolean(),
    can_restore: z.boolean(),
    interval_hours: z.number(),
    keep: z.number(),
    count: z.number(),
    latest: SnapshotSchema.nullable(),
    offsite_url: z.string().nullable(),
  }),
});
export type SystemInfo = z.infer<typeof SystemInfoSchema>;

export function useSystemInfo() {
  return useSuspenseQuery({
    queryKey: ["system"],
    queryFn: () => getFetcher("/system")().then((data) => SystemInfoSchema.parse(data)),
  });
}

export function useSnapshotNow() {
  return useMutation({
    mutationKey: ["snapshot-now"],
    mutationFn: async () => SnapshotSchema.parse(await postFetcher("/system/snapshot")()),
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["system"] });
    },
  });
}

export type Snapshot = z.infer<typeof SnapshotSchema>;

export function useSnapshots() {
  return useQuery({
    queryKey: ["system", "snapshots"],
    queryFn: async () => z.array(SnapshotSchema).parse(await getFetcher("/system/snapshots")()),
  });
}

export function useSetBackupFolder() {
  return useMutation({
    mutationKey: ["backup-folder"],
    mutationFn: async (directory: string | null) =>
      SystemInfoSchema.parse(await putFetcher("/system/backups")(JSON.stringify({ directory }))),
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["system"] });
    },
  });
}

export function useRestoreSnapshot() {
  return useMutation({
    mutationKey: ["restore-snapshot"],
    mutationFn: (name: string) =>
      postFetcher(`/system/snapshots/${encodeURIComponent(name)}/restore`)(),
  });
}

export function downloadSnapshot(name: string): Promise<void> {
  return downloadFile(`/system/snapshots/${encodeURIComponent(name)}`, name);
}

export function downloadDatabase(): Promise<void> {
  return downloadFile("/system/database", `notes-again-${format(new Date(), "yyyy-MM-dd")}.db`);
}

async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${getURL()}${path}`, {
    headers: await getHeaders(),
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Download failed with ${response.status}`);
  saveBlob(
    await response.blob(),
    filenameFromDisposition(response.headers.get("Content-Disposition")) ?? fallbackName,
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
