import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { TrashList } from "./TrashList";

export function TrashContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <TrashList />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
