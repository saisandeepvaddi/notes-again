import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { titleCase } from "@/utils/general";
import { formatDistanceToNowStrict, isFuture, isToday } from "date-fns";
import { MarkableReminder } from "./MarkableReminder";
import { NoteReminder } from "./NoteReminder";
import type { NoteReminder as NoteReminderType } from "./new-note-form/types";
import { UndoMarkableReminder } from "./UndoMarkableReminder";

interface NoteReminderListProps {
  reminders: NoteReminderType[];
}

export function NoteReminderList({ reminders }: NoteReminderListProps) {
  if (reminders.length === 0) {
    return <>No Reminders</>;
  }

  const pending = reminders.find((reminder) => reminder.reviewed_at === null);
  const reviewed = reminders
    .filter((reminder) => reminder.reviewed_at !== null)
    .sort((a, b) => (b.reviewed_at?.getTime() ?? 0) - (a.reviewed_at?.getTime() ?? 0));
  const lastReview = reviewed[0];
  const canUndoLastReview = lastReview?.reviewed_at != null && isToday(lastReview.reviewed_at);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canUndoLastReview && <UndoMarkableReminder reminder={lastReview} />}
      {pending &&
        (isFuture(pending.remind_at) ? (
          <NoteReminder remindAt={pending.remind_at} />
        ) : (
          <MarkableReminder reminder={pending} />
        ))}
      {reviewed.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <Button size="sm" variant={"outline"}>
                {reviewed.length} reviewed
              </Button>
            }
          />
          <PopoverContent>
            <ul className="list-none flex flex-col gap-2">
              {reviewed.map((reminder) => (
                <li key={reminder.id} className="text-zinc-700 flex items-center gap-2">
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
