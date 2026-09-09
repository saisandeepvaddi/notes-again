import { NewNoteButton } from "@/notes/NewNoteButton";
import { DueTodayContainer } from "@/notes/due-today/DueTodayContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="flex flex-col gap-4">
      <NewNoteButton />
      <DueTodayContainer />
    </div>
  );
}
