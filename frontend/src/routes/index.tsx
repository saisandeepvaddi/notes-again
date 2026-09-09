import { PageHeader } from "@/components/PageHeader";
import { NewNoteButton } from "@/notes/NewNoteButton";
import { DueTodayContainer } from "@/notes/due-today/DueTodayContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div>
      <PageHeader title="Home" description="What's due for review" actions={<NewNoteButton />} />
      <DueTodayContainer />
    </div>
  );
}
