import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { ImportForm } from "./ImportForm";

export function ImportContainer() {
  return (
    <div className="py-2 w-full h-full">
      <Suspense fallback={null}>
        <ClientOnly>
          <ImportForm />
        </ClientOnly>
      </Suspense>
    </div>
  );
}
