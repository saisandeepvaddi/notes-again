import { PageHeader } from "@/components/PageHeader";
import { OrganizeContainer } from "@/notes/organize/OrganizeContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/organize")({
  head: () => ({ meta: [{ title: "Organize · Notes Again" }] }),
  component: Organize,
});

function Organize() {
  return (
    <div>
      <PageHeader title="Organize" description="Manage your projects and tags" />
      <OrganizeContainer />
    </div>
  );
}
