import { PageHeader } from "@/components/PageHeader";
import { ReviewContainer } from "@/notes/review/ReviewContainer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/review")({ component: Review });

function Review() {
  return (
    <div>
      <PageHeader title="Review" />
      <ReviewContainer />
    </div>
  );
}
