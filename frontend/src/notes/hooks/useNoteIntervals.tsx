import { getFetcher } from "@/utils/fetchers";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

const IntervalsSchema = z.object({
  again: z.coerce.date(),
  hard: z.coerce.date(),
  good: z.coerce.date(),
  easy: z.coerce.date(),
});

export type NoteIntervals = z.infer<typeof IntervalsSchema>;

export function useNoteIntervals(noteId: number, enabled = true) {
  return useQuery({
    queryKey: ["note-intervals", noteId],
    queryFn: () =>
      getFetcher(`/notes/${noteId}/intervals`)().then((data) => IntervalsSchema.parse(data)),
    enabled,
    staleTime: 30_000,
  });
}
