import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./client";

const BacklinkSchema = z.object({ id: z.number(), title: z.string(), snippet: z.string() });
const TargetSchema = z.object({
  uid: z.string(),
  id: z.number(),
  name: z.string(),
  trashed: z.boolean(),
});

export function useBacklinks(noteId: number) {
  return useQuery({
    queryKey: ["notes", "backlinks", noteId],
    queryFn: ({ signal }) => api(z.array(BacklinkSchema), `/notes/${noteId}/backlinks`, { signal }),
  });
}

export function fetchLinkTarget(uid: string) {
  return api(z.array(TargetSchema), `/notes/link-targets?uids=${uid}`).then(([target]) => target);
}
