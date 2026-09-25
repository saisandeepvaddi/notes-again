import { OrganizeSkeleton } from "@/components/PageSkeletons";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { OrganizeList } from "./OrganizeList";

export function OrganizeContainer() {
  return (
    <div className="py-2 w-full max-w-3xl">
      <Suspense fallback={<OrganizeSkeleton />}>
        <ClientOnly>
          <OrganizeList />
        </ClientOnly>
      </Suspense>
    </div>
  );
}
