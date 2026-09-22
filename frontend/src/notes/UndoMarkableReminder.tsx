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
import { SUCCESS_BUTTON_CLASSES } from "@/lib/statusColors";
import { titleCase } from "@/utils/general";
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
            size={"sm"}
            variant="outline"
            onClick={() => setOpen(true)}
            // Was a raw green-300/400 with no dark-mode variant, and an
            // outline-green-300/20 utility that did nothing (Tailwind's
            // outline-color has no effect without an outline-style) --
            // unified to the app's one shared "success" recipe instead.
            className={SUCCESS_BUTTON_CLASSES}
          >
            <CheckIcon />
            Rated {reminder.rating ? titleCase(reminder.rating) : "Reviewed"}
            {reminder.reviewed_at
              ? ` · ${titleCase(formatRelative(reminder.reviewed_at, new Date()))}`
              : ""}
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
            You rated this note "{reminder.rating ? titleCase(reminder.rating) : "Reviewed"}", which
            set its next review date. Undo to make it due again and clear that rating.
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
