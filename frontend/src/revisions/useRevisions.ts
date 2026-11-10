import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getFetcher, postFetcher } from "@/utils/fetchers";
import { NoteItemSchema } from "@/notes/new-note-form/types";

const SummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  created_at: z.string(),
  characters: z.number(),
});
const RevisionSchema = SummarySchema.omit({ characters: true }).extend({ content: z.string() });
export type RevisionSummary = z.infer<typeof SummarySchema>;

export function useRevisionList(noteId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["notes", "revisions", noteId],
    enabled,
    queryFn: () =>
      getFetcher(`/notes/${noteId}/revisions`)().then((rows) => z.array(SummarySchema).parse(rows)),
  });
}

export function useRevision(noteId: number, revisionId: number | null) {
  return useQuery({
    queryKey: ["notes", "revisions", noteId, revisionId],
    enabled: revisionId !== null,
    queryFn: () =>
      getFetcher(`/notes/${noteId}/revisions/${revisionId}`)().then((row) =>
        RevisionSchema.parse(row),
      ),
  });
}

export function useRestoreRevision(noteId: number) {
  return useMutation({
    mutationKey: ["restore-revision", noteId],
    mutationFn: async (revisionId: number) =>
      NoteItemSchema.parse(await postFetcher(`/notes/${noteId}/revisions/${revisionId}/restore`)()),
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
