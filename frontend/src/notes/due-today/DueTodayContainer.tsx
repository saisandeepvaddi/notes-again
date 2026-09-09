import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { DueToday } from "./DueToday";

export function DueTodayContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <DueToday />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
