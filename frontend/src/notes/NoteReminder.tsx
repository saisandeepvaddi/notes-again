import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict } from "date-fns";

interface NoteReminderProps {
  remindAt: Date;
}

export function NoteReminder({ remindAt }: NoteReminderProps) {
  return <Badge variant={"secondary"}>Next review in {formatDistanceToNowStrict(remindAt)}</Badge>;
}
