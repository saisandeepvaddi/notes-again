import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CaretUpIcon } from "@phosphor-icons/react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { useId, useState } from "react";
import type { NoteItem } from "../new-note-form/types";
import { NoteReminderList } from "../NoteReminderList";
import { RATING_BADGE_CLASSES, RATING_OPTIONS } from "../rating";
import { ReviewStatusPicker } from "../ReviewStatusPicker";
import type { ReviewStatus } from "../reviewStatus";

const ALGORITHM_LABELS: Record<NoteItem["algorithm"], string> = {
  fsrs: "FSRS",
  sm2: "SM-2",
};

const ratingOption = (rating: string | null) =>
  RATING_OPTIONS.find((option) => option.value === rating);

interface NoteFooterProps {
  note: NoteItem;
  status: ReviewStatus;
  onStatusChange: (status: ReviewStatus) => void;
  statusDisabled: boolean;
  wordCount: number;
}

export function NoteFooter({
  note,
  status,
  onStatusChange,
  statusDisabled,
  wordCount,
}: NoteFooterProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const reviews = note.reminders
    .filter((reminder) => reminder.reviewed_at !== null)
    .sort((a, b) => (b.reviewed_at?.getTime() ?? 0) - (a.reviewed_at?.getTime() ?? 0));

  return (
    <footer className="sticky bottom-0 z-20 mt-auto border-t bg-background px-4 md:px-8">
      <div
        data-open={open}
        className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-[open=true]:grid-rows-[1fr]"
      >
        <section
          id={panelId}
          aria-label="Note details"
          inert={!open}
          className="min-h-0 overflow-hidden"
        >
          <div className="mx-auto grid max-w-[44rem] gap-x-10 gap-y-4 pt-4 pb-3 text-xs sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <div className="sm:hidden">
              <ReviewStatusPicker
                value={status}
                onChange={onStatusChange}
                disabled={statusDisabled}
              />
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] content-start gap-x-4 gap-y-1.5">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="tabular-nums" title={format(note.created_at, "PPpp")}>
                {format(note.created_at, "MMM d, yyyy")}
              </dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="tabular-nums" title={format(note.updated_at, "PPpp")}>
                {format(note.updated_at, "MMM d, yyyy")}
              </dd>
              <dt className="text-muted-foreground">Scheduler</dt>
              <dd>{ALGORITHM_LABELS[note.algorithm]}</dd>
            </dl>
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className="flex items-baseline gap-2 font-heading text-xs font-medium">
                Review history
                {reviews.length > 0 && (
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {reviews.length}
                  </span>
                )}
              </h3>
              {reviews.length > 0 ? (
                <ol className="flex max-h-32 flex-col gap-1.5 overflow-y-auto">
                  {reviews.map((reminder) => {
                    const option = ratingOption(reminder.rating);
                    return (
                      <li key={reminder.id} className="flex items-center gap-3">
                        <time
                          dateTime={reminder.reviewed_at?.toISOString()}
                          title={
                            reminder.reviewed_at ? format(reminder.reviewed_at, "PPpp") : undefined
                          }
                          className="w-24 text-muted-foreground tabular-nums"
                        >
                          {reminder.reviewed_at ? format(reminder.reviewed_at, "MMM d, yyyy") : ""}
                        </time>
                        {option ? (
                          <Badge variant="secondary" className={RATING_BADGE_CLASSES[option.value]}>
                            {option.label}
                          </Badge>
                        ) : (
                          <span>Reviewed</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-muted-foreground">No reviews yet.</p>
              )}
            </div>
          </div>
        </section>
      </div>
      <div className="flex items-center gap-3 py-1.5">
        <div className="hidden sm:block">
          <ReviewStatusPicker value={status} onChange={onStatusChange} disabled={statusDisabled} />
        </div>
        {status !== "note-only" && (
          <NoteReminderList
            noteId={note.id}
            reminders={note.reminders}
            status={status}
            showHistory={false}
          />
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <span className="hidden sm:inline">
            {wordCount.toLocaleString()} word{wordCount === 1 ? "" : "s"}
          </span>
          <span className="hidden sm:inline" title={format(note.updated_at, "PPpp")}>
            Edited {formatDistanceToNowStrict(note.updated_at, { addSuffix: true })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label="Note details"
            onClick={() => setOpen((value) => !value)}
            className="-mr-2 text-muted-foreground"
          >
            Details
            <CaretUpIcon
              className={cn(
                "size-3 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                open && "rotate-180",
              )}
            />
          </Button>
        </div>
      </div>
    </footer>
  );
}
