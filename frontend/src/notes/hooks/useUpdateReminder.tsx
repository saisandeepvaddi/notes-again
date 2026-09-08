import { patchFetcher } from "@/utils/fetchers";
import { useMutation } from "@tanstack/react-query";

interface useUpdateReminderProps {
  reminderId: number;
}

interface UpdateReminderData {
  action: "review" | "undo_review";
}

export function useUpdateReminder({ reminderId }: useUpdateReminderProps) {
  return useMutation({
    mutationKey: ["note-update", reminderId],
    mutationFn: async ({ action }: UpdateReminderData) => {
      const fetcher = patchFetcher(`/notes/reminders/${reminderId}/now`);
      const newNote = await fetcher(
        JSON.stringify({
          action,
        }),
      );
      console.log("newNote:", newNote);
      return newNote;
    },
    onSettled(_data, _error, _vars, _result, context) {
      context.client.invalidateQueries({
        queryKey: ["notes"],
      });
    },
  });
}
