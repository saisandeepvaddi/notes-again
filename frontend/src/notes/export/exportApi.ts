import { filenameFromDisposition, saveBlob } from "@/lib/saveFile";
import { getHeaders, getURL, postFetcher } from "@/utils/fetchers";
import { format } from "date-fns";
import { z } from "zod";

export interface ExportOptions {
  project_ids: number[];
  include_no_project: boolean;
  tag_ids: number[];
  note_ids: number[] | null;
  include_paused: boolean;
  include_review: boolean;
}

const ExportCountSchema = z.object({ notes: z.number(), decks: z.number() });
export type ExportCount = z.infer<typeof ExportCountSchema>;

export async function fetchExportCount(options: ExportOptions): Promise<ExportCount> {
  return ExportCountSchema.parse(await postFetcher("/export/count")(JSON.stringify(options)));
}

export async function downloadExport(options: ExportOptions): Promise<void> {
  const response = await fetch(`${getURL()}/export/notes`, {
    method: "POST",
    headers: await getHeaders(),
    credentials: "include",
    body: JSON.stringify(options),
  });
  if (!response.ok) throw new Error(`Export failed with ${response.status}`);
  saveBlob(
    await response.blob(),
    filenameFromDisposition(response.headers.get("Content-Disposition")) ??
      `notes-again-${format(new Date(), "yyyy-MM-dd")}.json`,
  );
}
