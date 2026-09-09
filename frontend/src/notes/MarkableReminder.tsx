import type { NoteReminder } from "./new-note-form/types";

import { CheckIcon } from "lucide-react";

import {
  AlertDialog,
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
import { formatRelative } from "date-fns";
import { useState } from "react";
import { RatingButtons } from "./RatingButtons";

interface MarkableReminderProps {
  reminder: NoteReminder;
}

export function MarkableReminder({ reminder }: MarkableReminderProps) {
  const [open, setOpen] = useState(false);
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
          <AlertDialogTitle>How did it go?</AlertDialogTitle>
          <AlertDialogDescription>
            Rate how well you recalled this note. It'll come back sooner or later depending on your
            answer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <RatingButtons reminderId={reminder.id} onRated={() => setOpen(false)} />
          <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
