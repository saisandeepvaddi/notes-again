// Temporary: lets the two visual-direction experiments (Rating Ladder,
// Committed Canon) live side by side in one running app so they can be
// compared before either ships. Strip this file, its call sites, and the
// `[data-experiment=...]` CSS blocks once a direction is chosen (or dropped
// entirely if the default ships unchanged).
export type ExperimentId = "default" | "rating-ladder" | "canon";

const STORAGE_KEY = "experiment";

export const EXPERIMENT_OPTIONS: { value: ExperimentId; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "rating-ladder", label: "Rating Ladder" },
  { value: "canon", label: "Canon+" },
];

export function getStoredExperiment(): ExperimentId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "rating-ladder" || stored === "canon" || stored === "default") {
      return stored;
    }
  } catch {
    // localStorage unavailable -- fall through to default.
  }
  return "default";
}

export function storeExperiment(id: ExperimentId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export function applyExperiment(id: ExperimentId) {
  if (id === "default") {
    document.documentElement.removeAttribute("data-experiment");
  } else {
    document.documentElement.setAttribute("data-experiment", id);
  }
}
