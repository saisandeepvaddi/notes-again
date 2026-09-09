import { TrashContainer } from "@/notes/trash/TrashContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/trash")({ component: Trash });

function Trash() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Trash</h1>
      <TrashContainer />
    </div>
  );
}
