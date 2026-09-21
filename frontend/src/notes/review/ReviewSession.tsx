import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NoteContent } from "../NoteContent";
import { RatingButtons } from "../RatingButtons";
import { fetchDueNotes, useDueNotes } from "../notes-list/useDueNotes";

// Works through one batch of due notes at a time. After a bulk import
// thousands can be due at once, so the session holds only the current batch
// in memory and asks the server for the next one when it runs out; `remaining`
// is the server's total, not the batch size.
export function ReviewSession() {
  const queryClient = useQueryClient();
  const { data: firstPage } = useDueNotes();
  const [queue, setQueue] = useState(firstPage.items);
  const [remaining, setRemaining] = useState(firstPage.total);
  const [loadingMore, setLoadingMore] = useState(false);
  const current = queue[0];

  const advance = async () => {
    const rest = queue.slice(1);
    const left = remaining - 1;
    setQueue(rest);
    setRemaining(left);
    if (rest.length > 0 || left <= 0) return;

    setLoadingMore(true);
    try {
      // staleTime 0: the note just rated must not be in what comes back.
      const page = await queryClient.fetchQuery({
        queryKey: ["due-notes"],
        queryFn: fetchDueNotes,
        staleTime: 0,
      });
      setQueue(page.items);
      setRemaining(page.total);
    } catch (error) {
      console.error("error:", error);
      toast.add({ type: "error", priority: "high", description: "Failed to load more notes" });
    } finally {
      setLoadingMore(false);
    }
  };

  if (loadingMore) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner /> Loading the next batch...
      </div>
    );
  }

  if (!current) {
    return <p className="text-muted-foreground">All caught up — nothing left to review.</p>;
  }

  const pendingReminder = current.reminders.find((reminder) => reminder.reviewed_at === null);

  return (
    <div className="flex flex-col gap-4 w-full max-w-2xl">
      <p className="text-muted-foreground">{remaining.toLocaleString()} left</p>
      <Card>
        <CardHeader className="font-semibold text-xl">{current.name}</CardHeader>
        <CardContent>
          <NoteContent markdown={current.content} />
        </CardContent>
        <CardFooter>
          {pendingReminder && (
            <div className="flex w-full flex-col gap-2">
              <p className="text-sm font-medium">How well did you remember this?</p>
              <RatingButtons reminderId={pendingReminder.id} onRated={advance} />
            </div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
