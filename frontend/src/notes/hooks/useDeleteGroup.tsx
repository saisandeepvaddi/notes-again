import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

export type GroupKind = "project" | "tag";

const GroupDeleteResultSchema = z.object({
  notes_trashed: z.number(),
  notes_kept: z.number(),
  tags_deleted: z.number(),
});

const ENDPOINTS: Record<GroupKind, string> = { project: "/projects", tag: "/tags" };

interface DeleteGroupVars {
  id: number;
  deleteNotes: boolean;
  deleteUnusedTags?: boolean;
}

export function useDeleteGroup(kind: GroupKind) {
  return useMutation({
    mutationKey: ["delete-group", kind],
    mutationFn: async ({ id, deleteNotes, deleteUnusedTags = false }: DeleteGroupVars) => {
      const params = new URLSearchParams({
        delete_notes: String(deleteNotes),
        delete_orphan_tags: String(deleteUnusedTags),
      });
      const fetcher = deleteFetcher(`${ENDPOINTS[kind]}/${id}?${params}`);
      return GroupDeleteResultSchema.parse(await fetcher());
    },
    onSettled(_data, _error, _vars, _result, context) {
      for (const key of [
        "projects",
        "tags",
        "notes",
        "due-notes",
        "notes-calendar",
        "trashed-notes",
      ]) {
        context.client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
