import type { NoteReminder } from "./new-note-form/types";

import { CheckIcon, ClockCountdownIcon, ClockIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WARNING_TEXT_CLASSES } from "@/lib/statusColors";
import { cn } from "@/lib/utils";
import { differenceInCalendarDays, formatDistanceToNowStrict, isFuture } from "date-fns";
import { useState } from "react";
import { RatingButtons } from "./RatingButtons";

interface MarkableReminderProps {
  reminder: NoteReminder;
}

export function MarkableReminder({ reminder }: MarkableReminderProps) {
  const [open, setOpen] = useState(false);
  const daysOverdue = Math.max(0, differenceInCalendarDays(new Date(), reminder.remind_at));
  const isOverdue = daysOverdue > 0;
  const isUpcoming = !isOverdue && isFuture(reminder.remind_at);
  const overdueLabel = `Due ${daysOverdue} day${daysOverdue === 1 ? "" : "s"} ago`;
  const dueIn = formatDistanceToNowStrict(reminder.remind_at);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        delay={300}
        closeDelay={150}
        render={
          <Button size="sm" variant={isOverdue || isUpcoming ? "secondary" : "ghost"}>
            {isOverdue ? (
              <>
                <ClockCountdownIcon className={WARNING_TEXT_CLASSES} />
                {overdueLabel}
              </>
            ) : isUpcoming ? (
              <>
                <ClockIcon />
                Next in {dueIn}
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
      <PopoverContent align="start" className="w-80 gap-2 p-2">
        <p className="px-0.5 text-muted-foreground">
          {isOverdue ? (
            <span className={cn("font-medium", WARNING_TEXT_CLASSES)}>{overdueLabel}. </span>
          ) : isUpcoming ? (
            <span className="font-medium text-foreground">Not due for {dueIn}. </span>
          ) : null}
          How well did you remember it?
        </p>
        <RatingButtons reminderId={reminder.id} onRated={() => setOpen(false)} shortcuts />
      </PopoverContent>
    </Popover>
  );
}
