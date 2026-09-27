import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import type { Difficulty } from "../new-note-form/types";

const BulkResultSchema = z.object({
  affected: z.number(),
  due_today: z.number().optional(),
  days_span: z.number().optional(),
});
export type BulkResult = z.infer<typeof BulkResultSchema>;

export type BulkAction =
  | { action: "delete" }
  | { action: "restore" }
  | { action: "permanent" }
  | { action: "project"; project_id: number | null }
  | { action: "tags"; add_tag_ids?: number[]; remove_tag_ids?: number[] }
  | { action: "difficulty"; difficulty: Difficulty }
  | { action: "reschedule"; remind_at: string }
  | { action: "pause" }
  | { action: "resume"; per_day: number; tz_offset_minutes: number };

export function useBulkNotes() {
  return useMutation({
    mutationKey: ["bulk-notes"],
    mutationFn: async ({ noteIds, ...request }: BulkAction & { noteIds: number[] }) => {
      const { action, ...extra } = request;
      const fetcher = postFetcher(`/notes/bulk/${action}`);
      return BulkResultSchema.parse(await fetcher(JSON.stringify({ note_ids: noteIds, ...extra })));
    },
    onSettled(_data, _error, _vars, _result, context) {
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
