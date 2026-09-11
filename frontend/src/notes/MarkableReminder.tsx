import type { Difficulty, NoteReminder } from "./new-note-form/types";

import { AlertTriangleIcon, CheckIcon } from "lucide-react";

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
import { differenceInCalendarDays } from "date-fns";
import { useState } from "react";
import { RatingButtons } from "./RatingButtons";

interface MarkableReminderProps {
  reminder: NoteReminder;
  currentDifficulty?: Difficulty;
}

export function MarkableReminder({ reminder, currentDifficulty }: MarkableReminderProps) {
  const [open, setOpen] = useState(false);
  const daysOverdue = Math.max(0, differenceInCalendarDays(new Date(), reminder.remind_at));
  const isOverdue = daysOverdue > 0;

  return (
    <AlertDialog open={open}>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant={isOverdue ? "destructive" : "outline"}
            onClick={() => setOpen(true)}
          >
            {isOverdue ? (
              <>
                <AlertTriangleIcon />
                {daysOverdue} day{daysOverdue === 1 ? "" : "s"} overdue
              </>
            ) : (
              <>
                <CheckIcon />
                Review now
              </>
            )}
          </Button>
        }
      />

      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className={isOverdue ? "bg-destructive/10 text-destructive" : ""}>
            {isOverdue ? <AlertTriangleIcon /> : <CheckIcon />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {isOverdue
              ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`
              : "How difficult was this?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Pick a difficulty to mark it reviewed. This also sets the note's difficulty tag and
            schedules the next review — easier means longer until it comes back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RatingButtons
          reminderId={reminder.id}
          currentDifficulty={currentDifficulty}
          onRated={() => setOpen(false)}
          className="grid grid-cols-3 gap-2"
        />
        <AlertDialogFooter className="grid-cols-1">
          <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
