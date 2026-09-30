import { SettingsSkeleton } from "@/components/PageSkeletons";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { ApiTokens } from "./api-tokens/ApiTokens";
import { SettingsForm } from "./SettingsForm";
import { SignInSettings } from "./sign-in/SignInSettings";

export function SettingsContainer() {
  return (
    <div className="py-2 w-full h-full">
      <Suspense fallback={<SettingsSkeleton />}>
        <ClientOnly>
          <SettingsForm />
          <div className="mt-8">
            <SignInSettings />
          </div>
          <div className="mt-8">
            <ApiTokens />
          </div>
        </ClientOnly>
      </Suspense>
    </div>
  );
}
