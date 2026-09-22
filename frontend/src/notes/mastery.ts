import type { NoteItem } from "./new-note-form/types";

// Experimental (Rating Ladder direction): a note's recall strength, entirely
// derived client-side from its own review history -- no backend field, no
// new concept the server needs to know about. Distinct from the note's own
// Easy/Medium/Hard difficulty tag (a sticky, manually-set label) the same
// way a review Rating already is: this is "how well you've actually been
// remembering it lately," not a subject-matter label.
//
// Counts the consecutive most-recent reviews rated "good" or "easy",
// stopping at the first "again"/"hard" (or an old/unrecognized rating
// string) or at the start of history. A single "again" resets the streak to
// zero -- forgetting something really does undo progress, so the tier drops
// with it rather than remembering a high-water mark.
export type MasteryTier = "new" | "learning" | "familiar" | "solid" | "strong" | "mastered";

export const MASTERY_TIERS: { tier: MasteryTier; label: string; minStreak: number }[] = [
  { tier: "new", label: "New", minStreak: 0 },
  { tier: "learning", label: "Learning", minStreak: 1 },
  { tier: "familiar", label: "Familiar", minStreak: 3 },
  { tier: "solid", label: "Solid", minStreak: 5 },
  { tier: "strong", label: "Strong", minStreak: 8 },
  { tier: "mastered", label: "Mastered", minStreak: 12 },
];

// Ladder colors: gray -> green -> cyan -> blue -> violet -> orange/red, the
// same rising-stakes progression competitive-judge rating systems use --
// borrowed as a color grammar for "remembered reliably over time," not as a
// claim this app is about competitive programming or any one subject.
export const MASTERY_TIER_CLASSES: Record<MasteryTier, string> = {
  new: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-400",
  learning: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
  familiar: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-400",
  solid: "bg-blue-500/15 text-blue-800 dark:text-blue-400",
  strong: "bg-violet-500/15 text-violet-800 dark:text-violet-400",
  mastered: "bg-orange-500/15 text-orange-800 dark:text-orange-400",
};

export const MASTERY_RING_CLASSES: Record<MasteryTier, string> = {
  new: "ring-zinc-400/40",
  learning: "ring-emerald-500/50",
  familiar: "ring-cyan-500/50",
  solid: "ring-blue-500/50",
  strong: "ring-violet-500/50",
  mastered: "ring-orange-500/60",
};

export function getMasteryStreak(note: Pick<NoteItem, "reminders">): number {
  const reviewed = note.reminders
    .filter((reminder) => reminder.reviewed_at != null)
    .sort((a, b) => (b.reviewed_at?.getTime() ?? 0) - (a.reviewed_at?.getTime() ?? 0));

  let streak = 0;
  for (const reminder of reviewed) {
    if (reminder.rating === "good" || reminder.rating === "easy") {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function getMasteryTier(note: Pick<NoteItem, "reminders">): MasteryTier {
  const streak = getMasteryStreak(note);
  let current: MasteryTier = "new";
  for (const step of MASTERY_TIERS) {
    if (streak >= step.minStreak) {
      current = step.tier;
    }
  }
  return current;
}

export function getMasteryLabel(tier: MasteryTier): string {
  return MASTERY_TIERS.find((step) => step.tier === tier)?.label ?? "New";
}
