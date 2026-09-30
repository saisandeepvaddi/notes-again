import { getFetcher, getHeaders, getURL, postFetcher } from "@/utils/fetchers";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AuthModeSchema } from "@/auth/authStatus";
import { z } from "zod";

const SnapshotSchema = z.object({
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

export async function downloadDatabase(): Promise<void> {
  const response = await fetch(`${getURL()}/system/database`, {
    headers: await getHeaders(),
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Download failed with ${response.status}`);
  const match = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] ?? `notes-again-${format(new Date(), "yyyy-MM-dd")}.db`;
  link.click();
  URL.revokeObjectURL(url);
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
