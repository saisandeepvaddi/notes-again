import { NoteGridSkeleton } from "@/components/PageSkeletons";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { TrashList } from "./TrashList";

export function TrashContainer() {
  return (
    <div className="py-2 w-full h-full">
      <Suspense fallback={<NoteGridSkeleton label="Loading trash" />}>
        <ClientOnly>
          <TrashList />
        </ClientOnly>
      </Suspense>
    </div>
  );
}
