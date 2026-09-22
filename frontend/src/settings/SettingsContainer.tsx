import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { ApiTokens } from "./api-tokens/ApiTokens";
import { SettingsForm } from "./SettingsForm";

export function SettingsContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <SettingsForm />
          <div className="mt-8">
            <ApiTokens />
          </div>
        </ClientOnly>
      </div>
    </Suspense>
  );
}
