import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { OrganizeList } from "./OrganizeList";

export function OrganizeContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full max-w-3xl">
        <ClientOnly>
          <OrganizeList />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
