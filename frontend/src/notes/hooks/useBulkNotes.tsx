import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import type { Difficulty } from "../new-note-form/types";

const BulkResultSchema = z.object({ affected: z.number() });

// One entry per POST /notes/bulk/<action>, with that action's extra fields.
export type BulkAction =
  | { action: "delete" }
  | { action: "restore" }
  | { action: "permanent" }
  | { action: "project"; project_id: number | null }
  | { action: "tags"; add_tag_ids?: number[]; remove_tag_ids?: number[] }
  | { action: "difficulty"; difficulty: Difficulty }
  | { action: "reschedule"; remind_at: string };

export function useBulkNotes() {
  return useMutation({
    mutationKey: ["bulk-notes"],
    mutationFn: async ({ noteIds, ...request }: BulkAction & { noteIds: number[] }) => {
      const { action, ...extra } = request;
      const fetcher = postFetcher(`/notes/bulk/${action}`);
      return BulkResultSchema.parse(await fetcher(JSON.stringify({ note_ids: noteIds, ...extra })));
    },
    onSettled(_data, _error, _vars, _result, context) {
      // Notes moved between projects/tags/trash or rescheduled: every
      // note-derived view (and the per-project/tag counts) is stale.
      for (const key of [
        "notes",
        "due-notes",
        "notes-calendar",
        "trashed-notes",
        "projects",
        "tags",
      ]) {
        context.client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
