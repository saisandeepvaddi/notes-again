import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { differenceInCalendarDays } from "date-fns";
import { useDueNotes } from "../notes-list/useDueNotes";

export function DueToday() {
  const { data: notes } = useDueNotes();

  if (notes.length === 0) {
    return <p className="text-muted-foreground">Nothing due right now. Nice work.</p>;
  }

  const overdueCount = notes.filter((note) => {
    const pending = note.reminders.find((reminder) => reminder.reviewed_at === null);
    return pending && differenceInCalendarDays(new Date(), pending.remind_at) > 0;
  }).length;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border p-4">
      <div>
        <p className="text-2xl font-semibold">{notes.length}</p>
        <p className="text-xs text-muted-foreground">
          note{notes.length === 1 ? "" : "s"} due for review
          {overdueCount > 0 && <span className="text-destructive"> · {overdueCount} overdue</span>}
        </p>
      </div>
      <Button nativeButton={false} render={<Link to="/review" />}>
        Start Review
      </Button>
    </div>
  );
}
