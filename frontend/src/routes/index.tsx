import { PageHeader } from "@/components/PageHeader";
import { ReviewCalendarContainer } from "@/notes/calendar/ReviewCalendarContainer";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Home" description="What's due for review" actions={<NewNoteButton />} />
      <ReviewCalendarContainer />
    </div>
  );
}
