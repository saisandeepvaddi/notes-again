import { ReviewContainer } from "@/notes/review/ReviewContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/review")({ component: Review });

function Review() {
  return (
    <div>
      <h1 className="text-xl font-semibold mb-4">Review</h1>
      <ReviewContainer />
    </div>
  );
}
