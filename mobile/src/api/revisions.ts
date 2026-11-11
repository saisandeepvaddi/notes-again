import { NoteItemSchema } from "@web/notes/new-note-form/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";
import { noteKeys } from "./notes";

const SummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  created_at: z.string(),
  characters: z.number(),
});
const RevisionSchema = SummarySchema.omit({ characters: true }).extend({ content: z.string() });
export type RevisionSummary = z.infer<typeof SummarySchema>;

export function useRevisionList(noteId: number) {
  return useQuery({
    queryKey: ["notes", "revisions", noteId],
    queryFn: ({ signal }) => api(z.array(SummarySchema), `/notes/${noteId}/revisions`, { signal }),
  });
}

export function useRevision(noteId: number, revisionId: number | null) {
  return useQuery({
    queryKey: ["notes", "revisions", noteId, revisionId],
    enabled: revisionId !== null,
    queryFn: ({ signal }) =>
      api(RevisionSchema, `/notes/${noteId}/revisions/${revisionId}`, { signal }),
  });
}

export function useRestoreRevision(noteId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (revisionId: number) =>
      api(NoteItemSchema, `/notes/${noteId}/revisions/${revisionId}/restore`, { method: "POST" }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: noteKeys.due });
    },
  });
}
