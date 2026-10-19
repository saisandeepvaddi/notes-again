import { PageHeader } from "@/components/PageHeader";
import { ImportContainer } from "@/imports/ImportContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "Import · Notes Again" }] }),
  component: ImportPage,
});

function ImportPage() {
  return (
    <div>
      <PageHeader title="Import" description="Bring in notes and decks from a JSON file" />
      <ImportContainer />
    </div>
  );
}
