import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";
import type { NoteReminder } from "./new-note-form/types";

interface NoteReminderListProps {
  reminders: NoteReminder[];
}

export function NoteReminderList({ reminders }: NoteReminderListProps) {
  return (
    <>
      <Badge>{formatDistanceToNowStrict(reminders[0].remind_at)}</Badge>
      {reminders.slice(1).map((reminder) => {
        return <div>{reminder.remind_at.toDateString()}</div>;
      })}
    </>
  );
}
