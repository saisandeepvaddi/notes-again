import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { SettingsForm } from "./SettingsForm";

export function SettingsContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <SettingsForm />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
