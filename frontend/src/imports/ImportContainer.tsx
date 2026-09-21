import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { ImportForm } from "./ImportForm";

export function ImportContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <ImportForm />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
