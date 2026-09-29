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

function filenameFrom(disposition: string | null) {
  const match = disposition?.match(/filename="?([^";]+)"?/);
  return match?.[1] ?? `note-and-learn-${format(new Date(), "yyyy-MM-dd")}.json`;
}

export async function downloadExport(options: ExportOptions): Promise<void> {
  const response = await fetch(`${getURL()}/export/notes`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify(options),
  });
  if (!response.ok) throw new Error(`Export failed with ${response.status}`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFrom(response.headers.get("Content-Disposition"));
  link.click();
  URL.revokeObjectURL(url);
}
