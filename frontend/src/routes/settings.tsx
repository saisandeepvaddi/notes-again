import { PageHeader } from "@/components/PageHeader";
import { SettingsContainer } from "@/settings/SettingsContainer";
import { settingsSearchSchema } from "@/settings/settingsSearch";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({
  validateSearch: settingsSearchSchema,
  component: SettingsPage,
});

function SettingsPage() {
  const { section = "appearance" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <div>
      <PageHeader
        title="Settings"
        description="Appearance, review defaults, sign-in and connections"
      />
      <SettingsContainer
        section={section}
        onSectionChange={(next) => navigate({ search: (prev) => ({ ...prev, section: next }) })}
      />
    </div>
  );
}
