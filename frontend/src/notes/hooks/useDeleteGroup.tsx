import { deleteFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";

export type GroupKind = "project" | "tag";

const GroupDeleteResultSchema = z.object({
  notes_trashed: z.number(),
  notes_kept: z.number(),
});

const ENDPOINTS: Record<GroupKind, string> = { project: "/projects", tag: "/tags" };

interface DeleteGroupVars {
  id: number;
  // Also move the group's notes to the trash. Otherwise the notes are kept
  // (a project's go to "no project"; a tag is just removed from its notes).
  deleteNotes: boolean;
}

export function useDeleteGroup(kind: GroupKind) {
  return useMutation({
    mutationKey: ["delete-group", kind],
    mutationFn: async ({ id, deleteNotes }: DeleteGroupVars) => {
      const fetcher = deleteFetcher(`${ENDPOINTS[kind]}/${id}?delete_notes=${deleteNotes}`);
      return GroupDeleteResultSchema.parse(await fetcher());
    },
    onSettled(_data, _error, _vars, _result, context) {
      // Notes lose their project/tag (and may move to the trash), so every
      // note-derived view is stale, not just the group list itself.
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
