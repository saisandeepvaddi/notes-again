import { PageHeader } from "@/components/PageHeader";
import { SettingsContainer } from "@/settings/SettingsContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="App-wide preferences" />
      <SettingsContainer />
    </div>
  );
}
