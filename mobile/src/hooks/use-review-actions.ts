import { RATING_OPTIONS } from "@web/notes/rating";
import type { NoteItem, Rating } from "@web/notes/new-note-form/types";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { useState } from "react";
import { pendingReminder, refreshReviews, useRateReminder, useUndoReview } from "@/api/notes";

export interface LastRating {
  note: NoteItem;
  reminderId: number;
  message: string;
}

export function useReviewActions() {
  const queryClient = useQueryClient();
  const rateMutation = useRateReminder();
  const undoMutation = useUndoReview();
  const [last, setLast] = useState<LastRating | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rate = async (note: NoteItem, rating: Rating): Promise<boolean> => {
    const reminder = pendingReminder(note);
    if (!reminder) return false;
    setError(null);
    try {
      const updated = await rateMutation.mutateAsync({ reminderId: reminder.id, rating });
      const next = pendingReminder(updated);
      const label = RATING_OPTIONS.find((option) => option.value === rating)?.label ?? rating;
      setLast({
        note,
        reminderId: reminder.id,
        message: next
          ? `Rated ${label} · next in ${formatDistanceToNowStrict(next.remind_at)}`
          : `Rated ${label}`,
      });
      refreshReviews(queryClient);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't save the rating");
      return false;
    }
  };

  const undo = async (): Promise<NoteItem | null> => {
    if (!last) return null;
    setError(null);
    try {
      await undoMutation.mutateAsync({ reminderId: last.reminderId });
      const restored = last.note;
      setLast(null);
      return restored;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't undo that review");
      return null;
    }
  };

  return {
    rate,
    undo,
    last,
    dismiss: () => setLast(null),
    error,
    pending: rateMutation.isPending || undoMutation.isPending,
  };
}
