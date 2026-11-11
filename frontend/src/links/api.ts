import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getFetcher } from "@/utils/fetchers";

const BacklinkSchema = z.object({ id: z.number(), title: z.string(), snippet: z.string() });
const TargetSchema = z.object({
  uid: z.string(),
  id: z.number(),
  name: z.string(),
  trashed: z.boolean(),
});
export type LinkTarget = z.infer<typeof TargetSchema>;

export function useBacklinks(noteId: number) {
  return useQuery({
    queryKey: ["notes", "backlinks", noteId],
    queryFn: ({ signal }) =>
      getFetcher(`/notes/${noteId}/backlinks`, { signal })().then((rows) =>
        z.array(BacklinkSchema).parse(rows),
      ),
  });
}

export function fetchLinkTargets(uids: string[]) {
  return getFetcher(`/notes/link-targets?uids=${uids.join(",")}`)().then((rows) =>
    z.array(TargetSchema).parse(rows),
  );
}

export function useLinkTargets(uids: string[]) {
  const key = [...new Set(uids)].sort().slice(0, 50);
  return useQuery({
    queryKey: ["notes", "link-targets", key],
    enabled: key.length > 0,
    queryFn: () => fetchLinkTargets(key),
  });
}
