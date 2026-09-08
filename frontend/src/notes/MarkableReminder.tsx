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
import { useState } from "react";
import { useUpdateReminder } from "./hooks/useUpdateReminder";

interface MarkableReminderProps {
  reminder: NoteReminder;
}

export function MarkableReminder({ reminder }: MarkableReminderProps) {
  const { mutateAsync: updateNote, isPending } = useUpdateReminder({ reminderId: reminder.id });
  const [open, setOpen] = useState(false);
  const reviewNote = async () => {
    try {
      await updateNote({
        action: "review",
      });
      setOpen(false);
    } catch (error) {
      console.error("error:", error);
      setOpen(false);
      toast.add({
        type: "error",
        priority: "high",
        description: "Failed to update",
      });
    }
  };
  return (
    <AlertDialog open={open}>
      <AlertDialogTrigger
        render={
          <Button variant="outline" onClick={() => setOpen(true)}>
            {formatRelative(reminder.remind_at, new Date())}
          </Button>
        }
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
          <AlertDialogCancel onClick={() => setOpen(false)} disabled={isPending}>
            Not Yet
          </AlertDialogCancel>
          <AlertDialogAction onClick={reviewNote} disabled={isPending}>
            Yes, Reviewed
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
