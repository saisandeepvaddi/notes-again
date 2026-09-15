import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";
import type { Rating } from "../new-note-form/types";

interface useUpdateReminderProps {
  reminderId: number;
}

type UpdateReminderData = { action: "review"; rating: Rating } | { action: "undo_review" };

export function useUpdateReminder({ reminderId }: useUpdateReminderProps) {
  return useMutation({
    mutationKey: ["note-update", reminderId],
    mutationFn: async (data: UpdateReminderData) => {
      const fetcher = patchFetcher(`/notes/reminders/${reminderId}/now`);
      return await fetcher(JSON.stringify(data));
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({ queryKey: ["notes"] });
      context.client.invalidateQueries({ queryKey: ["due-notes"] });
    },
  });
}
