import { useInfiniteNotes } from "../notes-list/useInfiniteNotes";

export function useTrashedNotes() {
  return useInfiniteNotes("trashed-notes", { deleted: true, sort: "created", order: "desc" });
}
