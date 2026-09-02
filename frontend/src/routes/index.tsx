import NotesList from "@/notes/notes-list/NotesList";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="p-8">
      <Link
        to="/notes/new"
        className="p-1 px-2 rounded-sm bg-black text-white dark:bg-white dark:text-black cursor-pointer flex items-center"
      >
        <PlusIcon /> New Note
      </Link>
      <NotesList />
    </div>
  );
}
