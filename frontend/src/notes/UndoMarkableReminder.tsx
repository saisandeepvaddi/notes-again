import type { NoteReminder } from "./new-note-form/types";

import { CheckIcon, UndoIcon } from "lucide-react";

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

interface UndoMarkableReminderProps {
  reminder: NoteReminder;
}

export function UndoMarkableReminder({ reminder }: UndoMarkableReminderProps) {
  const { mutateAsync: updateNote, isPending } = useUpdateReminder({ reminderId: reminder.id });
  const [open, setOpen] = useState(false);
  const reviewNote = async () => {
    try {
      await updateNote({
        action: "undo_review",
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
          <Button
            variant="outline"
            onClick={() => setOpen(true)}
            className={"bg-green-300 outline-green-300 border-green-400"}
          >
            <CheckIcon />
            {formatRelative(reminder.remind_at, new Date())}
          </Button>
        }
      />

      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <UndoIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Undo Review?</AlertDialogTitle>
          <AlertDialogDescription>
            You marked it as reviewed. Do you want to undo it?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpen(false)} disabled={isPending}>
            No
          </AlertDialogCancel>
          <AlertDialogAction onClick={reviewNote} disabled={isPending}>
            Yes, Undo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
