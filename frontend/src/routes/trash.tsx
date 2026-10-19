import { PageHeader } from "@/components/PageHeader";
import { TrashContainer } from "@/notes/trash/TrashContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/trash")({
  head: () => ({ meta: [{ title: "Trash · Notes Again" }] }),
  component: Trash,
});

function Trash() {
  return (
    <div>
      <PageHeader title="Trash" />
      <TrashContainer />
    </div>
  );
}
