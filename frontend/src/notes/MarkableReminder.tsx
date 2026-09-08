import type { NoteReminder } from "./new-note-form/types";

import { CheckIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatRelative } from "date-fns";
import { useUpdateNote } from "./hooks/useUpdateNote";

interface MarkableReminderProps {
  noteId: number;
  reminder: NoteReminder;
}

export function MarkableReminder({ noteId, reminder }: MarkableReminderProps) {
  const { mutateAsync: updateNote, isPending } = useUpdateNote({ noteId });
  const reviewNote = async () => {
    try {
      await updateNote({
        reviewed_at: new Date(),
      });
    } catch (error) {
      console.error("error:", error);
      toast.add({
        type: "error",
        priority: "high",
        description: "Failed to update",
      });
    }
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="outline">{formatRelative(reminder.remind_at, new Date())}</Button>}
      />

      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <CheckIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Did you review it?</AlertDialogTitle>
          <AlertDialogDescription>Did you review this note item today?</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Not Yet</AlertDialogCancel>
          <AlertDialogAction onClick={reviewNote} disabled={isPending}>
            Yes, Reviewed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
