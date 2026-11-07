import {
  NoteItemSchema,
  NotePageSchema,
  ProjectListItemSchema,
  TagListItemSchema,
  TagSchema,
  type Difficulty,
  type NoteItem,
  type NotePage,
  type Rating,
} from "@web/notes/new-note-form/types";
import { newNoteReviewFields, type ReviewStatus } from "@web/notes/reviewStatus";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";

export const DUE_PAGE_SIZE = 25;
export const NOTES_PAGE_SIZE = 40;

export const noteKeys = {
  detail: (id: number) => ["notes", "detail", id] as const,
  list: (filters: NotesFilters) => ["notes", "list", filters] as const,
  due: ["due-notes"] as const,
};

const nextOffset = (page: NotePage, pages: NotePage[]) => {
  const loaded = pages.reduce((count, p) => count + p.items.length, 0);
  return loaded < page.total && page.items.length > 0 ? loaded : undefined;
};

export function useDueNotes() {
  return useInfiniteQuery({
    queryKey: noteKeys.due,
    queryFn: ({ pageParam, signal }) =>
      api(NotePageSchema, `/notes/due?limit=${DUE_PAGE_SIZE}&offset=${pageParam}`, { signal }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

export type NotesStatus = ReviewStatus;

export const NOTES_SORTS = [
  { value: "due", label: "Due date", order: "asc" },
  { value: "created", label: "Newest", order: "desc" },
  { value: "name", label: "Title", order: "asc" },
  { value: "difficulty", label: "Difficulty", order: "asc" },
  { value: "project", label: "Project", order: "asc" },
] as const;
export type NotesSort = (typeof NOTES_SORTS)[number]["value"];

export interface NotesFilters {
  search: string;
  projectId: number | null;
  tagId: number | null;
  status: NotesStatus | null;
  sort: NotesSort;
}

export function useNotes(filters: NotesFilters) {
  return useInfiniteQuery({
    queryKey: noteKeys.list(filters),
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        limit: String(NOTES_PAGE_SIZE),
        offset: String(pageParam),
        sort: filters.sort,
        order: NOTES_SORTS.find((option) => option.value === filters.sort)?.order ?? "asc",
      });
      if (filters.search.trim()) params.set("search", filters.search.trim());
      if (filters.projectId != null) params.set("project_id", String(filters.projectId));
      if (filters.tagId != null) params.set("tag_id", String(filters.tagId));
      if (filters.status) params.set("status", filters.status);
      return api(NotePageSchema, `/notes/list?${params}`, { signal });
    },
    initialPageParam: 0,
    getNextPageParam: nextOffset,
  });
}

export function useNote(id: number) {
  const queryClient = useQueryClient();
  return useQuery<NoteItem, Error, NoteItem, ReturnType<typeof noteKeys.detail>>({
    queryKey: noteKeys.detail(id),
    queryFn: ({ signal }) => api(NoteItemSchema, `/notes/${id}`, { signal }),
    placeholderData: (): NoteItem | undefined => findCachedNote(queryClient, id),
  });
}

function findCachedNote(queryClient: QueryClient, id: number): NoteItem | undefined {
  const pages = queryClient.getQueriesData<InfiniteData<NotePage>>({ queryKey: ["notes", "list"] });
  pages.push(...queryClient.getQueriesData<InfiniteData<NotePage>>({ queryKey: noteKeys.due }));
  for (const [, data] of pages) {
    for (const page of data?.pages ?? []) {
      const match = page.items.find((note) => note.id === id);
      if (match) return match;
    }
  }
  return undefined;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: ({ signal }) => api(z.array(ProjectListItemSchema), "/projects/list", { signal }),
    staleTime: 60_000,
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: ({ signal }) => api(z.array(TagListItemSchema), "/tags/list", { signal }),
    staleTime: 60_000,
  });
}

export const pendingReminder = (note: NoteItem) =>
  note.reminders.find((reminder) => reminder.reviewed_at === null) ?? null;

export const isDue = (note: NoteItem, now = new Date()) => {
  const pending = pendingReminder(note);
  return note.in_review && note.paused_at === null && pending !== null && pending.remind_at <= now;
};

function refreshAfterWrite(queryClient: QueryClient, note?: NoteItem) {
  if (note) queryClient.setQueryData(noteKeys.detail(note.id), note);
  void queryClient.invalidateQueries({ queryKey: ["notes"] });
  void queryClient.invalidateQueries({ queryKey: noteKeys.due });
  void queryClient.invalidateQueries({ queryKey: ["projects"] });
  void queryClient.invalidateQueries({ queryKey: ["tags"] });
}

