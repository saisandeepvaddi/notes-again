import { toast } from "@/components/ui/toast";
import { patchFetcher } from "@/utils/fetchers";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { NoteItemSchema, type Rating } from "../new-note-form/types";
import { RATING_OPTIONS } from "../rating";
import { useUpdateReminder } from "./useUpdateReminder";

interface UseRateReminderProps {
  reminderId: number;
  onUndone?: () => void;
}

export function useRateReminder({ reminderId, onUndone }: UseRateReminderProps) {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useUpdateReminder({ reminderId });

  const undo = async (toastId: string) => {
    toast.close(toastId);
    try {
      await patchFetcher(`/notes/reminders/${reminderId}/now`)(
        JSON.stringify({ action: "undo_review" }),
      );
      onUndone?.();
      toast.add({ type: "info", description: "Review undone. The note is due again." });
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Couldn't undo that review" });
    } finally {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["due-notes"] });
    }
  };

  const rate = async (rating: Rating): Promise<boolean> => {
    try {
      const note = NoteItemSchema.parse(await mutateAsync({ action: "review", rating }));
      const next = note.reminders.find((reminder) => reminder.reviewed_at === null);
      const label = RATING_OPTIONS.find((option) => option.value === rating)?.label ?? rating;
      const toastId = toast.add({
        type: "success",
        title: `Rated ${label}`,
        description: next
          ? `Next review in ${formatDistanceToNowStrict(next.remind_at)}`
          : undefined,
        timeout: 8000,
        actionProps: { children: "Undo", onClick: () => undo(toastId) },
      });
      return true;
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to save the rating" });
      return false;
    }
  };

  return { rate, isPending };
}
