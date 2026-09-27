import { patchFetcher, postFetcher } from "@/utils/fetchers";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { NoteItemSchema } from "../new-note-form/types";
import type { GroupKind } from "./useDeleteGroup";

function invalidatePausing(client: QueryClient) {
  for (const key of ["notes", "due-notes", "notes-calendar", "projects", "tags"]) {
    client.invalidateQueries({ queryKey: [key] });
  }
}

export const PauseResultSchema = z.object({ affected: z.number() });

export const ResumeResultSchema = z.object({
  affected: z.number(),
  due_today: z.number(),
  days_span: z.number(),
});
export type ResumeResult = z.infer<typeof ResumeResultSchema>;

export const DEFAULT_RESUME_PER_DAY = 10;

export function resumeBody(perDay: number) {
  return { per_day: perDay, tz_offset_minutes: new Date().getTimezoneOffset() };
}

export function resumeSummary({ affected, due_today, days_span }: ResumeResult) {
  const notes = `${affected.toLocaleString()} note${affected === 1 ? "" : "s"}`;
  if (days_span > 1) {
    return `Resumed ${notes}: ${due_today.toLocaleString()} due today, the rest spread over ${days_span} days.`;
  }
  return `Resumed ${notes}: ${due_today.toLocaleString()} due today.`;
}

export function useSetNotePaused(noteId: number) {
  return useMutation({
    mutationKey: ["set-paused", noteId],
    mutationFn: async (paused: boolean) => {
      const fetcher = patchFetcher(`/notes/${noteId}/paused`);
      return NoteItemSchema.parse(await fetcher(JSON.stringify({ paused })));
    },
    onSettled(_data, _error, _vars, _result, context) {
      invalidatePausing(context.client);
    },
  });
}

const GROUP_ENDPOINTS: Record<GroupKind, string> = { project: "/projects", tag: "/tags" };

export function usePauseGroup(kind: GroupKind) {
  return useMutation({
    mutationKey: ["pause-group", kind],
    mutationFn: async (id: number) => {
      const fetcher = postFetcher(`${GROUP_ENDPOINTS[kind]}/${id}/pause`);
      return PauseResultSchema.parse(await fetcher(JSON.stringify({})));
    },
    onSettled(_data, _error, _vars, _result, context) {
      invalidatePausing(context.client);
    },
  });
}

export function useResumeGroup(kind: GroupKind) {
  return useMutation({
    mutationKey: ["resume-group", kind],
    mutationFn: async ({ id, perDay }: { id: number; perDay: number }) => {
      const fetcher = postFetcher(`${GROUP_ENDPOINTS[kind]}/${id}/resume`);
      return ResumeResultSchema.parse(await fetcher(JSON.stringify(resumeBody(perDay))));
    },
    onSettled(_data, _error, _vars, _result, context) {
      invalidatePausing(context.client);
    },
  });
}
