import { postFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import { newNoteReviewFields, type ReviewStatus } from "@/notes/reviewStatus";
import { ImportResultSchema } from "./types";

interface ImportArgs {
  payload: unknown;
  perDay: number;
  defaultDeck: string;
  dryRun: boolean;
  status: ReviewStatus;
}

export function useImportNotes() {
  return useMutation({
    mutationKey: ["import-notes"],
    mutationFn: async ({ payload, perDay, defaultDeck, dryRun, status }: ImportArgs) => {
      const fetcher = postFetcher("/import/notes");
      const result = await fetcher(
        JSON.stringify({
          payload,
          per_day: perDay,
          default_deck: defaultDeck.trim() || null,
          tz_offset_minutes: new Date().getTimezoneOffset(),
          dry_run: dryRun,
          ...newNoteReviewFields(status),
        }),
      );
      return ImportResultSchema.parse(result);
    },
    onSettled(_data, _error, variables, _result, context) {
      if (variables.dryRun) {
        return;
      }
      for (const key of ["notes", "due-notes", "notes-calendar", "projects", "tags"]) {
        context.client.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
