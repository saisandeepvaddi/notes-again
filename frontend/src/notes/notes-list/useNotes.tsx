import { getFetcher } from "@/utils/fetchers";
import { useSuspenseQuery, type UseSuspenseQueryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { NoteItemSchema, type NoteItem } from "../new-note-form/types";

export interface GetUseNotesOptionsArgs {
  date?: Date;
  tagId?: number;
  projectId?: number;
}

const getUseNotesOptions = (
  options?: GetUseNotesOptionsArgs,
): UseSuspenseQueryOptions<NoteItem[]> => {
  const { date, tagId, projectId } = options ?? {};
  const dateRange = date
    ? {
        start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
      }
    : undefined;

  const params = new URLSearchParams();
  if (dateRange) {
    params.set("start", dateRange.start.toISOString());
    params.set("end", dateRange.end.toISOString());
  }
  if (tagId != null) {
    params.set("tag_id", String(tagId));
  }
  if (projectId != null) {
    params.set("project_id", String(projectId));
  }
  const queryString = params.toString();

  return {
    queryKey: [
      "notes",
      dateRange?.start.toISOString(),
      dateRange?.end.toISOString(),
      tagId,
      projectId,
    ],
    queryFn: () =>
      getFetcher(queryString ? `/notes/list?${queryString}` : "/notes/list")()
        .then((notes) => {
          return z.array(NoteItemSchema).parse(notes);
        })
        .catch((error) => {
          console.error("Note List parse error: ", error);
          throw new Error("Invalid notes format received");
        }),
  };
};

export function useNotes(options?: GetUseNotesOptionsArgs) {
  return useSuspenseQuery<NoteItem[]>(getUseNotesOptions(options));
}
