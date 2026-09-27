import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { titleCase } from "@/utils/general";
import { formatDistanceToNowStrict, isToday } from "date-fns";
import { HistoryIcon, PauseIcon } from "lucide-react";
import { MarkableReminder } from "./MarkableReminder";
import { ReschedulePopover } from "./ReschedulePopover";
import type { NoteReminder as NoteReminderType } from "./new-note-form/types";
import { UndoMarkableReminder } from "./UndoMarkableReminder";

interface NoteReminderListProps {
  noteId: number;
  reminders: NoteReminderType[];
  compact?: boolean;
  paused?: boolean;
}

export function NoteReminderList({
  noteId,
  reminders,
  compact = false,
  paused = false,
}: NoteReminderListProps) {
  if (reminders.length === 0) {
    return <span className="text-muted-foreground">No reminders</span>;
  }

  const pending = reminders.find((reminder) => reminder.reviewed_at === null);
  const reviewed = reminders
    .filter((reminder) => reminder.reviewed_at !== null)
    .sort((a, b) => (b.reviewed_at?.getTime() ?? 0) - (a.reviewed_at?.getTime() ?? 0));
  const lastReview = reviewed[0];
  const canUndoLastReview = lastReview?.reviewed_at != null && isToday(lastReview.reviewed_at);

  const pendingBadge = paused ? (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <PauseIcon className="size-2.5" /> Paused
    </Badge>
  ) : (
    pending && <MarkableReminder reminder={pending} />
  );

  if (compact) {
    return <div className="flex items-center gap-1.5">{pendingBadge}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canUndoLastReview && <UndoMarkableReminder reminder={lastReview} />}
      {pendingBadge}
      {pending && !paused && (
        <ReschedulePopover noteId={noteId} currentRemindAt={pending.remind_at} />
      )}
      {reviewed.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                size="sm"
                variant={"outline"}
                aria-label={`${reviewed.length} past review${reviewed.length === 1 ? "" : "s"}`}
                title="Review history"
                className="tabular-nums"
              >
                <HistoryIcon />
                {reviewed.length}
              </Button>
            }
          />
          <PopoverContent>
            <ul className="list-none flex flex-col gap-2">
              {reviewed.map((reminder) => (
                <li key={reminder.id} className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {reminder.rating ? titleCase(reminder.rating) : "Reviewed"}
                  </Badge>
                  {reminder.reviewed_at
                    ? `${formatDistanceToNowStrict(reminder.reviewed_at)} ago`
                    : null}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
