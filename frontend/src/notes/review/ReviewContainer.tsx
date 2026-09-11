import { ClientOnly } from "@tanstack/react-router";
import { Suspense } from "react";
import { ReviewSession } from "./ReviewSession";

export function ReviewContainer() {
  return (
    <Suspense fallback={<>Loading...</>}>
      <div className="py-2 w-full h-full">
        <ClientOnly>
          <ReviewSession />
        </ClientOnly>
      </div>
    </Suspense>
  );
}
