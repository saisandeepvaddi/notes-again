import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNowStrict, formatRelative, isToday } from "date-fns";
import type { NoteReminder } from "./new-note-form/types";

interface NoteReminderListProps {
  reminders: NoteReminder[];
}

export function NoteReminderList({ reminders }: NoteReminderListProps) {
  const count = reminders.length;
  if (count === 0) {
    return <>No Reminders</>;
  }
  const first = reminders[0];
  const isFirstReminderToday = isToday(first.remind_at);
  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={"secondary"}
        className={
          reminders[0].reviewed_at ? "text-green-600" : isFirstReminderToday ? "text-blue-600" : ""
        }
      >
        {formatRelative(reminders[0].remind_at, new Date())}
      </Badge>
      <Popover>
        <PopoverTrigger
          render={
            <Button size="xs" variant={"outline"}>
              + {reminders.length} more
            </Button>
          }
        />
        <PopoverContent>
          <ul className="list-disc flex flex-col gap-2">
            {reminders.slice(1).map((reminder) => {
              return (
                <li key={reminder.id} className="text-zinc-700">
                  in {formatDistanceToNowStrict(reminder.remind_at)}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
