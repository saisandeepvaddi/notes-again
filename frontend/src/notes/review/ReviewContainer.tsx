import { ReviewSkeleton } from "@/components/PageSkeletons";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { ReviewSession } from "./ReviewSession";

export function ReviewContainer() {
  return (
    <div className="py-2 w-full h-full">
      <Suspense fallback={<ReviewSkeleton />}>
        <ClientOnly>
          <ReviewSession />
        </ClientOnly>
      </Suspense>
    </div>
  );
}