function useNoteMutation<TVars>(mutationFn: (vars: TVars) => Promise<NoteItem>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (note) => refreshAfterWrite(queryClient, note),
  });
}

export function useRateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reminderId, rating }: { reminderId: number; rating: Rating }) =>
      api(NoteItemSchema, `/notes/reminders/${reminderId}/now`, {
        method: "PATCH",
        body: { action: "review", rating },
      }),
    onSuccess: (note) => queryClient.setQueryData(noteKeys.detail(note.id), note),
  });
}

export function useUndoReview() {
  return useNoteMutation(({ reminderId }: { reminderId: number }) =>
    api(NoteItemSchema, `/notes/reminders/${reminderId}/now`, {
      method: "PATCH",
      body: { action: "undo_review" },
    }),
  );
}

export function refreshReviews(queryClient: QueryClient) {
  refreshAfterWrite(queryClient);
}

export interface NewNote {
  name: string;
  content: string;
  difficulty: Difficulty;
  projectId: number | null;
  tagIds: number[];
  status: ReviewStatus;
}

export function useCreateNote() {
  return useNoteMutation((note: NewNote) =>
    api(NoteItemSchema, "/notes/create", {
      method: "POST",
      body: {
        name: note.name,
        content: note.content,
        difficulty: note.difficulty,
        project_id: note.projectId,
        tag_ids: note.tagIds,
        ...newNoteReviewFields(note.status),
        first_reminder_at: new Date().toISOString(),
      },
    }),
  );
}

export function useUpdateNote(id: number) {
  return useNoteMutation((body: { name: string; content: string }) =>
    api(NoteItemSchema, `/notes/${id}`, { method: "PATCH", body }),
  );
}

export function useSetDifficulty(id: number) {
  return useNoteMutation((difficulty: Difficulty) =>
    api(NoteItemSchema, `/notes/${id}/difficulty`, { method: "PATCH", body: { difficulty } }),
  );
}

export function useSetReviewStatus(id: number) {
  return useNoteMutation((status: ReviewStatus) =>
    api(NoteItemSchema, `/notes/${id}/status`, { method: "PATCH", body: { status } }),
  );
}

export function useSetProject(id: number) {
  return useNoteMutation((projectId: number | null) =>
    api(NoteItemSchema, `/notes/${id}/project`, {
      method: "PATCH",
      body: { project_id: projectId },
    }),
  );
}

export function useDeleteNote(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api(z.null(), `/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
      refreshAfterWrite(queryClient);
    },
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api(TagSchema, "/tags/create", { method: "POST", body: { name } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags"] }),
  });
}

export function useSetNoteTags(id: number) {
  return useNoteMutation(async ({ add, remove }: { add: number[]; remove: number[] }) => {
    let note: NoteItem | null = null;
    for (const tagId of add) {
      note = await api(NoteItemSchema, `/notes/${id}/tags/${tagId}`, { method: "POST" });
    }
    for (const tagId of remove) {
      note = await api(NoteItemSchema, `/notes/${id}/tags/${tagId}`, { method: "DELETE" });
    }
    return note ?? api(NoteItemSchema, `/notes/${id}`);
  });
}

export function useReschedule(id: number) {
  return useNoteMutation((remindAt: Date) =>
    api(NoteItemSchema, `/notes/${id}/reminders/pending`, {
      method: "PATCH",
      body: { remind_at: remindAt.toISOString() },
    }),
  );
}

const IntervalsSchema = z.object({
  again: z.coerce.date(),
  hard: z.coerce.date(),
  good: z.coerce.date(),
  easy: z.coerce.date(),
});
export type NoteIntervals = z.infer<typeof IntervalsSchema>;

export function useNoteIntervals(note: NoteItem | undefined, enabled = true) {
  return useQuery({
    queryKey: ["note-intervals", note?.id, note?.updated_at?.getTime()],
    queryFn: ({ signal }) => api(IntervalsSchema, `/notes/${note?.id}/intervals`, { signal }),
    enabled: enabled && note !== undefined && note.in_review,
    staleTime: 30_000,
  });
}

export async function fetchNoteMarkdown(id: number): Promise<string> {
  return api(z.string(), `/notes/${id}/markdown`, { raw: true });
}
