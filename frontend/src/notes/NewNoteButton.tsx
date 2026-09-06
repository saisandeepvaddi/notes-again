import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

export function NewNoteButton() {
  return (
    <Button
      nativeButton={false}
      render={
        <Link to="/notes/new">
          <PlusIcon /> New Note
        </Link>
      }
    />
  );
}
