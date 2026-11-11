import { getFetcher } from "@/utils/fetchers";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { REVIEW_STATUSES } from "../notes/reviewStatus";

const SEARCH_DEBOUNCE_MS = 120;

const NoteHitSchema = z.object({
  id: z.number(),
  uid: z.string(),
  title: z.string(),
  title_marked: z.string(),
  snippet: z.string(),
  project: z.object({ id: z.number(), name: z.string() }).nullable().optional(),
  status: z.enum(REVIEW_STATUSES),
  updated_at: z.coerce.date(),
});

const NamedHitSchema = z.object({
  id: z.number(),
  name: z.string(),
  name_marked: z.string(),
  note_count: z.number(),
});

const SearchResultsSchema = z.object({
  notes: z.array(NoteHitSchema),
  projects: z.array(NamedHitSchema),
  tags: z.array(NamedHitSchema),
});

export type NoteHit = z.infer<typeof NoteHitSchema>;
export type NamedHit = z.infer<typeof NamedHitSchema>;
export type SearchResults = z.infer<typeof SearchResultsSchema>;

function useDebounced<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useSearch(query: string, enabled: boolean) {
  const q = useDebounced(query.trim(), SEARCH_DEBOUNCE_MS);
  const result = useQuery<SearchResults>({
    queryKey: ["notes", "search", q],
    queryFn: ({ signal }) =>
      getFetcher(`/search?q=${encodeURIComponent(q)}`, { signal })().then((body) =>
        SearchResultsSchema.parse(body),
      ),
    enabled: enabled && q.length > 0,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
  return { ...result, settledQuery: q, pending: query.trim() !== q || result.isFetching };
}
