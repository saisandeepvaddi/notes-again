export const REVIEW_STATUSES = ["active", "paused", "note-only"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  active: "In review",
  paused: "Paused",
  "note-only": "Note only",
};

export function reviewStatusOf(note: { in_review: boolean; paused_at: Date | null }): ReviewStatus {
  if (!note.in_review) return "note-only";
  return note.paused_at !== null ? "paused" : "active";
}

export function newNoteReviewFields(status: ReviewStatus) {
  return { paused: status === "paused", in_review: status !== "note-only" };
}
