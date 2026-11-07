import {
  AlgorithmSchema,
  NoteItemSchema,
  NotePageSchema,
  type Algorithm,
  type Difficulty,
} from "@web/notes/new-note-form/types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";
import { NOTES_PAGE_SIZE } from "./notes";

function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["due-notes"] });
    void queryClient.invalidateQueries({ queryKey: ["trashed-notes"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["tags"] });
  };
}

export function useTrashedNotes() {
  return useInfiniteQuery({
    queryKey: ["trashed-notes"],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        limit: String(NOTES_PAGE_SIZE),
        offset: String(pageParam),
        deleted: "true",
      });
      return api(NotePageSchema, `/notes/list?${params}`, { signal });
    },
    initialPageParam: 0,
    getNextPageParam: (page, pages) => {
      const loaded = pages.reduce((count, p) => count + p.items.length, 0);
      return loaded < page.total && page.items.length > 0 ? loaded : undefined;
    },
  });
}

export function useRestoreNote() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: number) => api(NoteItemSchema, `/notes/${id}/restore`, { method: "PATCH" }),
    onSuccess: refresh,
  });
}

export function useDeleteForever() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: number) => api(z.null(), `/notes/${id}/permanent`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useEmptyTrash() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api(z.null(), "/notes/trash", { method: "DELETE" }),
    onSuccess: refresh,
  });
}

const AffectedSchema = z.object({ affected: z.number() }).loose();
const DeleteResultSchema = z.object({
  notes_trashed: z.number(),
  notes_kept: z.number(),
  tags_deleted: z.number(),
});

export type GroupKind = "projects" | "tags";
export type GroupAction = "pause" | "resume" | "remove-from-review" | "add-to-review";

export function useGroupAction() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ kind, id, action }: { kind: GroupKind; id: number; action: GroupAction }) =>
      api(AffectedSchema, `/${kind}/${id}/${action}`, {
        method: "POST",
        body: action === "resume" || action === "add-to-review" ? { per_day: 0 } : undefined,
      }),
    onSuccess: refresh,
  });
}

export function useDeleteGroup() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({
      kind,
      id,
      deleteNotes,
    }: {
      kind: GroupKind;
      id: number;
      deleteNotes: boolean;
    }) =>
      api(DeleteResultSchema, `/${kind}/${id}?delete_notes=${deleteNotes}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export function useCreateProject() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (name: string) =>
      api(z.object({ id: z.number() }).loose(), "/projects/create", {
        method: "POST",
        body: { name },
      }),
    onSuccess: refresh,
  });
}

export function useDeleteUnusedTags() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api(DeleteResultSchema, "/tags/unused", { method: "DELETE" }),
    onSuccess: refresh,
  });
}

export type BulkChange =
  | { action: "delete" | "pause" | "remove-from-review" }
  | { action: "resume" | "add-to-review" }
  | { action: "project"; projectId: number | null }
  | { action: "difficulty"; difficulty: Difficulty };

function bulkBody(noteIds: number[], change: BulkChange) {
  switch (change.action) {
    case "project":
      return { note_ids: noteIds, project_id: change.projectId };
    case "difficulty":
      return { note_ids: noteIds, difficulty: change.difficulty };
    case "resume":
    case "add-to-review":
      return { note_ids: noteIds, per_day: 0 };
    default:
      return { note_ids: noteIds };
  }
}

export function useBulkChange() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ noteIds, change }: { noteIds: number[]; change: BulkChange }) =>
      api(AffectedSchema, `/notes/bulk/${change.action}`, {
        method: "POST",
        body: bulkBody(noteIds, change),
      }),
    onSuccess: refresh,
  });
}

const SettingsSchema = z.object({ default_algorithm: AlgorithmSchema });

export function useAppSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: ({ signal }) => api(SettingsSchema, "/settings", { signal }),
  });
}

export function useSetDefaultAlgorithm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (algorithm: Algorithm) =>
      api(SettingsSchema, "/settings", {
        method: "PATCH",
        body: { default_algorithm: algorithm },
      }),
    onSuccess: (settings) => queryClient.setQueryData(["settings"], settings),
  });
}

export async function exportLibrary(): Promise<string> {
  return api(z.string(), "/export/notes", { method: "POST", body: {}, raw: true });
}

const ImportResultSchema = z
  .object({
    dry_run: z.boolean(),
    notes_created: z.number(),
    new_decks: z.number(),
    new_tags: z.number(),
    duplicates_skipped: z.number(),
    invalid_skipped: z.number(),
    restored_reviews: z.number().default(0),
    warnings: z.array(z.string()).default([]),
  })
  .loose();
export type ImportResult = z.infer<typeof ImportResultSchema>;

export function useImportLibrary() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: ({ payload, dryRun }: { payload: unknown; dryRun: boolean }) =>
      api(ImportResultSchema, "/import/notes", {
        method: "POST",
        body: { payload, dry_run: dryRun },
      }),
    onSuccess: (result) => {
      if (!result.dry_run) refresh();
    },
  });
}
