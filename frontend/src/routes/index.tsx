import { Button } from "@/components/ui/button";
import { NotesListContainer } from "@/notes/notes-list/NotesListContainer";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div>
      <Button
        render={
          <Link
            to="/notes/new"
            className="p-1 px-2 rounded-sm bg-black text-white dark:bg-white dark:text-black cursor-pointer flex items-center w-20"
          >
            <PlusIcon /> New Note
          </Link>
        }
      ></Button>

      <NotesListContainer />
    </div>
  );
}
