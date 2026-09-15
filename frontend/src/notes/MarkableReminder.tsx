import type { NoteReminder } from "./new-note-form/types";

import { AlertTriangleIcon, CheckIcon, ClockIcon } from "lucide-react";

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
import { differenceInCalendarDays, formatDistanceToNowStrict, isFuture } from "date-fns";
import { useState } from "react";
import { RatingButtons } from "./RatingButtons";

interface MarkableReminderProps {
  reminder: NoteReminder;
}

// Reviewing is always available, not gated on the reminder actually being
// due -- "isUpcoming" just changes the copy/urgency, not whether the rating
// dialog opens.
export function MarkableReminder({ reminder }: MarkableReminderProps) {
  const [open, setOpen] = useState(false);
  const daysOverdue = Math.max(0, differenceInCalendarDays(new Date(), reminder.remind_at));
  const isOverdue = daysOverdue > 0;
  const isUpcoming = !isOverdue && isFuture(reminder.remind_at);

  return (
    <AlertDialog open={open}>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant={isOverdue ? "destructive" : isUpcoming ? "secondary" : "outline"}
            onClick={() => setOpen(true)}
          >
            {isOverdue ? (
              <>
                <AlertTriangleIcon />
                {daysOverdue} day{daysOverdue === 1 ? "" : "s"} overdue
              </>
            ) : isUpcoming ? (
              <>
                <ClockIcon />
                Next review in {formatDistanceToNowStrict(reminder.remind_at)}
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
            {isOverdue ? <AlertTriangleIcon /> : isUpcoming ? <ClockIcon /> : <CheckIcon />}
          </AlertDialogMedia>
          <AlertDialogTitle>
            {isOverdue
              ? `${daysOverdue} day${daysOverdue === 1 ? "" : "s"} overdue`
              : isUpcoming
                ? "Review early?"
                : "How did it go?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isUpcoming
              ? "This note isn't due yet, but you can review it now anyway — that still updates its schedule."
              : "Rate how well you remembered this. This schedules the next review."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <RatingButtons
          reminderId={reminder.id}
          onRated={() => setOpen(false)}
          className="grid-cols-2"
        />
        <AlertDialogFooter className="grid-cols-1">
          <AlertDialogCancel onClick={() => setOpen(false)}>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
