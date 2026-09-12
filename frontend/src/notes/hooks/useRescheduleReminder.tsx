import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useRescheduleReminderProps {
  noteId: number;
}

export function useRescheduleReminder({ noteId }: useRescheduleReminderProps) {
  return useMutation({
    mutationKey: ["reschedule-reminder", noteId],
    mutationFn: async (remindAt: Date) => {
      const fetcher = patchFetcher(`/notes/${noteId}/reminders/pending`);
      return await fetcher(JSON.stringify({ remind_at: remindAt.toISOString() }));
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
      context.client.invalidateQueries({ queryKey: ["notes-calendar"] });
    },
  });
}
